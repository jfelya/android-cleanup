use crate::config::AppConfig;
use crate::duplicates::DuplicateGroup;
use crate::model::{
    Candidate, CategorySummary, DryRun, DryRunSummary, ReportPaths, ScanData,
};
use crate::rules;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub fn build_dry_run(
    scan: &ScanData,
    candidates: &[Candidate],
    protected: &[String],
    duplicate_groups: &[DuplicateGroup],
    config: &AppConfig,
) -> DryRun {
    let defs = rules::default_categories();
    let mut by_cat: HashMap<&str, (usize, u64)> = HashMap::new();
    for c in candidates {
        let slot = by_cat.entry(c.category_id.as_str()).or_insert((0, 0));
        slot.0 += 1;
        slot.1 += c.size;
    }
    let categories: Vec<CategorySummary> = defs
        .iter()
        .map(|d| {
            let (files, bytes) = by_cat.get(d.id.as_str()).copied().unwrap_or((0, 0));
            CategorySummary {
                id: d.id.clone(),
                label: d.label.clone(),
                confidence: d.confidence.clone(),
                files,
                bytes,
                selected: config.enabled_categories.contains(&d.id),
            }
        })
        .collect();
    let selected: Vec<Candidate> = candidates
        .iter()
        .filter(|c| config.enabled_categories.contains(&c.category_id))
        .cloned()
        .collect();
    let duplicate_files = duplicate_groups.iter().map(|g| g.duplicates.len()).sum();
    let duplicate_bytes: u64 = duplicate_groups
        .iter()
        .map(|g| g.size * g.duplicates.len() as u64)
        .sum();
    let mut warnings = Vec::new();
    if selected.iter().any(|c| c.category_id == "WA_MEDIA") {
        warnings.push(
            "WhatsApp media will disappear from chats. Databases and documents are kept."
                .to_string(),
        );
    }
    if selected.iter().any(|c| c.category_id == "TG_MEDIA") {
        warnings.push(
            "Telegram media will disappear from chats. Documents and files are kept.".to_string(),
        );
    }
    if selected.iter().any(|c| c.category_id == "P10") {
        warnings.push("Duplicate cleanup keeps one copy of each hash group.".to_string());
    }
    if config.cache_trim_enabled {
        warnings.push(format!(
            "App cache trim will run after deletion, targeting about {:.1} GB.",
            config.cache_trim_bytes as f64 / 1_073_741_824.0
        ));
    }
    let id = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    DryRun {
        id,
        generated_at: chrono::Local::now().to_rfc3339(),
        serial: scan.serial.clone(),
        summary: DryRunSummary {
            scan_files: scan.total_files,
            scan_bytes: scan.total_bytes,
            candidate_files: selected.len(),
            candidate_bytes: selected.iter().map(|c| c.size).sum(),
            protected_exclusions: 0,
            duplicate_files,
            duplicate_bytes,
            warnings,
        },
        categories,
        protected_paths: protected.to_vec(),
        candidates: selected,
    }
}

pub fn write_report(base: &Path, dry: &DryRun) -> Result<ReportPaths, String> {
    let dir = base.join("reports").join(&dry.id);
    fs::create_dir_all(&dir).map_err(|e| format!("create report dir: {e}"))?;
    let json_path = dir.join("dry-run.json");
    let csv_path = dir.join("candidates.csv");
    let md_path = dir.join("dry-run.md");
    fs::write(
        &json_path,
        serde_json::to_string_pretty(dry).map_err(|e| format!("serialize report: {e}"))?,
    )
    .map_err(|e| format!("write json: {e}"))?;
    let mut csv = String::from("category,size_bytes,mtime,path\n");
    for c in &dry.candidates {
        csv.push_str(&format!(
            "{},{},{},{}\n",
            c.category_id,
            c.size,
            c.mtime,
            csv_escape(&c.path)
        ));
    }
    fs::write(&csv_path, csv).map_err(|e| format!("write csv: {e}"))?;
    fs::write(&md_path, markdown(dry)).map_err(|e| format!("write markdown: {e}"))?;
    Ok(ReportPaths {
        json: json_path.display().to_string(),
        csv: csv_path.display().to_string(),
        markdown: md_path.display().to_string(),
    })
}

