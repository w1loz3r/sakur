#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::{Path, PathBuf}};
use tauri::{Manager, AppHandle};

fn safe_relative(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() { return Err("absolute paths are not allowed".into()); }
    for part in rel.components() {
        if matches!(part, std::path::Component::ParentDir) { return Err("parent paths are not allowed".into()); }
    }
    Ok(root.join(rel))
}

#[tauri::command]
fn launcher_info() -> serde_json::Value {
    serde_json::json!({"name":"Sakura Launcher","version":"0.2.0","status":"real-builds"})
}

#[tauri::command]
fn app_data_dir(app: AppHandle) -> Result<String, String> {
    app.path().app_data_dir().map(|p| p.to_string_lossy().to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_file(app: AppHandle, url: String, relative_path: String) -> Result<String, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target = safe_relative(&root, &relative_path)?;
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("download failed: {}", response.status())); }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![launcher_info, app_data_dir, download_file])
        .run(tauri::generate_context!())
        .expect("error while running Sakura Launcher");
}
