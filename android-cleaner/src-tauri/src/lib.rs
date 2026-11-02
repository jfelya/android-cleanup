mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = commands::default_state().expect("failed to prepare embedded adb");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::list_devices,
            commands::device_info,
            commands::mdns_services,
            commands::pair_wireless,
            commands::connect_wireless,
            commands::disconnect_wireless,
            commands::load_config,
            commands::save_config,
            commands::rule_categories,
            commands::cancel_scan,
            commands::scan_device,
            commands::scan_rule_counts,
            commands::device_health,
            commands::build_dry_run,
            commands::execute_cleanup,
            commands::trim_cache,
            commands::disk_stats,
            commands::read_text,
            commands::list_reports,
            commands::open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
