use crate::adb::AdbClient;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub thermal_status: i32,
    pub cpu_temp_c: f32,
    pub skin_temp_c: f32,
    pub battery_temp_c: f32,
    pub load1: f32,
    pub load5: f32,
    pub load15: f32,
    pub running_threads: u32,
    pub total_threads: u32,
    pub mem_total_kb: u64,
    pub mem_available_kb: u64,
    pub swap_total_kb: u64,
    pub swap_free_kb: u64,
    pub pswpout: u64,
    pub pswpin: u64,
    pub pgmajfault: u64,
    pub pgsteal_direct: u64,
    pub kills: Vec<KillEvent>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct KillEvent {
    pub timestamp: String,
    pub package: String,
    pub reason: String,
    pub uid: i32,
    pub pss_kb: u64,
}

pub fn parse_loadavg(text: &str) -> Option<(f32, f32, f32, u32, u32)> {
    let line = text.lines().find(|l| l.split_whitespace().count() >= 4)?;
    let fields: Vec<&str> = line.split_whitespace().collect();
    let load1 = fields.first()?.parse().ok()?;
    let load5 = fields.get(1)?.parse().ok()?;
    let load15 = fields.get(2)?.parse().ok()?;
    let (running, total) = fields.get(3)?.split_once('/')?;
    Some((
        load1,
        load5,
        load15,
        running.parse().ok()?,
        total.parse().ok()?,
    ))
}

pub fn parse_meminfo(text: &str) -> (u64, u64, u64, u64) {
    let mut total = 0;
    let mut available = 0;
    let mut swap_total = 0;
    let mut swap_free = 0;
    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value
            .trim()
            .trim_end_matches(" kB")
            .trim()
            .parse::<u64>()
            .unwrap_or(0);
        match key.trim() {
            "MemTotal" => total = value,
            "MemAvailable" => available = value,
            "SwapTotal" => swap_total = value,
            "SwapFree" => swap_free = value,
            _ => {}
        }
    }
    (total, available, swap_total, swap_free)
}

pub fn parse_vmstat(text: &str) -> (u64, u64, u64, u64) {
    let mut pswpout = 0;
    let mut pswpin = 0;
    let mut pgmajfault = 0;
    let mut pgsteal_direct = 0;
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let Some(key) = parts.next() else { continue };
        let value = parts.next().and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        match key {
            "pswpout" => pswpout = value,
            "pswpin" => pswpin = value,
            "pgmajfault" => pgmajfault = value,
            "pgsteal_direct" => pgsteal_direct = value,
            _ => {}
        }
    }
    (pswpout, pswpin, pgmajfault, pgsteal_direct)
}

pub fn parse_thermal(text: &str) -> (i32, f32, f32, f32) {
    let mut status = 0;
    let mut cpu = 0.0;
    let mut skin = 0.0;
    let mut battery = 0.0;
    let mut in_current = false;
    for line in text.lines() {
        if let Some(value) = line.trim().strip_prefix("Thermal Status:") {
            status = value.trim().parse().unwrap_or(0);
        }
        if line.contains("Current temperatures from HAL") {
            in_current = true;
            continue;
        }
        if in_current && line.contains("Cooling devices") {
            in_current = false;
        }
        if !in_current || !line.contains("Temperature{") {
            continue;
        }
        let name = line
            .split("mName=")
            .nth(1)
            .and_then(|rest| rest.split(',').next())
            .unwrap_or("");
        let value = line
            .split("mValue=")
            .nth(1)
            .and_then(|rest| rest.split(',').next())
            .and_then(|v| v.parse::<f32>().ok())
            .unwrap_or(0.0);
        match name {
            "CPU" => cpu = value,
            "SKIN" => skin = value,
            "BATTERY" => battery = value,
            _ => {}
        }
    }
    (status, cpu, skin, battery)
}

