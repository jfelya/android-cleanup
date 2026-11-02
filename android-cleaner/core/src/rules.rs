use crate::config::AppConfig;
use crate::model::{Candidate, Confidence, FileEntry, RuleCategory};
use crate::safety::is_protected;

const ROOT: &str = "/storage/emulated/0";
const WA: &str = "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp";
const TG: &str = "/storage/emulated/0/Android/data/org.telegram.messenger";

const MEDIA_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "heic", "mp4", "mkv", "ts", "mp3", "m4a", "flac",
    "wav", "opus", "3gp", "mov", "avi",
];

pub fn default_categories() -> Vec<RuleCategory> {
    let rows = [
        ("S1", "Ringtone trash", Confidence::Safe, "Deleted-media placeholders in Ringtones/_cache."),
        ("S2", "Gallery thumbnails", Confidence::Safe, "Pictures and Movies thumbnail caches; the gallery rebuilds them."),
        ("S3", "WhatsApp share temp", Confidence::Safe, "WhatsApp .Shared temp files older than 24 hours."),
        ("S4", "Zero-byte media", Confidence::Safe, "Unusable zero-byte media outside app data, excluding .nomedia markers."),
        ("S5", "Stale lock files", Confidence::Safe, "Zero-byte .lock files left by GeForce NOW."),
        ("S6", "MIUI bug-report cache", Confidence::Safe, "MIUI bug-report image/cache files."),
        ("S7", "Android cache marker", Confidence::Safe, "System cache marker under Android/cache."),
        ("P1", "WhatsApp link previews", Confidence::Probable, "WhatsApp .Links preview cache; re-downloaded when needed."),
        ("P2", "WhatsApp status cache", Confidence::Probable, "Viewed status media cache."),
        ("P3", "WhatsApp sticker backups", Confidence::Probable, "Sticker backup copies; current stickers stay."),
        ("P4", "Telegram cache", Confidence::Probable, "Telegram cache directory; the app rebuilds it."),
        ("P5", "Wild Rift logs", Confidence::Probable, "Diagnostic logs from Wild Rift."),
        ("P6", "Other app logs", Confidence::Probable, "Other .log files outside Wild Rift."),
        ("P7", "SHAREit cache", Confidence::Probable, "Old SHAREit transfer cache."),
        ("P8", "ReadEra covers", Confidence::Probable, "Book cover cache; regenerated from books."),
        ("P9", "Incomplete downloads", Confidence::Probable, "Partial .crdownload files."),
        ("P10", "Hash duplicates", Confidence::Probable, "Exact duplicates confirmed by SHA-256; one copy is kept."),
        ("WA_MEDIA", "WhatsApp media", Confidence::Ask, "Images, video, audio, voice notes, GIFs, and stickers inside chats."),
        ("TG_MEDIA", "Telegram media", Confidence::Ask, "Images, video, audio, and stories inside chats."),
        ("CUSTOM", "Custom junk", Confidence::Probable, "User-defined junk folders and extensions."),
    ];
    rows.into_iter()
        .map(|(id, label, confidence, description)| RuleCategory {
            id: id.into(),
            label: label.into(),
            confidence,
            description: description.into(),
        })
        .collect()
}

fn under(path: &str, prefix: &str) -> bool {
    path == prefix || path.starts_with(&format!("{prefix}/"))
}

fn name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn ext(path: &str) -> String {
    name(path)
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default()
}

fn is_media(path: &str) -> bool {
    MEDIA_EXTS.contains(&ext(path).as_str())
}

fn is_nomedia(path: &str) -> bool {
    name(path) == ".nomedia"
}

pub fn evaluate_at(entries: &[FileEntry], config: &AppConfig, now: i64) -> Vec<Candidate> {
    let mut out = Vec::new();
    for entry in entries {
        let path = entry.path.as_str();
        if is_protected(path, &config.protected_paths) {
            continue;
        }
        if let Some(custom) = config.custom_rules.iter().find(|rule| {
            under(path, &rule.path_prefix)
                && (rule.extensions.is_empty()
                    || rule
                        .extensions
                        .iter()
                        .any(|wanted| wanted.trim_start_matches('.').eq_ignore_ascii_case(&ext(path))))
        }) {
            out.push(Candidate {
                category_id: "CUSTOM".into(),
                path: entry.path.clone(),
                size: entry.size,
                mtime: entry.mtime,
                reason: format!("custom: {}", custom.label),
            });
            continue;
        }
        let Some((id, reason)) = classify(entry, now) else {
            continue;
        };
        out.push(Candidate {
            category_id: id.into(),
            path: entry.path.clone(),
            size: entry.size,
            mtime: entry.mtime,
            reason: reason.into(),
        });
    }
    out
}

