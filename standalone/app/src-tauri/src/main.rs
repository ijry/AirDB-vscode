use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{Emitter, Manager};

#[tauri::command]
fn host_health() -> &'static str {
    "ok"
}

#[tauri::command]
fn emit_extension_host_message(app: tauri::AppHandle, message: String) -> Result<(), String> {
    app.emit("extension-host-message", message)
        .map_err(|error| error.to_string())
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

fn spawn_extension_host(app: tauri::AppHandle) -> Result<(), String> {
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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to start extension host at {}: {error}",
                host_entry.display()
            )
        })?;

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
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            host_health,
            emit_extension_host_message
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window exists");
            window.emit("host-log", "Tauri backend started")?;
            spawn_extension_host(app.handle().clone())
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AirDB standalone");
}
