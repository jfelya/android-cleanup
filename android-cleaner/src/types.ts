export type Confidence = "safe" | "probable" | "ask";

export interface DeviceRow {
  serial: string;
  state: string;
  product: string;
  model: string;
  device: string;
}

export interface DeviceInfo {
  serial: string;
  state: string;
  product: string;
  model: string;
  device: string;
  androidVersion: string;
  sdk: string;
  storageTotal: number;
  storageFree: number;
}

export interface FileEntry {
  path: string;
  size: number;
  mtime: number;
}

export interface FolderStat {
  path: string;
  name: string;
  depth: number;
  size: number;
  files: number;
}

export interface ScanData {
  serial: string;
  scannedAt: string;
  totalFiles: number;
  totalBytes: number;
  entries: FileEntry[];
  folders: FolderStat[];
}

export interface RuleCategory {
  id: string;
  label: string;
  confidence: Confidence;
  description: string;
}

export interface Candidate {
  categoryId: string;
  path: string;
  size: number;
  mtime: number;
  reason: string;
}

export interface CategorySummary {
  id: string;
  label: string;
  confidence: Confidence;
  files: number;
  bytes: number;
  selected: boolean;
}

export interface DryRunSummary {
  scanFiles: number;
  scanBytes: number;
  candidateFiles: number;
  candidateBytes: number;
  protectedExclusions: number;
  duplicateFiles: number;
  duplicateBytes: number;
  warnings: string[];
}

export interface DryRun {
  id: string;
  generatedAt: string;
  serial: string;
  summary: DryRunSummary;
  categories: CategorySummary[];
  protectedPaths: string[];
  candidates: Candidate[];
}

export interface AppConfig {
  protectedPaths: string[];
  enabledCategories: string[];
  deepDuplicates: boolean;
  duplicateCapFiles: number;
  duplicateCapBytes: number;
  cacheTrimEnabled: boolean;
  cacheTrimBytes: number;
}

export interface AppInfo {
  adbPath: string;
  dataDir: string;
  version: string;
}

export interface WirelessService {
  name: string;
  serviceType: string;
  address: string;
}

export interface DeletionStats {
  ok: number;
  missing: number;
  failed: number;
  bytes: number;
  durationMs: number;
}

export interface ExecutionReport {
  id: string;
  executedAt: string;
  serial: string;
  beforeFree: number;
  afterFree: number;
  files: DeletionStats;
  cacheTrimRequested: boolean;
  cacheTrimmedBytes: number;
  logPath: string;
  reportPath: string;
}

export type Page = "connect" | "dashboard" | "scan" | "rules" | "protected" | "report" | "logs" | "settings";
