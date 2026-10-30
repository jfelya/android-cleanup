use android_cleaner_core::adb::{AdbClient, DeviceRow};
use android_cleaner_core::cleanup;
use android_cleaner_core::config::{self, AppConfig};
use android_cleaner_core::duplicates::{self, DuplicateGroup};
use android_cleaner_core::model::{
    Candidate, DeviceInfo, DryRun, ExecutionReport, ScanData, WirelessService,
};
use android_cleaner_core::report;
use android_cleaner_core::rules;
use android_cleaner_core::safety;
use android_cleaner_core::scan;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub client: Arc<AdbClient>,
    pub config: Mutex<AppConfig>,
    pub scan: Mutex<Option<ScanData>>,
    pub dry_run: Mutex<Option<DryRun>>,
}

impl AppState {
    pub fn new(client: AdbClient, config: AppConfig) -> Self {
        Self {
            client: Arc::new(client),
            config: Mutex::new(config),
            scan: Mutex::new(None),
            dry_run: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub adb_path: String,
    pub data_dir: String,
    pub version: String,
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        adb_path: state.client.adb_path().display().to_string(),
        data_dir: config::data_dir().display().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn list_devices(state: State<'_, AppState>) -> Result<Vec<DeviceRow>, String> {
    state.client.devices()
}

#[tauri::command]
pub fn device_info(serial: String, state: State<'_, AppState>) -> Result<DeviceInfo, String> {
    state.client.device_info(&serial)
}

#[tauri::command]
pub fn mdns_services(state: State<'_, AppState>) -> Result<Vec<WirelessService>, String> {
    state.client.mdns_services()
}

#[tauri::command]
pub fn pair_wireless(
    host: String,
    code: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if !host.contains(':') {
        return Err("pairing address must be host:port".into());
    }
    state.client.pair(&host, &code)
}

#[tauri::command]
pub fn connect_wireless(host: String, state: State<'_, AppState>) -> Result<String, String> {
    if !host.contains(':') {
        return Err("connect address must be host:port".into());
    }
    state.client.connect(&host)
}

#[tauri::command]
pub fn load_config(state: State<'_, AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn rule_categories() -> Vec<android_cleaner_core::model::RuleCategory> {
    android_cleaner_core::rules::default_categories()
}

#[tauri::command]
pub fn save_config(config: AppConfig, state: State<'_, AppState>) -> Result<(), String> {
    config::save_config(&config)?;
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
pub async fn scan_device(
    serial: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanData, String> {
    let client = state.client.clone();
    let serial_for_task = serial.clone();
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        scan::scan(&serial_for_task, &client, |count| {
            let _ = app_for_task.emit("scan-progress", count);
        })
    })
    .await
    .map_err(|e| format!("scan task: {e}"))??;
    *state.scan.lock().unwrap() = Some(result.clone());
    let _ = app.emit("scan-complete", &result);
    Ok(result)
}

#[tauri::command]
pub async fn build_dry_run(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DryRun, String> {
    let scan = state
        .scan
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "scan the device first".to_string())?;
    let config = state.config.lock().unwrap().clone();
    let client = state.client.clone();
    let app_for_task = app.clone();
    let dry = tauri::async_runtime::spawn_blocking(move || {
        let mut candidates = rules::evaluate(&scan.entries, &config);
        let mut duplicate_groups: Vec<DuplicateGroup> = Vec::new();
        if config.deep_duplicates {
            let groups = duplicates::size_groups(
                &scan.entries,
                &config.protected_paths,
                config.duplicate_cap_files,
                config.duplicate_cap_bytes,
            );
            let _ = app_for_task.emit("dry-run-progress", "hashing duplicate candidates");
            let hashed = duplicates::hash_groups(&client, &scan.serial, &groups)?;
            let existing: HashSet<String> =
                candidates.iter().map(|c| c.path.clone()).collect();
            for mut group in hashed {
                group.duplicates.retain(|d| !existing.contains(&d.path));
                if !group.duplicates.is_empty() {
                    for d in &group.duplicates {
                        candidates.push(Candidate {
                            category_id: "P10".into(),
                            path: d.path.clone(),
                            size: d.size,
                            mtime: d.mtime,
                            reason: "duplicate hash".into(),
                        });
                    }
                    duplicate_groups.push(group);
                }
            }
        }
        let dry = report::build_dry_run(
            &scan,
            &candidates,
            &config.protected_paths,
            &duplicate_groups,
            &config,
        );
        let _ = report::write_report(&config::data_dir(), &dry)?;
        Ok::<DryRun, String>(dry)
    })
    .await
    .map_err(|e| format!("dry run task: {e}"))??;
    *state.dry_run.lock().unwrap() = Some(dry.clone());
    let _ = app.emit("dry-run-complete", &dry);
    Ok(dry)
}

#[tauri::command]
pub async fn execute_cleanup(
    serial: String,
    confirmation: String,
    paths: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ExecutionReport, String> {
    if confirmation != "DELETE" {
        return Err("type DELETE to confirm".into());
    }
    if paths.is_empty() {
        return Err("select at least one file".into());
    }
    let dry = state
        .dry_run
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "build a dry run first".to_string())?;
    if dry.serial != serial {
        return Err("dry run belongs to a different device".into());
    }
    let allowed: HashSet<&str> = dry.candidates.iter().map(|c| c.path.as_str()).collect();
    let unknown: Vec<&String> = paths.iter().filter(|p| !allowed.contains(p.as_str())).collect();
    if !unknown.is_empty() {
        return Err(format!(
            "paths are not in the reviewed dry run: {}",
            unknown.iter().take(5).map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
        ));
    }
    let selected: Vec<Candidate> = dry
        .candidates
        .iter()
        .filter(|c| paths.iter().any(|p| p == &c.path))
        .cloned()
        .collect();
    let current = state.config.lock().unwrap().clone();
    let mut guards = dry.protected_paths.clone();
    guards.extend(current.protected_paths.iter().cloned());
    let violations = safety::validate_candidates(&selected, &guards);
    if !violations.is_empty() {
        return Err(format!(
            "protected paths in candidate list: {}",
            violations.join(", ")
        ));
    }
    let paths: Vec<String> = selected.iter().map(|c| c.path.clone()).collect();
    let categories: Vec<String> = selected
        .iter()
        .map(|c| c.category_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let config = current;
    let client = state.client.clone();
    let app_for_task = app.clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        run_cleanup(
            &client,
            &serial,
            &paths,
            &categories,
            &config,
            &app_for_task,
        )
    })
    .await
    .map_err(|e| format!("cleanup task: {e}"))??;
    *state.dry_run.lock().unwrap() = None;
    let _ = app.emit("cleanup-complete", &report);
    Ok(report)
}

fn run_cleanup(
    client: &AdbClient,
    serial: &str,
    paths: &[String],
    categories: &[String],
    config: &AppConfig,
    app: &AppHandle,
) -> Result<ExecutionReport, String> {
    let before_free = cleanup::free_space(client, serial)?;
    let packages = cleanup::force_stop_packages(client, serial, categories);
    let _ = app.emit("cleanup-progress", "apps force-stopped");
    let id = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let log_dir = config::data_dir().join("logs");
    fs::create_dir_all(&log_dir).map_err(|e| format!("create log dir: {e}"))?;
    let log_path = log_dir.join(format!("{id}.log"));
    let mut log = String::new();
    log.push_str(&format!("# cleanup {id}\n"));
    for p in &packages {
        log.push_str(&format!("# force-stop {}: {}\n", p.package, p.message));
    }
    let mut seen = 0usize;
    let stats = cleanup::delete_paths(client, serial, paths, |line| {
        seen += 1;
        log.push_str(line);
        log.push('\n');
        if seen % 25 == 0 {
            let _ = app.emit("cleanup-progress", format!("{seen} / {}", paths.len()));
        }
    })?;
    log.push_str(&format!(
        "# summary ok={} missing={} failed={} bytes={}\n",
        stats.ok, stats.missing, stats.failed, stats.bytes
    ));
    if let Err(e) = fs::write(&log_path, log) {
        let _ = app.emit("cleanup-progress", format!("log write failed: {e}"));
    }

    let mut after_free = cleanup::free_space(client, serial).unwrap_or(before_free);
    let mut cache_trimmed = 0u64;
    if config.cache_trim_enabled {
        let target = after_free.saturating_add(config.cache_trim_bytes);
        if cleanup::trim_caches(client, serial, target).is_ok() {
            let new_free = cleanup::free_space(client, serial).unwrap_or(after_free);
            cache_trimmed = new_free.saturating_sub(after_free);
            after_free = new_free;
        }
    }
    let report = ExecutionReport {
        id: id.clone(),
        executed_at: chrono::Local::now().to_rfc3339(),
        serial: serial.into(),
        before_free,
        after_free,
        files: stats,
        cache_trim_requested: config.cache_trim_enabled,
        cache_trimmed_bytes: cache_trimmed,
        log_path: log_path.display().to_string(),
        report_path: String::new(),
    };
    let report_dir = config::data_dir().join("reports").join(&id);
    let mut report_path = String::new();
    if fs::create_dir_all(&report_dir).is_ok() {
        let path = report_dir.join("execution.json");
        if fs::write(
            &path,
            serde_json::to_string_pretty(&report).unwrap_or_else(|_| "{}".to_string()),
        )
        .is_ok()
        {
            report_path = path.display().to_string();
        }
    }
    Ok(ExecutionReport {
        report_path,
        ..report
    })
}

#[tauri::command]
pub fn trim_cache(
    serial: String,
    target_bytes: u64,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    cleanup::trim_caches(&state.client, &serial, target_bytes)?;
    cleanup::free_space(&state.client, &serial)
}

#[tauri::command]
pub fn list_reports() -> Result<Vec<String>, String> {
    Ok(report::report_dirs(&config::data_dir())
        .into_iter()
        .map(|p| p.display().to_string())
        .collect())
}

#[tauri::command]
pub fn open_data_dir() -> Result<(), String> {
    let dir = config::data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("create data dir: {e}"))?;
    std::process::Command::new("explorer")
        .arg(dir)
        .spawn()
        .map_err(|e| format!("open explorer: {e}"))?;
    Ok(())
}

pub fn default_state() -> Result<AppState, String> {
    let adb = config::adb_path()?;
    Ok(AppState::new(AdbClient::new(adb), config::load_config()))
}
