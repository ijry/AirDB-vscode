use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Serialize;
use std::io::{BufRead, BufReader, ErrorKind, Write};
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

fn parse_extension_host_protocol_message(line: &str) -> Option<String> {
    if !line.trim_start().starts_with('{') {
        return None;
    }

    let value = serde_json::from_str::<serde_json::Value>(line).ok()?;
    if is_extension_host_protocol_message(&value) {
        Some(line.to_string())
    } else {
        None
    }
}

fn is_extension_host_protocol_message(value: &serde_json::Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };

    let Some(kind) = object.get("kind").and_then(serde_json::Value::as_str) else {
        return false;
    };
    if object
        .get("group")
        .and_then(serde_json::Value::as_str)
        .is_none()
    {
        return false;
    }
    if let Some(extension_id) = object.get("extensionId") {
        if !extension_id.is_string() {
            return false;
        }
    }

    match kind {
        "request" => object
            .get("id")
            .and_then(serde_json::Value::as_str)
            .is_some()
            && object.contains_key("payload"),
        "response" => object
            .get("id")
            .and_then(serde_json::Value::as_str)
            .is_some()
            && object
                .get("ok")
                .and_then(serde_json::Value::as_bool)
                .is_some(),
        "notification" => object.contains_key("payload"),
        _ => false,
    }
}

#[tauri::command]
fn read_webview_resource(
    app: tauri::AppHandle,
    panel_id: String,
    local_resource_roots: Vec<String>,
    uri: String,
) -> Result<WebviewResourceResponse, String> {
    let standalone_root = resolve_standalone_root(&app)?;
    read_webview_resource_from_root(&standalone_root, &panel_id, &local_resource_roots, &uri)
}

fn read_webview_resource_from_root(
    standalone_root: &Path,
    panel_id: &str,
    local_resource_roots: &[String],
    uri: &str,
) -> Result<WebviewResourceResponse, String> {
    let resource = parse_standalone_resource_uri(uri)?;
    if resource.panel_id != panel_id {
        return Err("Webview resource panel id does not match requesting panel id".to_string());
    }

    let canonical_path = std::fs::canonicalize(&resource.path).map_err(|error| {
        format!(
            "Failed to read webview resource {}: {error}",
            resource.path.display()
        )
    })?;
    let allowed_roots = canonicalize_local_resource_roots(standalone_root, local_resource_roots)?;

    if !allowed_roots
        .iter()
        .any(|root| canonical_path.starts_with(root))
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

struct ParsedWebviewResource {
    panel_id: String,
    path: PathBuf,
}

fn parse_standalone_resource_uri(uri: &str) -> Result<ParsedWebviewResource, String> {
    let rest = uri
        .strip_prefix("standalone-resource://")
        .ok_or_else(|| "Invalid webview resource scheme".to_string())?;
    let (encoded_panel_id, resource_path) = rest
        .split_once('/')
        .ok_or_else(|| "Invalid webview resource URI".to_string())?;
    let panel_id = percent_decode(encoded_panel_id)?;
    if panel_id.is_empty() {
        return Err("Invalid webview resource panel id".to_string());
    }
    let mut segments = resource_path.split('/');
    let encoded_path = segments
        .next()
        .ok_or_else(|| "Invalid webview resource URI".to_string())?;
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded_path)
        .map_err(|error| format!("Invalid webview resource path encoding: {error}"))?;
    let path = String::from_utf8(bytes)
        .map_err(|error| format!("Invalid webview resource path UTF-8: {error}"))?;
    let mut path = PathBuf::from(path);

    for segment in segments {
        if segment.is_empty() {
            continue;
        }
        if segment == "." || segment == ".." || segment.contains('\\') {
            return Err("Invalid webview resource suffix".to_string());
        }
        path.push(segment);
    }

    Ok(ParsedWebviewResource { panel_id, path })
}

fn canonicalize_local_resource_roots(
    standalone_root: &Path,
    local_resource_roots: &[String],
) -> Result<Vec<PathBuf>, String> {
    if local_resource_roots.is_empty() {
        return Err("Webview local resource roots are not configured".to_string());
    }

    local_resource_roots
        .iter()
        .map(|root| {
            let path = PathBuf::from(root);
            let path = if path.is_absolute() {
                path
            } else {
                standalone_root.join(path)
            };
            std::fs::canonicalize(&path).map_err(|error| {
                format!(
                    "Failed to resolve webview local resource root {}: {error}",
                    path.display()
                )
            })
        })
        .collect()
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("Invalid webview resource panel id encoding".to_string());
            }
            let high = hex_value(bytes[index + 1])
                .ok_or_else(|| "Invalid webview resource panel id encoding".to_string())?;
            let low = hex_value(bytes[index + 2])
                .ok_or_else(|| "Invalid webview resource panel id encoding".to_string())?;
            output.push((high << 4) | low);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(output)
        .map_err(|error| format!("Invalid webview resource panel id UTF-8: {error}"))
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
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

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    resolve_standalone_root_from_candidates(
        None,
        &packaged_resource_root_candidates(&resource_dir),
        source_checkout_root(),
    )
}

