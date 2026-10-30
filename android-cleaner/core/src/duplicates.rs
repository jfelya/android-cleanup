use crate::adb::AdbClient;
use crate::model::FileEntry;
use crate::safety::is_protected;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub keep: FileEntry,
    pub duplicates: Vec<FileEntry>,
}

pub fn size_groups(
    entries: &[FileEntry],
    protected: &[String],
    cap_files: usize,
    cap_bytes: u64,
) -> Vec<Vec<FileEntry>> {
    let mut by_size: HashMap<u64, Vec<FileEntry>> = HashMap::new();
    for entry in entries {
        if entry.size == 0
            || entry
                .path
                .rsplit('/')
                .next()
                .is_some_and(|n| n == ".nomedia")
        {
            continue;
        }
        if entry.path.starts_with("/storage/emulated/0/Android/data/") {
            continue;
        }
        if is_protected(&entry.path, protected) {
            continue;
        }
        by_size.entry(entry.size).or_default().push(entry.clone());
    }
    let mut groups: Vec<Vec<FileEntry>> = by_size
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .map(|(_, files)| files)
        .collect();
    groups.sort_by(|a, b| b[0].size.cmp(&a[0].size));
    let mut selected = Vec::new();
    let mut files = 0usize;
    let mut bytes = 0u64;
    for group in groups {
        let group_bytes = group[0].size * group.len() as u64;
        if files + group.len() > cap_files || bytes + group_bytes > cap_bytes {
            break;
        }
        files += group.len();
        bytes += group_bytes;
        selected.push(group);
    }
    selected
}

pub fn hash_groups(
    client: &AdbClient,
    serial: &str,
    groups: &[Vec<FileEntry>],
) -> Result<Vec<DuplicateGroup>, String> {
    if groups.is_empty() {
        return Ok(Vec::new());
    }
    let paths: Vec<String> = groups.iter().flatten().map(|e| e.path.clone()).collect();
    let script = r#"while IFS= read -r p; do
  [ -f "$p" ] || continue
  sha256sum "$p" 2>/dev/null
done"#;
    let out = client.shell_stdin(serial, script, &(paths.join("\n") + "\n"))?;
    let by_path: HashMap<String, FileEntry> = groups
        .iter()
        .flatten()
        .map(|e| (e.path.clone(), e.clone()))
        .collect();
    let mut by_hash: HashMap<String, Vec<FileEntry>> = HashMap::new();
    for line in out.lines() {
        let Some((hash, path)) = line.split_once("  ") else {
            continue;
        };
        if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            continue;
        }
        if let Some(entry) = by_path.get(path.trim_end()) {
            by_hash
                .entry(hash.to_ascii_lowercase())
                .or_default()
                .push(entry.clone());
        }
    }
    let mut result = Vec::new();
    for (hash, mut files) in by_hash {
        if files.len() < 2 {
            continue;
        }
        files.sort_by_key(|f| (f.mtime, f.path.len()));
        let keep = files.remove(0);
        result.push(DuplicateGroup {
            hash,
            size: keep.size,
            keep,
            duplicates: files,
        });
    }
    result.sort_by(|a, b| {
        let ab = a.size * a.duplicates.len() as u64;
        let bb = b.size * b.duplicates.len() as u64;
        bb.cmp(&ab)
    });
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(path: &str, size: u64, mtime: i64) -> FileEntry {
        FileEntry {
            path: path.into(),
            size,
            mtime,
        }
    }

    #[test]
    fn groups_by_size_and_skips_protected_and_zero() {
        let protected = vec!["/storage/emulated/0/Fely".to_string()];
        let entries = vec![
            e("/storage/emulated/0/Download/a.zip", 100, 1),
            e("/storage/emulated/0/Download/b.zip", 100, 2),
            e("/storage/emulated/0/Fely/c.zip", 100, 3),
            e("/storage/emulated/0/Download/zero.zip", 0, 4),
            e("/storage/emulated/0/Android/data/x/y", 100, 5),
            e("/storage/emulated/0/Download/unique.zip", 200, 6),
        ];
        let groups = size_groups(&entries, &protected, 100, 1_000_000);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 2);
    }

    #[test]
    fn respects_hash_and_keeps_oldest() {
        let entries = vec![
            e("/storage/emulated/0/Download/new.jpg", 10, 200),
            e("/storage/emulated/0/Download/old.jpg", 10, 100),
        ];
        let by_path: HashMap<String, FileEntry> = entries
            .iter()
            .map(|e| (e.path.clone(), e.clone()))
            .collect();
        let mut by_hash: HashMap<String, Vec<FileEntry>> = HashMap::new();
        by_hash.insert(
            "a".repeat(64),
            vec![
                by_path["/storage/emulated/0/Download/new.jpg"].clone(),
                by_path["/storage/emulated/0/Download/old.jpg"].clone(),
            ],
        );
        let mut files = by_hash.into_values().next().unwrap();
        files.sort_by_key(|f| (f.mtime, f.path.len()));
        let keep = files.remove(0);
        assert_eq!(keep.path, "/storage/emulated/0/Download/old.jpg");
        assert_eq!(files[0].path, "/storage/emulated/0/Download/new.jpg");
    }
}