pub fn markdown(dry: &DryRun) -> String {
    let mut out = String::new();
    out.push_str("# Android Storage Cleaner — dry run\n\n");
    out.push_str(&format!("- Device: `{}`\n", dry.serial));
    out.push_str(&format!("- Generated: {}\n", dry.generated_at));
    out.push_str(&format!("- Files selected: **{}**\n", dry.summary.candidate_files));
    out.push_str(&format!(
        "- Bytes selected: **{}** ({:.2} MiB)\n",
        dry.summary.candidate_bytes,
        dry.summary.candidate_bytes as f64 / 1_048_576.0
    ));
    out.push_str(&format!(
        "- Duplicate copies: {} ({:.2} MiB)\n\n",
        dry.summary.duplicate_files,
        dry.summary.duplicate_bytes as f64 / 1_048_576.0
    ));
    if !dry.summary.warnings.is_empty() {
        out.push_str("## Warnings\n\n");
        for warning in &dry.summary.warnings {
            out.push_str(&format!("- {warning}\n"));
        }
        out.push('\n');
    }
    out.push_str("## Categories\n\n| ID | Category | Confidence | Files | MiB |\n|---|---|---|---:|---:|\n");
    for c in &dry.categories {
        out.push_str(&format!(
            "| {} | {} | {:?} | {} | {:.2} |\n",
            c.id,
            c.label,
            c.confidence,
            c.files,
            c.bytes as f64 / 1_048_576.0
        ));
    }
    out.push_str("\n## Protected paths\n\n");
    for p in &dry.protected_paths {
        out.push_str(&format!("- `{p}`\n"));
    }
    out.push_str("\n## First candidates\n\n");
    for c in dry.candidates.iter().take(100) {
        out.push_str(&format!("- `{}` — {} bytes ({})\n", c.path, c.size, c.category_id));
    }
    if dry.candidates.len() > 100 {
        out.push_str(&format!(
            "\n… and {} more. See candidates.csv.\n",
            dry.candidates.len() - 100
        ));
    }
    out
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

pub fn report_dirs(base: &Path) -> Vec<PathBuf> {
    let dir = base.join("reports");
    let mut out: Vec<PathBuf> = fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out.reverse();
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Confidence, FolderStat};

    fn scan() -> ScanData {
        ScanData {
            serial: "SERIAL".into(),
            scanned_at: "now".into(),
            total_files: 2,
            total_bytes: 20,
            entries: vec![],
            folders: Vec::<FolderStat>::new(),
        }
    }

    fn candidate(cat: &str, path: &str, size: u64) -> Candidate {
        Candidate {
            category_id: cat.into(),
            path: path.into(),
            size,
            mtime: 1,
            reason: "test".into(),
        }
    }

    #[test]
    fn csv_quotes_paths_with_commas_and_quotes() {
        assert_eq!(csv_escape("/a,b"), "\"/a,b\"");
        assert_eq!(csv_escape("/a\"b"), "\"/a\"\"b\"");
        assert_eq!(csv_escape("/plain"), "/plain");
    }

    #[test]
    fn markdown_reports_totals_and_warnings() {
        let cfg = AppConfig::default();
        let candidates = vec![candidate("WA_MEDIA", "/a.jpg", 10)];
        let mut dry = build_dry_run(&scan(), &candidates, &cfg.protected_paths, &[], &cfg);
        dry.generated_at = "2026-01-01".into();
        let md = markdown(&dry);
        assert!(md.contains("SERIAL"));
        assert!(md.contains("WhatsApp media will disappear"));
        assert!(md.contains("WA_MEDIA"));
        assert!(md.contains("`/a.jpg`"));
    }

    #[test]
    fn summary_only_counts_enabled_categories() {
        let mut cfg = AppConfig::default();
        cfg.enabled_categories = vec!["S1".into()];
        let candidates = vec![
            candidate("S1", "/a", 10),
            candidate("WA_MEDIA", "/b", 20),
        ];
        let dry = build_dry_run(&scan(), &candidates, &cfg.protected_paths, &[], &cfg);
        assert_eq!(dry.summary.candidate_files, 1);
        assert_eq!(dry.summary.candidate_bytes, 10);
        let wa = dry.categories.iter().find(|c| c.id == "WA_MEDIA").unwrap();
        assert_eq!(wa.confidence, Confidence::Ask);
        assert!(!wa.selected);
    }
}
