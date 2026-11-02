use crate::model::{DeviceInfo, WirelessService};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRow {
    pub serial: String,
    pub state: String,
    pub product: String,
    pub model: String,
    pub device: String,
}

#[derive(Clone, Debug, Default)]
pub struct CommandOutput {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

pub trait CommandRunner: Send + Sync {
    fn run(
        &self,
        adb: &Path,
        args: &[String],
        stdin: Option<&str>,
    ) -> Result<CommandOutput, String>;
}

#[derive(Default)]
pub struct ProcessRunner;

impl CommandRunner for ProcessRunner {
    fn run(
        &self,
        adb: &Path,
        args: &[String],
        stdin: Option<&str>,
    ) -> Result<CommandOutput, String> {
        let mut cmd = Command::new(adb);
        cmd.args(args)
            .stdin(if stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("cannot run adb at {}: {e}", adb.display()))?;
        let writer = if let Some(input) = stdin {
            let mut pipe = child
                .stdin
                .take()
                .ok_or_else(|| "adb stdin was not piped".to_string())?;
            let bytes = input.as_bytes().to_vec();
            Some(std::thread::spawn(move || pipe.write_all(&bytes)))
        } else {
            None
        };
        let output = child
            .wait_with_output()
            .map_err(|e| format!("wait for adb: {e}"))?;
        if let Some(handle) = writer {
            let _ = handle.join();
        }
        Ok(CommandOutput {
            status: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

#[derive(Clone)]
pub struct AdbClient {
    adb: PathBuf,
    runner: Arc<dyn CommandRunner>,
}

impl AdbClient {
    pub fn new(adb: PathBuf) -> Self {
        Self {
            adb,
            runner: Arc::new(ProcessRunner),
        }
    }

    pub fn with_runner(adb: PathBuf, runner: Arc<dyn CommandRunner>) -> Self {
        Self { adb, runner }
    }

    pub fn adb_path(&self) -> &Path {
        &self.adb
    }

    fn run(&self, args: &[String], stdin: Option<&str>) -> Result<CommandOutput, String> {
        let out = self.runner.run(&self.adb, args, stdin)?;
        if out.status != 0 {
            let msg = out.stderr.trim();
            let msg = if msg.is_empty() {
                out.stdout.trim()
            } else {
                msg
            };
            return Err(format!("adb {}: {}", args.join(" "), msg));
        }
        Ok(out)
    }

    pub fn start_server(&self) -> Result<(), String> {
        let out = self.run(&["start-server".into()], None)?;
        let _ = out;
        Ok(())
    }

    pub fn devices(&self) -> Result<Vec<DeviceRow>, String> {
        let out = self.run(&["devices".into(), "-l".into()], None)?;
        Ok(parse_devices(&out.stdout))
    }

    pub fn device_info(&self, serial: &str) -> Result<DeviceInfo, String> {
        let model = self.getprop(serial, "ro.product.model")?;
        let release = self.getprop(serial, "ro.build.version.release")?;
        let sdk = self.getprop(serial, "ro.build.version.sdk")?;
        let market = self.getprop(serial, "ro.product.marketname")?;
        let device = self.getprop(serial, "ro.product.device")?;
        let df = self.shell(serial, "df -k /storage/emulated/0")?;
        let (storage_total, storage_free) = parse_df(&df).unwrap_or((0, 0));
        let product = if market.is_empty() { model.clone() } else { market };
        Ok(DeviceInfo {
            serial: serial.into(),
            state: "device".into(),
            product,
            model,
            device,
            android_version: release,
            sdk,
            storage_total,
            storage_free,
        })
    }

    pub fn getprop(&self, serial: &str, key: &str) -> Result<String, String> {
        let out = self.shell(serial, &format!("getprop {key}"))?;
        let value = out
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .chars()
            .filter(|c| !c.is_control())
            .collect::<String>();
        Ok(value.chars().take(80).collect())
    }

    pub fn shell(&self, serial: &str, cmd: &str) -> Result<String, String> {
        let out = self.run(
            &[
                "-s".into(),
                serial.into(),
                "shell".into(),
                cmd.into(),
            ],
            None,
        )?;
        Ok(out.stdout)
    }

    pub fn shell_stdin(&self, serial: &str, cmd: &str, input: &str) -> Result<String, String> {
        // adb joins argv with spaces. Passing `sh -c` and the script as separate
        // args lets the device shell run `sh -c <first-word>` with no script,
        // which makes commands like getprop dump every property. Wrap the
        // whole script in single quotes and send it as one argument.
        let quoted = cmd.replace('\'', "'\\''");
        let remote = format!("sh -c '{quoted}'");
        let out = self.run(
            &["-s".into(), serial.into(), "shell".into(), remote],
            Some(input),
        )?;
        Ok(out.stdout)
    }

    pub fn exec_out(&self, serial: &str, cmd: &str) -> Result<String, String> {
        let out = self.run(
            &[
                "-s".into(),
                serial.into(),
                "exec-out".into(),
                cmd.into(),
            ],
            None,
        )?;
        Ok(out.stdout)
    }

    /// Stream stdout from `adb exec-out` line by line. Used by the scanner so
    /// progress is visible and a cancel request can stop the child process.
    pub fn stream_exec_out<F, C>(
        &self,
        serial: &str,
        cmd: &str,
        mut on_line: F,
        cancelled: C,
    ) -> Result<(), String>
    where
        F: FnMut(&str),
        C: Fn() -> bool,
    {
        use std::io::{BufRead, BufReader};
        if cancelled() {
            return Err("scan cancelled".into());
        }
        let mut process = Command::new(&self.adb);
        process
            .args(["-s", serial, "exec-out", cmd])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            process.creation_flags(0x0800_0000);
        }
        let mut child = process
            .spawn()
            .map_err(|e| format!("cannot run adb at {}: {e}", self.adb.display()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "adb stdout was not piped".to_string())?;
        for line in BufReader::new(stdout).lines() {
            if cancelled() {
                let _ = child.kill();
                let _ = child.wait();
                return Err("scan cancelled".into());
            }
            match line {
                Ok(line) => on_line(&line),
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("read adb output: {e}"));
                }
            }
        }
        let status = child.wait().map_err(|e| format!("wait for adb: {e}"))?;
        if cancelled() {
            return Err("scan cancelled".into());
        }
        if !status.success() {
            return Err(format!("adb exec-out failed with {status}"));
        }
        Ok(())
    }

    pub fn mdns_services(&self) -> Result<Vec<WirelessService>, String> {
        let out = self.run(&["mdns".into(), "services".into()], None)?;
        Ok(parse_mdns(&out.stdout))
    }

    pub fn pair(&self, host: &str, code: &str) -> Result<String, String> {
        let out = self.run(&["pair".into(), host.into(), code.into()], None)?;
        Ok(format!("{}{}", out.stdout, out.stderr))
    }

    pub fn connect(&self, host: &str) -> Result<String, String> {
        let out = self.run(&["connect".into(), host.into()], None)?;
        Ok(format!("{}{}", out.stdout, out.stderr))
    }

    pub fn disconnect(&self, host: &str) -> Result<String, String> {
        let out = self.run(&["disconnect".into(), host.into()], None)?;
        Ok(out.stdout)
    }
}

pub fn parse_devices(text: &str) -> Vec<DeviceRow> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty()
                || line.starts_with("List of devices")
                || line.starts_with('*')
                || line.starts_with("adb")
            {
                return None;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 || !parts[1].chars().all(|c| c.is_ascii_alphabetic()) {
                return None;
            }
            let mut row = DeviceRow {
                serial: parts[0].to_string(),
                state: parts[1].to_string(),
                ..Default::default()
            };
            for attr in &parts[2..] {
                if let Some((key, value)) = attr.split_once(':') {
                    match key {
                        "product" => row.product = value.to_string(),
                        "model" => row.model = value.to_string(),
                        "device" => row.device = value.to_string(),
                        _ => {}
                    }
                }
            }
            Some(row)
        })
        .collect()
}

pub fn parse_df(text: &str) -> Option<(u64, u64)> {
    for line in text.lines() {
        if !line.contains("/storage/emulated") {
            continue;
        }
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 4 {
            continue;
        }
        let total_kb: u64 = cols.get(1)?.parse().ok()?;
        let free_kb: u64 = cols.get(3)?.parse().ok()?;
        return Some((total_kb * 1024, free_kb * 1024));
    }
    None
}

pub fn parse_mdns(text: &str) -> Vec<WirelessService> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with("List of") {
                return None;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                return None;
            }
            let name = parts[0].trim_end_matches('.').to_string();
            let service_type = if name.contains("_adb-tls-pairing") {
                "pairing"
            } else if name.contains("_adb-tls-connect") {
                "connect"
            } else {
                "unknown"
            };
            Some(WirelessService {
                name,
                service_type: service_type.to_string(),
                address: parts[1].to_string(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    struct FakeRunner {
        response: Mutex<CommandOutput>,
        seen: Mutex<Vec<Vec<String>>>,
        stdin_seen: Mutex<Vec<Option<String>>>,
    }

    impl FakeRunner {
        fn new(stdout: &str) -> Self {
            Self {
                response: Mutex::new(CommandOutput {
                    status: 0,
                    stdout: stdout.into(),
                    stderr: String::new(),
                }),
                seen: Mutex::new(Vec::new()),
                stdin_seen: Mutex::new(Vec::new()),
            }
        }
        fn failing(stderr: &str) -> Self {
            Self {
                response: Mutex::new(CommandOutput {
                    status: 1,
                    stdout: String::new(),
                    stderr: stderr.into(),
                }),
                seen: Mutex::new(Vec::new()),
                stdin_seen: Mutex::new(Vec::new()),
            }
        }
    }

    impl CommandRunner for FakeRunner {
        fn run(
            &self,
            _adb: &Path,
            args: &[String],
            stdin: Option<&str>,
        ) -> Result<CommandOutput, String> {
            self.seen.lock().unwrap().push(args.to_vec());
            self.stdin_seen
                .lock()
                .unwrap()
                .push(stdin.map(str::to_string));
            let r = self.response.lock().unwrap();
            Ok(CommandOutput {
                status: r.status,
                stdout: r.stdout.clone(),
                stderr: r.stderr.clone(),
            })
        }
    }

    #[test]
    fn parses_authorized_and_unauthorized_rows() {
        let text = "\
List of devices attached
QGPF7PY5IFS4H6US       device product:duchamp model:2311DRK48G device:duchamp transport_id:2
ABC123                 unauthorized usb:1-1 transport_id:3
XYZ                    offline transport_id:4
";
        let rows = parse_devices(text);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].serial, "QGPF7PY5IFS4H6US");
        assert_eq!(rows[0].model, "2311DRK48G");
        assert_eq!(rows[1].state, "unauthorized");
        assert_eq!(rows[2].state, "offline");
    }

    #[test]
    fn parses_df_kilobytes() {
        let text = "Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/fuse      238122976 199129760  38456348  84% /storage/emulated\n";
        assert_eq!(parse_df(text), Some((238122976 * 1024, 38456348 * 1024)));
    }

    #[test]
    fn parses_mdns_services() {
        let text = "List of discovered mdns services\nadb-abc._adb-tls-pairing._tcp. 192.168.1.10:37001\nadb-abc._adb-tls-connect._tcp. 192.168.1.10:37002\n";
        let rows = parse_mdns(text);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].service_type, "pairing");
        assert_eq!(rows[1].address, "192.168.1.10:37002");
    }

    #[test]
    fn unauthorized_is_not_reported_as_success() {
        let runner = Arc::new(FakeRunner::failing("error: device unauthorized"));
        let client = AdbClient::with_runner(PathBuf::from("adb"), runner);
        let err = client.shell("ABC", "getprop ro.product.model").unwrap_err();
        assert!(err.contains("unauthorized"));
    }

    #[test]
    fn devices_uses_dash_l() {
        let runner = Arc::new(FakeRunner::new("List of devices attached\n"));
        let client = AdbClient::with_runner(PathBuf::from("adb"), runner.clone());
        let _ = client.devices().unwrap();
        let seen = runner.seen.lock().unwrap();
        assert_eq!(seen[0], vec!["devices", "-l"]);
    }

    #[test]
    fn shell_sends_one_remote_command() {
        let runner = Arc::new(FakeRunner::new(""));
        let client = AdbClient::with_runner(PathBuf::from("adb"), runner.clone());
        let _ = client.shell("S", "getprop ro.product.model").unwrap();
        let seen = runner.seen.lock().unwrap();
        assert_eq!(
            seen[0],
            vec!["-s", "S", "shell", "getprop ro.product.model"]
        );
    }

    #[test]
    fn exec_out_sends_one_remote_command() {
        let runner = Arc::new(FakeRunner::new(""));
        let client = AdbClient::with_runner(PathBuf::from("adb"), runner.clone());
        let _ = client
            .exec_out("S", "find /sdcard -type f | head -1")
            .unwrap();
        let seen = runner.seen.lock().unwrap();
        assert_eq!(
            seen[0],
            vec!["-s", "S", "exec-out", "find /sdcard -type f | head -1"]
        );
    }

    #[test]
    fn shell_stdin_quotes_the_script_and_forwards_input() {
        let runner = Arc::new(FakeRunner::new(""));
        let client = AdbClient::with_runner(PathBuf::from("adb"), runner.clone());
        let _ = client
            .shell_stdin(
                "S",
                "while IFS= read -r p; do echo \"$p\"; done",
                "a\nb\n",
            )
            .unwrap();
        let seen = runner.seen.lock().unwrap();
        assert_eq!(seen[0][0], "-s");
        assert_eq!(seen[0][1], "S");
        assert_eq!(seen[0][2], "shell");
        assert!(seen[0][3].starts_with("sh -c '"));
        assert!(seen[0][3].contains("while IFS= read"));
        assert_eq!(
            runner.stdin_seen.lock().unwrap()[0].as_deref(),
            Some("a\nb\n")
        );
    }
}
