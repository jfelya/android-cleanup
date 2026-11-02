use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const ADB_EXE: &[u8] = include_bytes!("../resources/adb.exe");
const ADB_WIN_API: &[u8] = include_bytes!("../resources/AdbWinApi.dll");
const ADB_WIN_USB_API: &[u8] = include_bytes!("../resources/AdbWinUsbApi.dll");

pub const DEFAULT_PROTECTED: &[&str] = &[
    "/storage/emulated/0/Fely",
    "/storage/emulated/0/snaptube",
    "/storage/emulated/0/Download",
    "/storage/emulated/0/DCIM/Camera",
    "/storage/emulated/0/DCIM/ScreenRecorder",
    "/storage/emulated/0/Pictures/Screenshots",
    "/storage/emulated/0/DCIM/Screenshots",
    "/storage/emulated/0/Android/obb",
    "/storage/emulated/0/Android/data/com.gryphline.endfield.gp",
    "/storage/emulated/0/Android/data/com.riotgames.league.teamfighttactics",
    "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Databases",
    "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents",
    "/storage/emulated/0/Android/data/org.telegram.messenger/files/Telegram/Telegram Documents",
    "/storage/emulated/0/Android/data/org.telegram.messenger/files/Telegram/Telegram Files",
];

pub const ALL_CATEGORIES: &[&str] = &[
    "S1", "S2", "S3", "S4", "S5", "S6", "S7", "P1", "P2", "P3", "P4", "P5", "P6", "P7",
    "P8", "P9", "P10", "WA_MEDIA", "TG_MEDIA", "CUSTOM",
];

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CustomRule {
    pub label: String,
    pub path_prefix: String,
    #[serde(default)]
    pub extensions: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_protected")]
    pub protected_paths: Vec<String>,
    #[serde(default = "default_categories")]
    pub enabled_categories: Vec<String>,
    #[serde(default)]
    pub custom_rules: Vec<CustomRule>,
    #[serde(default = "default_true")]
    pub deep_duplicates: bool,
    #[serde(default = "default_cap_files")]
    pub duplicate_cap_files: usize,
    #[serde(default = "default_cap_bytes")]
    pub duplicate_cap_bytes: u64,
    #[serde(default)]
    pub cache_trim_enabled: bool,
    #[serde(default = "default_cache_trim_bytes")]
    pub cache_trim_bytes: u64,
}

fn default_protected() -> Vec<String> {
    DEFAULT_PROTECTED.iter().map(|s| s.to_string()).collect()
}
fn default_categories() -> Vec<String> {
    ALL_CATEGORIES.iter().map(|s| s.to_string()).collect()
}
fn default_true() -> bool {
    true
}
fn default_cap_files() -> usize {
    5000
}
fn default_cap_bytes() -> u64 {
    2 * 1024 * 1024 * 1024
}
fn default_cache_trim_bytes() -> u64 {
    3 * 1024 * 1024 * 1024
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            protected_paths: default_protected(),
            enabled_categories: default_categories(),
            custom_rules: Vec::new(),
            deep_duplicates: true,
            duplicate_cap_files: default_cap_files(),
            duplicate_cap_bytes: default_cap_bytes(),
            cache_trim_enabled: false,
            cache_trim_bytes: default_cache_trim_bytes(),
        }
    }
}

pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("ANDROID_CLEANER_DATA_DIR") {
        let path = PathBuf::from(dir);
        if fs::create_dir_all(&path).is_ok() {
            return path;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let portable = parent.join("data");
            if fs::create_dir_all(&portable).is_ok() {
                return portable;
            }
        }
    }
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("AndroidCleaner")
        .join("data");
    let _ = fs::create_dir_all(&base);
    base
}

pub fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

pub fn load_config() -> AppConfig {
    load_config_from(&config_path()).unwrap_or_default()
}

pub fn load_config_from(path: &Path) -> Result<AppConfig, String> {
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let text = fs::read_to_string(path).map_err(|e| format!("read config: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse config: {e}"))
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    save_config_to(config, &config_path())
}

pub fn save_config_to(config: &AppConfig, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create config dir: {e}"))?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|e| format!("serialize config: {e}"))?;
    fs::write(path, text).map_err(|e| format!("write config: {e}"))
}

pub fn adb_path() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir()
        .join("AndroidCleaner")
        .join("adb")
        .join("platform-tools-37.0.1");
    fs::create_dir_all(&dir).map_err(|e| format!("create adb dir: {e}"))?;
    for (name, bytes) in [
        ("adb.exe", ADB_EXE),
        ("AdbWinApi.dll", ADB_WIN_API),
        ("AdbWinUsbApi.dll", ADB_WIN_USB_API),
    ] {
        let path = dir.join(name);
        let needs_write = match fs::metadata(&path) {
            Ok(meta) => meta.len() != bytes.len() as u64,
            Err(_) => true,
        };
        if needs_write {
            fs::write(&path, bytes).map_err(|e| format!("extract {name}: {e}"))?;
        }
    }
    Ok(dir.join("adb.exe"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_expected_protection() {
        let cfg = AppConfig::default();
        assert!(cfg.protected_paths.iter().any(|p| p.ends_with("/Fely")));
        assert!(cfg.enabled_categories.iter().any(|p| p == "S1"));
        assert!(cfg.enabled_categories.iter().any(|p| p == "TG_MEDIA"));
        assert!(!cfg.cache_trim_enabled);
    }

    #[test]
    fn config_round_trips() {
        let path = std::env::temp_dir().join(format!(
            "android-cleaner-config-{}.json",
            std::process::id()
        ));
        let mut cfg = AppConfig::default();
        cfg.protected_paths.push("/storage/emulated/0/KeepMe".into());
        cfg.cache_trim_enabled = true;
        save_config_to(&cfg, &path).unwrap();
        let loaded = load_config_from(&path).unwrap();
        assert_eq!(loaded.protected_paths, cfg.protected_paths);
        assert!(loaded.cache_trim_enabled);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn missing_config_falls_back_to_default() {
        let path = std::env::temp_dir().join("android-cleaner-does-not-exist.json");
        let _ = fs::remove_file(&path);
        let cfg = load_config_from(&path).unwrap();
        assert!(cfg.deep_duplicates);
    }
}
