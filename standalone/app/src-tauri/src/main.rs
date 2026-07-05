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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AirDB standalone");
}
