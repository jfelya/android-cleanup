use crate::adb::{parse_df, AdbClient};
use crate::model::{DeletionStats, PackageResult};
use std::time::Instant;

pub fn select_packages(categories: &[String]) -> Vec<&'static str> {
    let mut out = Vec::new();
    let has = |id: &str| categories.iter().any(|c| c == id);
    if has("S3") || has("P1") || has("P2") || has("P3") || has("WA_MEDIA") {
        out.push("com.whatsapp");
    }
    if has("P4") || has("TG_MEDIA") {
        out.push("org.telegram.messenger");
    }
    if has("P7") {
        out.push("com.lenovo.anyshare.gps");
    }
    out.sort_unstable();
    out.dedup();
    out
}

pub fn force_stop_packages(
    client: &AdbClient,
    serial: &str,
    categories: &[String],
) -> Vec<PackageResult> {
    select_packages(categories)
        .into_iter()
        .map(|package| match client.shell(serial, &format!("am force-stop {package}")) {
            Ok(_) => PackageResult {
                package: package.into(),
                ok: true,
                message: "stopped".into(),
            },
            Err(e) => PackageResult {
                package: package.into(),
                ok: false,
                message: e,
            },
        })
        .collect()
}

pub fn parse_delete_output(text: &str) -> DeletionStats {
    let mut stats = DeletionStats::default();
    for line in text.lines() {
        let mut parts = line.splitn(3, '|');
        let kind = parts.next().unwrap_or_default();
        let size = parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        match kind {
            "OK" => {
                stats.ok += 1;
                stats.bytes += size;
            }
            "MISSING" => stats.missing += 1,
            "FAIL" => stats.failed += 1,
            _ => {}
        }
    }
    stats
}

pub fn delete_paths(
    client: &AdbClient,
    serial: &str,
    paths: &[String],
    mut on_line: impl FnMut(&str),
) -> Result<DeletionStats, String> {
    if paths.is_empty() {
        return Ok(DeletionStats::default());
    }
    let start = Instant::now();
    let script = r#"ok=0; miss=0; fail=0; bytes=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if [ -e "$p" ]; then
    s=$(stat -c %s "$p" 2>/dev/null)
    if rm -f -- "$p" 2>/dev/null; then
      ok=$((ok+1)); bytes=$((bytes + s)); echo "OK|$s|$p"
    else
      fail=$((fail+1)); echo "FAIL|$s|$p"
    fi
  else
    miss=$((miss+1)); echo "MISSING|0|$p"
  fi
done
echo "SUMMARY|$ok|$miss|$fail|$bytes""#;
    let input = paths.join("\n") + "\n";
    let out = client.shell_stdin(serial, script, &input)?;
    for line in out.lines() {
        if !line.starts_with("SUMMARY|") {
            on_line(line);
        }
    }
    let mut stats = parse_delete_output(&out);
    stats.duration_ms = start.elapsed().as_millis() as u64;
    Ok(stats)
}

pub fn trim_caches(client: &AdbClient, serial: &str, target_bytes: u64) -> Result<(), String> {
    client.shell(serial, &format!("pm trim-caches {target_bytes}"))?;
    Ok(())
}

pub fn free_space(client: &AdbClient, serial: &str) -> Result<u64, String> {
    let df = client.shell(serial, "df -k /storage/emulated/0")?;
    parse_df(&df)
        .map(|(_, free)| free)
        .ok_or_else(|| "cannot parse df output".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_known_packages_once() {
        let pkgs = select_packages(&[
            "S3".into(),
            "WA_MEDIA".into(),
            "TG_MEDIA".into(),
            "P7".into(),
        ]);
        assert_eq!(
            pkgs,
            vec![
                "com.lenovo.anyshare.gps",
                "com.whatsapp",
                "org.telegram.messenger"
            ]
        );
    }

    #[test]
    fn ignores_filesystem_only_categories() {
        assert!(select_packages(&["S1".into(), "P9".into()]).is_empty());
    }

    #[test]
    fn parses_delete_log_counts_and_bytes() {
        let text = "OK|10|/a\nOK|5|/b\nMISSING|0|/c\nFAIL|7|/d\nSUMMARY|2|1|1|15\n";
        let stats = parse_delete_output(text);
        assert_eq!(stats.ok, 2);
        assert_eq!(stats.missing, 1);
        assert_eq!(stats.failed, 1);
        assert_eq!(stats.bytes, 15);
    }
}
