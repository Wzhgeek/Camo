#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;
            // Inject transparent background before page renders
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(
                    "document.documentElement.style.backgroundColor = 'transparent';
                     document.body.style.backgroundColor = 'transparent';
                     var app = document.getElementById('app');
                     if (app) app.style.backgroundColor = 'transparent';",
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
