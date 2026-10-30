use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub serial: String,
    pub state: String,
    pub product: String,
    pub model: String,
    pub device: String,
    pub android_version: String,
    pub sdk: String,
    pub storage_total: u64,
    pub storage_free: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub size: u64,
    pub mtime: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderStat {
    pub path: String,
    pub name: String,
    pub depth: usize,
    pub size: u64,
    pub files: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanData {
    pub serial: String,
    pub scanned_at: String,
    pub total_files: usize,
    pub total_bytes: u64,
    pub entries: Vec<FileEntry>,
    pub folders: Vec<FolderStat>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    Safe,
    Probable,
    Ask,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuleCategory {
    pub id: String,
    pub label: String,
    pub confidence: Confidence,
    pub description: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub category_id: String,
    pub path: String,
    pub size: u64,
    pub mtime: i64,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CategorySummary {
    pub id: String,
    pub label: String,
    pub confidence: Confidence,
    pub files: usize,
    pub bytes: u64,
    pub selected: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DryRunSummary {
    pub scan_files: usize,
    pub scan_bytes: u64,
    pub candidate_files: usize,
    pub candidate_bytes: u64,
    pub protected_exclusions: usize,
    pub duplicate_files: usize,
    pub duplicate_bytes: u64,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DryRun {
    pub id: String,
    pub generated_at: String,
    pub serial: String,
    pub summary: DryRunSummary,
    pub categories: Vec<CategorySummary>,
    pub protected_paths: Vec<String>,
    pub candidates: Vec<Candidate>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeletionStats {
    pub ok: usize,
    pub missing: usize,
    pub failed: usize,
    pub bytes: u64,
    pub duration_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionReport {
    pub id: String,
    pub executed_at: String,
    pub serial: String,
    pub before_free: u64,
    pub after_free: u64,
    pub files: DeletionStats,
    pub cache_trim_requested: bool,
    pub cache_trimmed_bytes: u64,
    pub log_path: String,
    pub report_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportPaths {
    pub json: String,
    pub csv: String,
    pub markdown: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PackageResult {
    pub package: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WirelessService {
    pub name: String,
    pub service_type: String,
    pub address: String,
}
