use tauri::{Emitter, Manager};

#[tauri::command]
fn host_health() -> &'static str {
    "ok"
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![host_health])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window exists");
            window.emit("host-log", "Tauri backend started")?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AirDB standalone");
}
