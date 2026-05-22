use std::fs;
use std::path::{Path, PathBuf};
use enigo::{Mouse, Keyboard, Coordinate};

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn is_allowed_path(path: &Path) -> bool {
    let home = dirs::home_dir();
    let home_ref = home.as_ref();
    let allowed: Vec<Option<PathBuf>> = vec![
        home.clone(),
        Some(PathBuf::from("/tmp")),
        home_ref.map(|h| h.join("Desktop")),
        home_ref.map(|h| h.join("Documents")),
        home_ref.map(|h| h.join("Downloads")),
    ];
    for prefix in allowed.iter().flatten() {
        if path.starts_with(prefix) {
            return true;
        }
    }
    false
}

#[tauri::command]
fn read_file(path: String, offset: Option<u64>, limit: Option<u64>) -> Result<String, String> {
    let p = Path::new(&path);
    let canonical = p.canonicalize().map_err(|e| format!("无效路径: {e}"))?;
    if !is_allowed_path(&canonical) {
        return Err("访问被拒绝: 路径不在允许的目录范围内".into());
    }
    let content = fs::read_to_string(&canonical).map_err(|e| format!("读取错误: {e}"))?;
    let off = offset.unwrap_or(0) as usize;
    let lim = limit.unwrap_or(50000) as usize;
    if off >= content.len() {
        return Ok(String::new());
    }
    let end = std::cmp::min(off + lim, content.len());
    let mut result = content[off..end].to_string();
    if end < content.len() {
        result.push_str(&format!("\n\n[已截断: {}/{} 字节]", end - off, content.len()));
    }
    Ok(result)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    // For new files that don't exist yet, canonicalize would fail, so use parent
    let (canonical_parent, _file_name) = if p.exists() {
        let c = p.canonicalize().map_err(|e| format!("无效路径: {e}"))?;
        (c.parent().map(Path::to_path_buf), c.file_name().map(|f| f.to_os_string()))
    } else {
        let parent = p.parent().map(|parent| {
            if parent.exists() {
                parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf())
            } else {
                parent.to_path_buf()
            }
        });
        (parent, p.file_name().map(|f| f.to_os_string()))
    };
    let parent = canonical_parent.ok_or("无效路径: 缺少父目录")?;
    if !is_allowed_path(&parent) {
        return Err("访问被拒绝: 路径不在允许的目录范围内".into());
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录错误: {e}"))?;
    }
    fs::write(&p, &content).map_err(|e| format!("写入错误: {e}"))
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<String>, String> {
    let p = Path::new(&path);
    let canonical = p.canonicalize().map_err(|e| format!("无效路径: {e}"))?;
    if !is_allowed_path(&canonical) {
        return Err("访问被拒绝: 路径不在允许的目录范围内".into());
    }
    let entries: Vec<String> = fs::read_dir(&canonical)
        .map_err(|e| format!("读取目录错误: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir { format!("{}/", name) } else { name }
        })
        .collect();
    Ok(entries)
}

#[tauri::command]
fn run_shell(command: String, cwd: Option<String>, timeout_secs: Option<u64>) -> Result<String, String> {
    let _timeout = timeout_secs.unwrap_or(30);
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("cmd");
        c.arg("/C").arg(&command);
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.arg("-c").arg(&command);
        c
    };
    if let Some(dir) = cwd {
        cmd.current_dir(&dir);
    }
    let output = cmd.output().map_err(|e| format!("Shell 执行失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".into());
    let mut result = String::new();
    if !stdout.is_empty() {
        result.push_str(&format!("STDOUT:\n{}", stdout));
    }
    if !stderr.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&format!("STDERR:\n{}", stderr));
    }
    result.push_str(&format!("\n\n退出码: {}", exit_code));
    if result.is_empty() {
        result = format!("(无输出)\n退出码: {}", exit_code);
    }
    Ok(result)
}

#[tauri::command]
fn take_screenshot(path: String) -> Result<(), String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("获取显示器失败: {e}"))?;
    if monitors.is_empty() {
        return Err("未检测到显示器".into());
    }
    let image = monitors[0].capture_image().map_err(|e| format!("截屏失败: {e}"))?;
    image.save(&path).map_err(|e| format!("保存截图失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
        .map_err(|e| format!("初始化输入控制失败: {e}"))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("移动鼠标失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn click(button: Option<String>) -> Result<(), String> {
    let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
        .map_err(|e| format!("初始化输入控制失败: {e}"))?;
    let btn = match button.unwrap_or_else(|| "left".into()).as_str() {
        "left" => enigo::Button::Left,
        "right" => enigo::Button::Right,
        "middle" => enigo::Button::Middle,
        _ => enigo::Button::Left,
    };
    enigo.button(btn, enigo::Direction::Click).map_err(|e| format!("点击失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn type_text(text: String) -> Result<(), String> {
    let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
        .map_err(|e| format!("初始化输入控制失败: {e}"))?;
    enigo.text(&text).map_err(|e| format!("输入失败: {e}"))?;
    Ok(())
}

// ── CamoClaw 本地 Skill 目录管理 ──

fn camoclaw_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".camoclaw").join("skills")
}

#[tauri::command]
fn ensure_camoclaw_dir() -> Result<String, String> {
    let dir = camoclaw_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_skill_dirs() -> Result<Vec<String>, String> {
    let dir = camoclaw_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let entries: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| format!("读取目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    Ok(entries)
}

#[tauri::command]
fn read_skill_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("文件不存在".into());
    }
    // Security: only allow reads within ~/.camoclaw/
    let canonical = p.canonicalize().map_err(|e| format!("无效路径: {e}"))?;
    let base = camoclaw_dir().canonicalize().unwrap_or_else(|_| camoclaw_dir());
    if !canonical.starts_with(&base) {
        return Err("访问被拒绝: 路径不在 camoclaw 目录内".into());
    }
    fs::read_to_string(&canonical).map_err(|e| format!("读取错误: {e}"))
}

#[tauri::command]
fn write_skill_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    // Security: only allow writes within ~/.camoclaw/
    let base = camoclaw_dir();
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let canonical = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    let base_canonical = base.canonicalize().unwrap_or_else(|_| base);
    if !canonical.starts_with(&base_canonical) {
        return Err("访问被拒绝: 路径不在 camoclaw 目录内".into());
    }
    fs::write(&p, &content).map_err(|e| format!("写入错误: {e}"))
}

#[tauri::command]
fn delete_skill_dir(name: String) -> Result<(), String> {
    let dir = camoclaw_dir().join(&name);
    if !dir.exists() {
        return Ok(());
    }
    // Security: ensure we're deleting within ~/.camoclaw/skills/
    let canonical = dir.canonicalize().map_err(|e| format!("无效路径: {e}"))?;
    let base = camoclaw_dir().canonicalize().unwrap_or_else(|_| camoclaw_dir());
    if !canonical.starts_with(&base) {
        return Err("访问被拒绝: 路径不在 camoclaw 目录内".into());
    }
    fs::remove_dir_all(&canonical).map_err(|e| format!("删除失败: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            exit_app,
            read_file,
            write_file,
            list_directory,
            run_shell,
            take_screenshot,
            move_mouse,
            click,
            type_text,
            ensure_camoclaw_dir,
            list_skill_dirs,
            read_skill_file,
            write_skill_file,
            delete_skill_dir
        ])
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
