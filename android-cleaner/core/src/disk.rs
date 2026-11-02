use crate::adb::AdbClient;
use crate::model::DiskStats;

pub fn parse_diskstats(text: &str) -> DiskStats {
    let mut stats = DiskStats::default();
    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim() == "Data-Free" {
            stats.free_bytes = value
                .trim()
                .split_whitespace()
                .next()
                .and_then(|v| v.trim_end_matches('K').parse::<u64>().ok())
                .unwrap_or(0)
                * 1024;
            continue;
        }
        let Ok(bytes) = value.trim().parse::<u64>() else {
            continue;
        };
        match key.trim() {
            "App Cache Size" => stats.app_cache_bytes = bytes,
            "App Data Size" => stats.app_data_bytes = bytes,
            _ => {}
        }
    }
    stats
}

pub fn disk_stats(client: &AdbClient, serial: &str) -> Result<DiskStats, String> {
    let out = client.shell(serial, "dumpsys diskstats")?;
    Ok(parse_diskstats(&out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_app_cache_and_free_space() {
        let text = "Data-Free: 38463476K / 238122976K total = 16% free\nApp Size: 28520844800\nApp Data Size: 87319325152\nApp Cache Size: 2931286016\n";
        let stats = parse_diskstats(text);
        assert_eq!(stats.app_cache_bytes, 2_931_286_016);
        assert_eq!(stats.app_data_bytes, 87_319_325_152);
        assert_eq!(stats.free_bytes, 38_463_476 * 1024);
    }
}