pub fn evaluate(entries: &[FileEntry], config: &AppConfig) -> Vec<Candidate> {
    evaluate_at(entries, config, chrono::Local::now().timestamp())
}

fn classify(entry: &FileEntry, now: i64) -> Option<(&'static str, &'static str)> {
    let path = entry.path.as_str();
    let filename = name(path);

    if under(path, &format!("{ROOT}/Ringtones/_cache")) && filename.starts_with(".trashed-") {
        return Some(("S1", "ringtone trash"));
    }
    if under(path, &format!("{ROOT}/Pictures/.thumbnails"))
        || under(path, &format!("{ROOT}/Movies/.thumbnails"))
    {
        return Some(("S2", "thumbnail cache"));
    }
    if under(path, &format!("{WA}/.Shared"))
        && filename.ends_with(".tmp")
        && entry.mtime < now - 86_400
    {
        return Some(("S3", "stale WhatsApp share temp"));
    }
    if entry.size == 0
        && !under(path, &format!("{ROOT}/Android/data"))
        && !under(path, &format!("{WA}/.Shared"))
        && !is_nomedia(path)
        && is_media(path)
    {
        return Some(("S4", "zero-byte media"));
    }
    if filename.starts_with(".lock_") && !under(path, &format!("{ROOT}/Android/data")) {
        return Some(("S5", "stale lock file"));
    }
    if under(path, &format!("{ROOT}/MIUI/BugReportCache")) {
        return Some(("S6", "MIUI bug-report cache"));
    }
    if under(path, &format!("{ROOT}/Android/cache")) {
        return Some(("S7", "Android cache marker"));
    }
    if under(path, &format!("{WA}/Media/.Links")) {
        return Some(("P1", "WhatsApp link preview cache"));
    }
    if under(path, &format!("{WA}/Media/.Statuses")) {
        return Some(("P2", "WhatsApp status cache"));
    }
    if under(path, &format!("{WA}/Backups/Stickers")) {
        return Some(("P3", "WhatsApp sticker backup"));
    }
    if under(path, &format!("{TG}/cache")) {
        return Some(("P4", "Telegram cache"));
    }
    if under(path, &format!("{ROOT}/Android/data/com.riotgames.league.wildrift/files/Log")) {
        return Some(("P5", "Wild Rift diagnostic log"));
    }
    if filename.ends_with(".log") {
        return Some(("P6", "app log"));
    }
    if under(path, &format!("{ROOT}/SHAREit")) || under(path, &format!("{ROOT}/.SHAREit")) {
        return Some(("P7", "SHAREit transfer cache"));
    }
    if under(path, &format!("{ROOT}/ReadEra/Covers")) {
        return Some(("P8", "ReadEra cover cache"));
    }
    if filename.ends_with(".crdownload") {
        return Some(("P9", "incomplete download"));
    }
    if under(path, &format!("{WA}/Media")) && !is_nomedia(path) {
        for folder in [
            "WhatsApp Images",
            "WhatsApp Video",
            "WhatsApp Audio",
            "WhatsApp Voice Notes",
            "WhatsApp Animated Gifs",
            "WhatsApp Stickers",
            "WhatsApp Video Notes",
            "WhatsApp AI Media",
            "WhatsApp Sticker Packs",
            "WhatsApp Backup Excluded Stickers",
        ] {
            if under(path, &format!("{WA}/Media/{folder}")) {
                return Some(("WA_MEDIA", "WhatsApp media"));
            }
        }
    }
    if under(path, &format!("{TG}/files/Telegram")) && !is_nomedia(path) {
        for folder in ["Telegram Images", "Telegram Video", "Telegram Audio", "Telegram Stories"] {
            if under(path, &format!("{TG}/files/Telegram/{folder}")) {
                return Some(("TG_MEDIA", "Telegram media"));
            }
        }
    }
    None
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

    fn id_for(entry: &FileEntry, now: i64) -> Option<String> {
        let cfg = AppConfig::default();
        evaluate_at(std::slice::from_ref(entry), &cfg, now)
            .first()
            .map(|c| c.category_id.clone())
    }

    #[test]
    fn matches_safe_categories() {
        let now = 1_700_000_000;
        assert_eq!(
            id_for(&e("/storage/emulated/0/Ringtones/_cache/.trashed-1-x.mp3", 0, now), now),
            Some("S1".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Pictures/.thumbnails/1.jpg", 10, now), now),
            Some("S2".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/.Shared/a.tmp", 10, now - 90_000), now),
            Some("S3".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/.Shared/new.tmp", 10, now - 10), now),
            None
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Movies/zero.jpg", 0, now), now),
            Some("S4".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Fely/.nomedia", 0, now), now),
            None
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Movies/.lock_123", 0, now), now),
            Some("S5".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/MIUI/BugReportCache/image/a.png", 10, now), now),
            Some("S6".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/cache/.system_cache", 10, now), now),
            Some("S7".into())
        );
    }

    #[test]
    fn matches_probable_categories() {
        let now = 1_700_000_000;
        let wa = "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp";
        assert_eq!(id_for(&e(&format!("{wa}/Media/.Links/x"), 10, now), now), Some("P1".into()));
        assert_eq!(id_for(&e(&format!("{wa}/Media/.Statuses/x"), 10, now), now), Some("P2".into()));
        assert_eq!(id_for(&e(&format!("{wa}/Backups/Stickers/x"), 10, now), now), Some("P3".into()));
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/data/org.telegram.messenger/cache/x", 10, now), now),
            Some("P4".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/data/com.riotgames.league.wildrift/files/Log/a.log", 10, now), now),
            Some("P5".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/data/org.videolan.vlc/files/a.log", 10, now), now),
            Some("P6".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/SHAREit/.offline/x", 10, now), now),
            Some("P7".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/ReadEra/Covers/x.jpg", 10, now), now),
            Some("P8".into())
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/data/x/a.crdownload", 10, now), now),
            Some("P9".into())
        );
    }

    #[test]
    fn matches_media_categories_and_excludes_nomedia() {
        let now = 1_700_000_000;
        let wa = "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp";
        assert_eq!(
            id_for(&e(&format!("{wa}/Media/WhatsApp Video/a.mp4"), 10, now), now),
            Some("WA_MEDIA".into())
        );
        assert_eq!(
            id_for(&e(&format!("{wa}/Media/WhatsApp Video/.nomedia"), 10, now), now),
            None
        );
        assert_eq!(
            id_for(&e("/storage/emulated/0/Android/data/org.telegram.messenger/files/Telegram/Telegram Images/a.jpg", 10, now), now),
            Some("TG_MEDIA".into())
        );
    }

    #[test]
    fn protected_paths_are_removed_before_candidates() {
        let now = 1_700_000_000;
        let cfg = AppConfig::default();
        let entries = vec![
            e("/storage/emulated/0/Fely/Media/a.log", 10, now),
            e("/storage/emulated/0/Download/a.log", 10, now),
            e("/storage/emulated/0/Android/data/org.videolan.vlc/files/a.log", 10, now),
        ];
        let got = evaluate_at(&entries, &cfg, now);
        assert_eq!(got.len(), 1);
        assert!(got[0].path.contains("org.videolan.vlc"));
    }

    #[test]
    fn matches_custom_rules_and_respects_extensions() {
        let now = 1_700_000_000;
        let mut cfg = AppConfig::default();
        cfg.custom_rules.push(crate::config::CustomRule {
            label: "My cache".into(),
            path_prefix: "/storage/emulated/0/MyCache".into(),
            extensions: vec!["tmp".into()],
        });
        let entries = vec![
            e("/storage/emulated/0/MyCache/a.tmp", 10, now),
            e("/storage/emulated/0/MyCache/a.jpg", 10, now),
            e("/storage/emulated/0/Fely/MyCache/a.tmp", 10, now),
        ];
        let got = evaluate_at(&entries, &cfg, now);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].category_id, "CUSTOM");
    }
}