pub fn parse_am_kills(text: &str) -> Vec<KillEvent> {
    let mut out = Vec::new();
    for line in text.lines() {
        let Some((_, rest)) = line.split_once("am_kill : ") else {
            continue;
        };
        let body = rest.trim().trim_start_matches('[').trim_end_matches(']');
        let parts: Vec<&str> = body.split(',').collect();
        if parts.len() < 6 {
            continue;
        }
        let timestamp = line
            .split_whitespace()
            .take(2)
            .collect::<Vec<_>>()
            .join(" ");
        out.push(KillEvent {
            timestamp,
            uid: parts[0].parse().unwrap_or(0),
            package: parts[2].to_string(),
            reason: parts[4].to_string(),
            pss_kb: parts[5].parse().unwrap_or(0),
        });
    }
    out
}

pub fn parse_snapshot(thermal_text: &str, system_text: &str, kill_text: &str) -> HealthSnapshot {
    let (load1, load5, load15, running, total) = parse_loadavg(system_text).unwrap_or_default();
    let (mem_total, mem_available, swap_total, swap_free) = parse_meminfo(system_text);
    let (pswpout, pswpin, pgmajfault, pgsteal_direct) = parse_vmstat(system_text);
    let (thermal_status, cpu, skin, battery) = parse_thermal(thermal_text);
    HealthSnapshot {
        thermal_status,
        cpu_temp_c: cpu,
        skin_temp_c: skin,
        battery_temp_c: battery,
        load1,
        load5,
        load15,
        running_threads: running,
        total_threads: total,
        mem_total_kb: mem_total,
        mem_available_kb: mem_available,
        swap_total_kb: swap_total,
        swap_free_kb: swap_free,
        pswpout,
        pswpin,
        pgmajfault,
        pgsteal_direct,
        kills: parse_am_kills(kill_text),
    }
}

pub fn device_health(client: &AdbClient, serial: &str) -> Result<HealthSnapshot, String> {
    let thermal = client.shell(serial, "dumpsys thermalservice")?;
    let system = client.shell(
        serial,
        "cat /proc/loadavg; grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree' /proc/meminfo; grep -E 'pswpout|pswpin|pgmajfault|pgsteal_direct' /proc/vmstat",
    )?;
    let kills = client.shell(
        serial,
        "logcat -b events -d -v threadtime 2>/dev/null | grep am_kill | tail -50",
    )?;
    Ok(parse_snapshot(&thermal, &system, &kills))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_real_loadavg_and_memory() {
        let text = "12.86 12.68 12.94 1/6202 19627\nMemTotal: 7495244 kB\nMemAvailable: 3882808 kB\nSwapTotal: 8388604 kB\nSwapFree: 6245396 kB\n";
        assert_eq!(parse_loadavg(text), Some((12.86, 12.68, 12.94, 1, 6202)));
        assert_eq!(parse_meminfo(text), (7_495_244, 3_882_808, 8_388_604, 6_245_396));
    }

    #[test]
    fn parses_real_thermal_block() {
        let text = "Thermal Status: 0\nCached temperatures:\n\tTemperature{mValue=81.672, mType=0, mName=CPU, mStatus=0}\nCurrent temperatures from HAL:\n\tTemperature{mValue=34.89, mType=0, mName=CPU, mStatus=0}\n\tTemperature{mValue=32.63, mType=3, mName=SKIN, mStatus=0}\n\tTemperature{mValue=31.1, mType=2, mName=BATTERY, mStatus=0}\n";
        assert_eq!(parse_thermal(text), (0, 34.89, 32.63, 31.1));
    }

    #[test]
    fn parses_am_kill_events() {
        let text = "11-02 18:53:32.297  1835  1984 I am_kill : [0,17748,com.snaptube.premium,905,LockScreenClean,306380]\n";
        let kills = parse_am_kills(text);
        assert_eq!(kills.len(), 1);
        assert_eq!(kills[0].package, "com.snaptube.premium");
        assert_eq!(kills[0].reason, "LockScreenClean");
        assert_eq!(kills[0].pss_kb, 306380);
    }
}