fn resolve_standalone_root_from_candidates(
    env_root: Option<PathBuf>,
    resource_candidates: &[PathBuf],
    source_root: Option<PathBuf>,
) -> Result<PathBuf, String> {
    if let Some(root) = env_root {
        return Ok(root);
    }

    if let Some(root) = resource_candidates
        .iter()
        .find(|candidate| has_extension_host_entry(candidate))
    {
        return Ok(root.clone());
    }

    if let Some(root) = source_root.filter(|candidate| has_extension_host_entry(candidate)) {
        return Ok(root);
    }

    Err("Unable to resolve standalone resources. Expected extension-host/dist/main.js in AIRDB_STANDALONE_ROOT, the packaged Tauri resource directory, or the source standalone directory. Run the standalone package build after preparing resources, or set AIRDB_STANDALONE_ROOT.".to_string())
}

fn packaged_resource_root_candidates(resource_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![resource_dir.to_path_buf()];
    if let Some(parent_root) = resource_dir.parent().and_then(|path| path.parent()) {
        let parent_root = parent_root.to_path_buf();
        if parent_root != resource_dir {
            candidates.push(parent_root);
        }
    }
    candidates
}

fn source_checkout_root() -> Option<PathBuf> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .map(PathBuf::from)
}

fn has_extension_host_entry(root: &Path) -> bool {
    root.join("extension-host")
        .join("dist")
        .join("main.js")
        .exists()
}

fn prepare_extension_host_storage_root(app_data_dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(app_data_dir).map_err(|error| error.to_string())?;
    Ok(app_data_dir.to_path_buf())
}

fn resolve_node_runtime(standalone_root: &Path) -> Result<PathBuf, String> {
    let env_node = std::env::var("AIRDB_STANDALONE_NODE")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    resolve_node_runtime_from_candidates(env_node, &[standalone_root.to_path_buf()], true)
}

fn resolve_node_runtime_from_candidates(
    env_node: Option<PathBuf>,
    root_candidates: &[PathBuf],
    allow_path_fallback: bool,
) -> Result<PathBuf, String> {
    if let Some(node) = env_node {
        return Ok(node);
    }

    let relative_path = node_runtime_relative_path();
    if let Some(node) = root_candidates
        .iter()
        .map(|root| root.join(&relative_path))
        .find(|candidate| candidate.exists())
    {
        return Ok(node);
    }

    if allow_path_fallback {
        return Ok(PathBuf::from("node"));
    }

    let relative_path_for_message = relative_path.to_string_lossy().replace('\\', "/");
    Err(format!(
        "Unable to resolve Node runtime. Set AIRDB_STANDALONE_NODE, include the packaged sidecar at {}, or install node on PATH for development.",
        relative_path_for_message
    ))
}

fn node_runtime_relative_path() -> PathBuf {
    PathBuf::from("runtime")
        .join("node")
        .join(current_node_runtime_platform_dir())
        .join(node_executable_name())
}

fn current_node_runtime_platform_dir() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        ("macos", "x86_64") => "darwin-x64",
        ("macos", "aarch64") => "darwin-arm64",
        ("linux", "x86_64") => "linux-x64",
        ("linux", "aarch64") => "linux-arm64",
        _ => "unsupported",
    }
}

fn node_executable_name() -> &'static str {
    if std::env::consts::OS == "windows" {
        "node.exe"
    } else {
        "node"
    }
}

