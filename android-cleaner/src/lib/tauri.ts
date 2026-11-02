import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppConfig,
  AppInfo,
  CategorySummary,
  DeviceInfo,
  DeviceRow,
  DiskStats,
  DryRun,
  ExecutionReport,
  HealthSnapshot,
  RuleCategory,
  ScanData,
  WirelessService,
} from "../types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  listDevices: () => call<DeviceRow[]>("list_devices"),
  deviceInfo: (serial: string) => call<DeviceInfo>("device_info", { serial }),
  mdnsServices: () => call<WirelessService[]>("mdns_services"),
  pairWireless: (host: string, code: string) =>
    call<string>("pair_wireless", { host, code }),
  connectWireless: (host: string) => call<string>("connect_wireless", { host }),
  disconnectWireless: (host: string) =>
    call<string>("disconnect_wireless", { host }),
  loadConfig: () => call<AppConfig>("load_config"),
  saveConfig: (config: AppConfig) => call<void>("save_config", { config }),
  ruleCategories: () => call<RuleCategory[]>("rule_categories"),
  scanDevice: (serial: string) => call<ScanData>("scan_device", { serial }),
  cancelScan: () => call<void>("cancel_scan"),
  scanRuleCounts: (serial: string) =>
    call<CategorySummary[]>("scan_rule_counts", { serial }),
  buildDryRun: (serial: string, language: string) =>
    call<DryRun>("build_dry_run", { serial, language }),
  executeCleanup: (serial: string, confirmation: string, paths: string[], language: string) =>
    call<ExecutionReport>("execute_cleanup", { serial, confirmation, paths, language }),
  trimCache: (serial: string, targetBytes: number) =>
    call<number>("trim_cache", { serial, targetBytes }),
  diskStats: (serial: string) => call<DiskStats>("disk_stats", { serial }),
  deviceHealth: (serial: string) => call<HealthSnapshot>("device_health", { serial }),
  readText: (path: string) => call<string>("read_text", { path }),
  listReports: () => call<string[]>("list_reports"),
  openDataDir: () => call<void>("open_data_dir"),
};

export function onScanProgress(handler: (count: number) => void): Promise<UnlistenFn> {
  return listen<number>("scan-progress", (event) => handler(event.payload));
}

export function onCleanupProgress(handler: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>("cleanup-progress", (event) => handler(event.payload));
}

export function onDryRunProgress(handler: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>("dry-run-progress", (event) => handler(event.payload));
}
