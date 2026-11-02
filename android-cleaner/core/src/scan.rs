use crate::adb::AdbClient;
use crate::model::{FileEntry, FileTypeStat, FolderStat, ScanData};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const ROOT: &str = "/storage/emulated/0";
pub const SCAN_COMMAND: &str =
    "find /storage/emulated/0 -type f -print0 2>/dev/null | xargs -0 stat -c '%s|%Y|%n' 2>/dev/null";

pub fn parse_stat_line(line: &str) -> Option<FileEntry> {
    let mut parts = line.splitn(3, '|');
    let size = parts.next()?.trim().parse::<u64>().ok()?;
    let mtime = parts.next()?.trim().parse::<i64>().ok()?;
    let path = parts.next()?.trim_end_matches('\r');
    if !path.starts_with('/') {
        return None;
    }
    Some(FileEntry {
        path: path.to_string(),
        size,
        mtime,
    })
}

pub fn parse_stat_output(text: &str) -> Vec<FileEntry> {
    text.lines().filter_map(parse_stat_line).collect()
}

pub fn build_folder_stats(entries: &[FileEntry]) -> Vec<FolderStat> {
    let mut map: BTreeMap<String, (u64, u64)> = BTreeMap::new();
    for entry in entries {
        let rel = entry.path.strip_prefix(ROOT).unwrap_or(&entry.path);
        let parts: Vec<&str> = rel.split('/').filter(|p| !p.is_empty()).collect();
        for i in 1..parts.len() {
            let dir = format!("{}/{}", ROOT, parts[..i].join("/"));
            let slot = map.entry(dir).or_insert((0, 0));
            slot.0 += entry.size;
            slot.1 += 1;
        }
    }
    map.into_iter()
        .map(|(path, (size, files))| {
            let name = path.rsplit('/').next().unwrap_or(&path).to_string();
            let depth = path.matches('/').count().saturating_sub(3);
            FolderStat {
                path,
                name,
                depth,
                size,
                files,
            }
        })
        .collect()
}

pub fn build_type_stats(entries: &[FileEntry]) -> Vec<FileTypeStat> {
    let mut map: BTreeMap<&'static str, (usize, u64)> = BTreeMap::new();
    for entry in entries {
        let kind = type_kind(&entry.path);
        let slot = map.entry(kind).or_insert((0, 0));
        slot.0 += 1;
        slot.1 += entry.size;
    }
    ["images", "video", "audio", "documents", "archives", "apk", "other"]
        .into_iter()
        .map(|kind| {
            let (files, bytes) = map.get(kind).copied().unwrap_or((0, 0));
            FileTypeStat {
                kind: kind.to_string(),
                files,
                bytes,
            }
        })
        .collect()
}

fn type_kind(path: &str) -> &'static str {
    let ext = path
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "avif" | "bmp" | "svg" => "images",
        "mp4" | "mkv" | "ts" | "webm" | "mov" | "avi" | "3gp" | "m4v" => "video",
        "mp3" | "m4a" | "flac" | "wav" | "opus" | "ogg" | "aac" | "wma" => "audio",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "csv"
        | "epub" | "json" | "xml" => "documents",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" => "archives",
        "apk" | "apks" | "xapk" => "apk",
        _ => "other",
    }
}

pub fn scan(
    serial: &str,
    client: &AdbClient,
    mut on_progress: impl FnMut(usize),
    cancelled: Arc<AtomicBool>,
) -> Result<ScanData, String> {
    client.start_server()?;
    let mut entries = Vec::new();
    client.stream_exec_out(
        serial,
        SCAN_COMMAND,
        |line| {
            if let Some(entry) = parse_stat_line(line) {
                entries.push(entry);
                if entries.len() % 500 == 0 {
                    on_progress(entries.len());
                }
            }
        },
        || cancelled.load(Ordering::Relaxed),
    )?;
    on_progress(entries.len());
    let total_bytes = entries.iter().map(|e| e.size).sum();
    let folders = build_folder_stats(&entries);
    let type_stats = build_type_stats(&entries);
    Ok(ScanData {
        serial: serial.to_string(),
        scanned_at: chrono::Local::now().to_rfc3339(),
        total_files: entries.len(),
        total_bytes,
        entries,
        folders,
        type_stats,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, size: u64) -> FileEntry {
        FileEntry {
            path: path.into(),
            size,
            mtime: 0,
        }
    }

    #[test]
    fn parses_regular_and_spaced_paths() {
        assert_eq!(
            parse_stat_line("123|1700000000|/storage/emulated/0/Download/a file.zip"),
            Some(FileEntry {
                path: "/storage/emulated/0/Download/a file.zip".into(),
                size: 123,
                mtime: 1700000000
            })
        );
        assert_eq!(
            parse_stat_line("9|1700000001|/storage/emulated/0/Fely/Media/ñandú.jpg"),
            Some(FileEntry {
                path: "/storage/emulated/0/Fely/Media/ñandú.jpg".into(),
                size: 9,
                mtime: 1700000001
            })
        );
    }

    #[test]
    fn rejects_malformed_lines() {
        assert!(parse_stat_line("bad").is_none());
        assert!(parse_stat_line("12|nope|/storage/emulated/0/a").is_none());
        assert!(parse_stat_line("12|34|relative/path").is_none());
    }

    #[test]
    fn folder_totals_roll_up() {
        let entries = vec![
            entry("/storage/emulated/0/DCIM/Camera/a.jpg", 100),
            entry("/storage/emulated/0/DCIM/Camera/b.jpg", 50),
            entry("/storage/emulated/0/Download/c.zip", 25),
        ];
        let stats = build_folder_stats(&entries);
        let dcim = stats
            .iter()
            .find(|s| s.path == "/storage/emulated/0/DCIM")
            .unwrap();
        assert_eq!(dcim.size, 150);
        assert_eq!(dcim.files, 2);
        assert_eq!(dcim.depth, 1);
        let camera = stats
            .iter()
            .find(|s| s.path == "/storage/emulated/0/DCIM/Camera")
            .unwrap();
        assert_eq!(camera.size, 150);
        assert_eq!(camera.depth, 2);
    }

    #[test]
    fn parses_multiple_lines_and_skips_bad() {
        let text = "1|10|/storage/emulated/0/a\nbad\n2|11|/storage/emulated/0/b\n";
        assert_eq!(parse_stat_output(text).len(), 2);
    }

    #[test]
    fn groups_file_types() {
        let entries = vec![
            entry("/storage/emulated/0/a.jpg", 10),
            entry("/storage/emulated/0/b.mp4", 20),
            entry("/storage/emulated/0/c.zip", 30),
            entry("/storage/emulated/0/d.apk", 40),
            entry("/storage/emulated/0/e.unknown", 50),
        ];
        let stats = build_type_stats(&entries);
        let get = |kind: &str| stats.iter().find(|s| s.kind == kind).unwrap();
        assert_eq!(get("images").bytes, 10);
        assert_eq!(get("video").bytes, 20);
        assert_eq!(get("archives").bytes, 30);
        assert_eq!(get("apk").bytes, 40);
        assert_eq!(get("other").bytes, 50);
    }
}