fn spawn_extension_host(app: tauri::AppHandle, state: ExtensionHostState) -> Result<(), String> {
    let standalone_root = resolve_standalone_root(&app)?;
    let node_runtime = resolve_node_runtime(&standalone_root)?;
    let host_entry = standalone_root
        .join("extension-host")
        .join("dist")
        .join("main.js");
    let extensions_dir = standalone_root.join("extensions");
    let storage_root = prepare_extension_host_storage_root(
        &app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?,
    )?;

    let mut child = Command::new(&node_runtime)
        .arg(&host_entry)
        .env("AIRDB_STANDALONE_EXTENSIONS", &extensions_dir)
        .env("AIRDB_STANDALONE_STORAGE", &storage_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                format!(
                    "Failed to start extension host because the Node runtime was not found. Tried: {}. Set AIRDB_STANDALONE_NODE, include the packaged Node sidecar, or install node on PATH for development. Extension host entry: {}",
                    node_runtime.display(),
                    host_entry.display()
                )
            } else {
                format!(
                    "Failed to start extension host at {}: {error}",
                    host_entry.display()
                )
            }
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
                if let Some(message) = parse_extension_host_protocol_message(&line) {
                    let _ = app_for_stdout.emit("extension-host-message", message);
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_ROOT_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let counter = TEMP_ROOT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("airdb-webview-test-{suffix}-{counter}"));
        fs::create_dir_all(
            root.join("extensions")
                .join("airdb")
                .join("out")
                .join("webview"),
        )
        .unwrap();
        root
    }

    fn resource_uri(panel_id: &str, path: &std::path::Path) -> String {
        let encoded_path = URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes());
        format!("standalone-resource://{panel_id}/{encoded_path}")
    }

    fn resource_uri_with_suffix(panel_id: &str, path: &std::path::Path, suffix: &str) -> String {
        let encoded_path = URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes());
        format!("standalone-resource://{panel_id}/{encoded_path}/{suffix}")
    }

    fn root_string(path: &std::path::Path) -> String {
        path.to_string_lossy().into_owned()
    }

    fn create_host_entry(root: &std::path::Path) {
        let host_entry = root.join("extension-host").join("dist").join("main.js");
        fs::create_dir_all(host_entry.parent().unwrap()).unwrap();
        fs::write(host_entry, "console.log('host');").unwrap();
    }

    fn create_node_runtime(root: &std::path::Path) -> PathBuf {
        let runtime_path = root.join(node_runtime_relative_path());
        fs::create_dir_all(runtime_path.parent().unwrap()).unwrap();
        fs::write(&runtime_path, "node").unwrap();
        runtime_path
    }

    #[test]
    fn reads_allowed_webview_resource() {
        let root = temp_root();
        let webview_root = root
            .join("extensions")
            .join("airdb")
            .join("out")
            .join("webview");
        let file = webview_root.join("app.js");
        fs::write(&file, "console.log('ok');").unwrap();

        let response = read_webview_resource_from_root(
            &root,
            "panel-1",
            &[root_string(&webview_root)],
            &resource_uri("panel-1", &file),
        )
        .unwrap();

        assert_eq!(response.mime_type, "text/javascript");
        assert_eq!(response.base64, "Y29uc29sZS5sb2coJ29rJyk7");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_resource_outside_extensions() {
        let root = temp_root();
        let file = root.join("secret.txt");
        fs::write(&file, "secret").unwrap();

        let error = read_webview_resource_from_root(
            &root,
            "panel-1",
            &[root_string(&root.join("extensions").join("airdb"))],
            &resource_uri("panel-1", &file),
        )
        .unwrap_err();

        assert!(error.contains("outside allowed roots"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_resource_outside_local_resource_roots() {
        let root = temp_root();
        let allowed_root = root
            .join("extensions")
            .join("airdb")
            .join("out")
            .join("webview");
        let other_root = root
            .join("extensions")
            .join("other")
            .join("out")
            .join("webview");
        fs::create_dir_all(&other_root).unwrap();
        let file = other_root.join("app.js");
        fs::write(&file, "console.log('other');").unwrap();

        let error = read_webview_resource_from_root(
            &root,
            "panel-1",
            &[root_string(&allowed_root)],
            &resource_uri("panel-1", &file),
        )
        .unwrap_err();

        assert!(error.contains("outside allowed roots"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_resource_for_different_panel_id() {
        let root = temp_root();
        let webview_root = root
            .join("extensions")
            .join("airdb")
            .join("out")
            .join("webview");
        let file = webview_root.join("app.js");
        fs::write(&file, "console.log('ok');").unwrap();

        let error = read_webview_resource_from_root(
            &root,
            "panel-1",
            &[root_string(&webview_root)],
            &resource_uri("panel-2", &file),
        )
        .unwrap_err();

        assert!(error.contains("panel id"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_allowed_webview_resource_with_uri_suffix() {
        let root = temp_root();
        let webview_root = root
            .join("extensions")
            .join("airdb")
            .join("out")
            .join("webview");
        let file = webview_root.join("app.js");
        fs::write(&file, "console.log('ok');").unwrap();

        let response = read_webview_resource_from_root(
            &root,
            "panel-1",
            &[root_string(&webview_root)],
            &resource_uri_with_suffix("panel-1", &webview_root, "app.js"),
        )
        .unwrap();

        assert_eq!(response.mime_type, "text/javascript");
        assert_eq!(response.base64, "Y29uc29sZS5sb2coJ29rJyk7");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_traversal_in_uri_suffix() {
        let root = temp_root();
        let webview_root = root
            .join("extensions")
            .join("airdb")
            .join("out")
            .join("webview");

        let error = read_webview_resource_from_root(
            &root,
            "panel-1",
            &[root_string(&webview_root)],
            &resource_uri_with_suffix("panel-1", &webview_root, "../secret.txt"),
        )
        .unwrap_err();

        assert!(error.contains("Invalid webview resource suffix"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn root_resolution_uses_env_override_first() {
        let env_root = temp_root();
        let resource_root = temp_root();
        let source_root = temp_root();
        create_host_entry(&resource_root);
        create_host_entry(&source_root);

        let resolved = resolve_standalone_root_from_candidates(
            Some(env_root.clone()),
            &[resource_root.clone()],
            Some(source_root.clone()),
        )
        .unwrap();

        assert_eq!(resolved, env_root);
        fs::remove_dir_all(env_root).unwrap();
        fs::remove_dir_all(resource_root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[test]
    fn root_resolution_prefers_packaged_resources_before_source_checkout() {
        let resource_root = temp_root();
        let source_root = temp_root();
        create_host_entry(&resource_root);
        create_host_entry(&source_root);

        let resolved = resolve_standalone_root_from_candidates(
            None,
            &[resource_root.clone()],
            Some(source_root.clone()),
        )
        .unwrap();

        assert_eq!(resolved, resource_root);
        fs::remove_dir_all(resource_root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[test]
    fn root_resolution_falls_back_to_source_checkout_after_packaged_resources() {
        let resource_root = temp_root();
        let source_root = temp_root();
        create_host_entry(&source_root);

        let resolved = resolve_standalone_root_from_candidates(
            None,
            &[resource_root.clone()],
            Some(source_root.clone()),
        )
        .unwrap();

        assert_eq!(resolved, source_root);
        fs::remove_dir_all(resource_root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[test]
    fn extension_host_storage_uses_app_data_dir() {
        let root = std::env::temp_dir().join(format!(
            "airdb-storage-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));

        let resolved = prepare_extension_host_storage_root(&root).unwrap();

        assert_eq!(resolved, root);
        assert!(resolved.exists());
        fs::remove_dir_all(resolved).unwrap();
    }

    #[test]
    fn node_runtime_resolution_uses_env_override_first() {
        let env_node = PathBuf::from("C:/custom/node.exe");
        let resource_root = temp_root();
        let sidecar = create_node_runtime(&resource_root);

        let resolved = resolve_node_runtime_from_candidates(
            Some(env_node.clone()),
            &[resource_root.clone()],
            true,
        )
        .unwrap();

        assert_eq!(resolved, env_node);
        assert!(sidecar.exists());
        fs::remove_dir_all(resource_root).unwrap();
    }

    #[test]
    fn node_runtime_resolution_prefers_sidecar_before_path_fallback() {
        let resource_root = temp_root();
        let sidecar = create_node_runtime(&resource_root);

        let resolved =
            resolve_node_runtime_from_candidates(None, &[resource_root.clone()], true).unwrap();

        assert_eq!(resolved, sidecar);
        fs::remove_dir_all(resource_root).unwrap();
    }

    #[test]
    fn node_runtime_resolution_falls_back_to_system_node_for_development() {
        let resource_root = temp_root();

        let resolved =
            resolve_node_runtime_from_candidates(None, &[resource_root.clone()], true).unwrap();

        assert_eq!(resolved, PathBuf::from("node"));
        fs::remove_dir_all(resource_root).unwrap();
    }

    #[test]
    fn node_runtime_resolution_errors_when_no_runtime_and_no_fallback() {
        let resource_root = temp_root();

        let error = resolve_node_runtime_from_candidates(None, &[resource_root.clone()], false)
            .unwrap_err();

        assert!(error.contains("AIRDB_STANDALONE_NODE"));
        assert!(error.contains("runtime/node"));
        fs::remove_dir_all(resource_root).unwrap();
    }

    #[test]
    fn accepts_valid_extension_host_protocol_stdout() {
        let line = r#"{"kind":"notification","group":"tree.create","payload":{"viewId":"fixture.view"}}"#;

        assert_eq!(
            parse_extension_host_protocol_message(line).as_deref(),
            Some(line)
        );
    }

    #[test]
    fn rejects_json_like_stdout_that_is_not_protocol() {
        assert_eq!(
            parse_extension_host_protocol_message(r#"{"message":"plain stdout"}"#),
            None
        );
        assert_eq!(
            parse_extension_host_protocol_message(r#"{"kind":"response","group":"command.execute"}"#),
            None
        );
    }
}
