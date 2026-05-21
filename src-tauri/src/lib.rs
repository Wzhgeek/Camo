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
            use tauri::{Emitter, Manager};
            use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
            use tauri::menu::{MenuBuilder, MenuItemBuilder};

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(
                    "document.documentElement.style.backgroundColor = 'transparent';
                     document.body.style.backgroundColor = 'transparent';
                     var app = document.getElementById('app');
                     if (app) app.style.backgroundColor = 'transparent';",
                );

                // Build tray icon with menu
                let show_item = MenuItemBuilder::with_id("tray_show", "显示/隐藏")
                    .build(app)?;
                let settings_item = MenuItemBuilder::with_id("tray_settings", "设置")
                    .build(app)?;
                let quit_item = MenuItemBuilder::with_id("tray_quit", "退出")
                    .build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[&show_item, &settings_item, &quit_item])
                    .build()?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Camo")
                    .menu(&menu)
                    .on_menu_event(move |app, event| {
                        if let Some(w) = app.get_webview_window("main") {
                            match event.id().as_ref() {
                                "tray_show" => {
                                    let _ = if w.is_visible().unwrap_or(false) {
                                        w.hide()
                                    } else {
                                        w.show()
                                    };
                                }
                                "tray_settings" => {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                    let _ = app.emit_to("main", "camo-open-settings", ());
                                }
                                "tray_quit" => {
                                    app.exit(0);
                                }
                                _ => {}
                            }
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = if w.is_visible().unwrap_or(false) {
                                    w.hide()
                                } else {
                                    w.show()
                                };
                            }
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
