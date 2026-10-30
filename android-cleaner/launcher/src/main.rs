#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::hash::Hasher;
use std::path::{Path, PathBuf};
use std::process::Command;

const APP: &[u8] = include_bytes!("../../src-tauri/target/release/android-cleaner.exe");
const LOADER: &[u8] = include_bytes!("../resources/WebView2Loader.dll");
const BUILD: &str = "0.1.0";

fn digest(bytes: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    hasher.write(bytes);
    hasher.finish()
}

fn writable_dir(path: &Path) -> bool {
    fs::create_dir_all(path).is_ok()
}

fn main() {
    let exe = env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let base = exe
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let runtime = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("AndroidCleaner")
        .join("runtime");
    let _ = fs::create_dir_all(&runtime);

    let app = runtime.join("android-cleaner.exe");
    let loader = runtime.join("WebView2Loader.dll");
    let stamp = runtime.join("build.txt");
    let wanted = format!("{BUILD}-{}-{}", digest(APP), digest(LOADER));
    let current = fs::read_to_string(&stamp).unwrap_or_default();

    if current.trim() != wanted || !app.exists() || !loader.exists() {
        let app_ok = fs::write(&app, APP).is_ok();
        let loader_ok = fs::write(&loader, LOADER).is_ok();
        if app_ok && loader_ok {
            let _ = fs::write(&stamp, wanted);
        }
    }

    let data = if writable_dir(&base.join("data")) {
        base.join("data")
    } else {
        let fallback = env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(env::temp_dir)
            .join("AndroidCleaner")
            .join("data");
        let _ = fs::create_dir_all(&fallback);
        fallback
    };

    if app.exists() && loader.exists() {
        if let Err(error) = Command::new(&app)
            .env("ANDROID_CLEANER_DATA_DIR", &data)
            .spawn()
        {
            let _ = fs::write(
                data.join("launcher-error.txt"),
                format!("failed to start {}: {error}", app.display()),
            );
        }
    } else {
        let _ = fs::write(
            data.join("launcher-error.txt"),
            format!(
                "missing runtime files: {} / {}",
                app.display(),
                loader.display()
            ),
        );
    }
}
