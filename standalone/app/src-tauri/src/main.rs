use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[derive(Clone, Default)]
struct ExtensionHostState {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewResourceResponse {
    uri: String,
    mime_type: String,
    base64: String,
}

#[tauri::command]
fn host_health() -> &'static str {
    "ok"
}

#[tauri::command]
fn emit_extension_host_message(app: tauri::AppHandle, message: String) -> Result<(), String> {
    app.emit("extension-host-message", message)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn send_extension_host_message(
    state: tauri::State<'_, ExtensionHostState>,
    message: String,
) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&message)
        .map_err(|error| format!("Extension host message is not valid JSON: {error}"))?;

    let mut guard = state
        .stdin
        .lock()
        .map_err(|_| "Extension host stdin lock is poisoned".to_string())?;
    let stdin = guard
        .as_mut()
        .ok_or_else(|| "Extension host stdin is not available".to_string())?;
    stdin
        .write_all(message.trim_end().as_bytes())
        .map_err(|error| error.to_string())?;
    stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn read_webview_resource(
    app: tauri::AppHandle,
    uri: String,
) -> Result<WebviewResourceResponse, String> {
    let standalone_root = resolve_standalone_root(&app)?;
    read_webview_resource_from_root(&standalone_root, &uri)
}

fn read_webview_resource_from_root(
    standalone_root: &Path,
    uri: &str,
) -> Result<WebviewResourceResponse, String> {
    let path = parse_standalone_resource_uri(uri)?;
    let canonical_path = std::fs::canonicalize(&path).map_err(|error| {
        format!(
            "Failed to read webview resource {}: {error}",
            path.display()
        )
    })?;
    let extensions_root = std::fs::canonicalize(standalone_root.join("extensions"))
        .map_err(|error| format!("Failed to resolve extensions root: {error}"))?;

    if !canonical_path.starts_with(&extensions_root) {
        return Err("Webview resource is outside allowed roots".to_string());
    }
    if !canonical_path
        .components()
        .any(|component| component.as_os_str() == std::ffi::OsStr::new("webview"))
    {
        return Err("Webview resource is outside allowed roots".to_string());
    }

    let metadata = std::fs::metadata(&canonical_path).map_err(|error| error.to_string())?;
    if metadata.len() > 16 * 1024 * 1024 {
        return Err("Webview resource exceeds 16 MiB limit".to_string());
    }

    let bytes = std::fs::read(&canonical_path).map_err(|error| error.to_string())?;
    Ok(WebviewResourceResponse {
        uri: uri.to_string(),
        mime_type: mime_type_for_path(&canonical_path).to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

fn parse_standalone_resource_uri(uri: &str) -> Result<PathBuf, String> {
    let rest = uri
        .strip_prefix("standalone-resource://")
        .ok_or_else(|| "Invalid webview resource scheme".to_string())?;
    let (_, encoded_path) = rest
        .split_once('/')
        .ok_or_else(|| "Invalid webview resource URI".to_string())?;
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded_path)
        .map_err(|error| format!("Invalid webview resource path encoding: {error}"))?;
    let path = String::from_utf8(bytes)
        .map_err(|error| format!("Invalid webview resource path UTF-8: {error}"))?;
    Ok(PathBuf::from(path))
}

fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
    {
        "css" => "text/css",
        "gif" => "image/gif",
        "html" => "text/html",
        "jpeg" | "jpg" => "image/jpeg",
        "js" => "text/javascript",
        "json" => "application/json",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ttf" => "font/ttf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn resolve_standalone_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(root) = std::env::var("AIRDB_STANDALONE_ROOT") {
        return Ok(PathBuf::from(root));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(root) = manifest_dir.parent().and_then(|path| path.parent()) {
        let root = root.to_path_buf();
        if root
            .join("extension-host")
            .join("dist")
            .join("main.js")
            .exists()
        {
            return Ok(root);
        }
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    for candidate in [
        resource_dir.clone(),
        resource_dir
            .parent()
            .and_then(|path| path.parent())
            .map(PathBuf::from)
            .unwrap_or_else(|| resource_dir.clone()),
    ] {
        if candidate
            .join("extension-host")
            .join("dist")
            .join("main.js")
            .exists()
        {
            return Ok(candidate);
        }
    }

    Err(
        "Unable to resolve standalone root. Run from standalone/app or set AIRDB_STANDALONE_ROOT."
            .to_string(),
    )
}

fn spawn_extension_host(app: tauri::AppHandle, state: ExtensionHostState) -> Result<(), String> {
    let standalone_root = resolve_standalone_root(&app)?;
    let host_entry = standalone_root
        .join("extension-host")
        .join("dist")
        .join("main.js");
    let extensions_dir = standalone_root.join("extensions");
    let storage_root = standalone_root.join(".data");

    std::fs::create_dir_all(&storage_root).map_err(|error| error.to_string())?;

    let mut child = Command::new("node")
        .arg(&host_entry)
        .env("AIRDB_STANDALONE_EXTENSIONS", &extensions_dir)
        .env("AIRDB_STANDALONE_STORAGE", &storage_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to start extension host at {}: {error}",
                host_entry.display()
            )
        })?;

    let child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Extension host stdin was not captured".to_string())?;
    *state
        .stdin
        .lock()
        .map_err(|_| "Extension host stdin lock is poisoned".to_string())? = Some(child_stdin);

    if let Some(stdout) = child.stdout.take() {
        let app_for_stdout = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if line.trim_start().starts_with('{') {
                    let _ = app_for_stdout.emit("extension-host-message", line);
                } else {
                    let _ = app_for_stdout.emit("host-log", line);
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_for_stderr = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("{line}");
                let _ = app_for_stderr.emit("host-log", line);
            }
        });
    }

    std::thread::spawn(move || {
        if let Ok(status) = child.wait() {
            if !status.success() {
                eprintln!("[extension-host] exited with status {status}");
            }
        }
    });

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(ExtensionHostState::default())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            host_health,
            emit_extension_host_message,
            send_extension_host_message,
            read_webview_resource
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window exists");
            window.emit("host-log", "Tauri backend started")?;
            let state = app.state::<ExtensionHostState>().inner().clone();
            spawn_extension_host(app.handle().clone(), state)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AirDB standalone");
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("airdb-webview-test-{suffix}"));
        fs::create_dir_all(
            root.join("extensions")
                .join("airdb")
                .join("out")
                .join("webview"),
        )
        .unwrap();
        root
    }

    fn resource_uri(path: &std::path::Path) -> String {
        let encoded_path = URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes());
        format!("standalone-resource://panel-1/{encoded_path}")
    }

    #[test]
    fn reads_allowed_webview_resource() {
        let root = temp_root();
        let file = root
            .join("extensions")
            .join("airdb")
            .join("out")
            .join("webview")
            .join("app.js");
        fs::write(&file, "console.log('ok');").unwrap();

        let response = read_webview_resource_from_root(&root, &resource_uri(&file)).unwrap();

        assert_eq!(response.mime_type, "text/javascript");
        assert_eq!(response.base64, "Y29uc29sZS5sb2coJ29rJyk7");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_resource_outside_extensions() {
        let root = temp_root();
        let file = root.join("secret.txt");
        fs::write(&file, "secret").unwrap();

        let error = read_webview_resource_from_root(&root, &resource_uri(&file)).unwrap_err();

        assert!(error.contains("outside allowed roots"));
        fs::remove_dir_all(root).unwrap();
    }
}
