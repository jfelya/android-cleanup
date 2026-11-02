# Device Tuning Context (ADB health + optimization)

Second context document for agents and for the next implementation round in `android-cleaner/`.
Everything below was executed against a real device on 2026-11-02. Commands marked **CONFIRMED**
were run and their output verified; commands marked **BLOCKED** failed with the exact error shown.
Nothing here needs root.

Scope: read-only device health analysis plus reversible, per-user tuning operations. This is
intended to become new app features alongside the existing storage cleaner, following the same
read-only-first + explicit-confirmation model.

---

## 1. TL;DR

- The phone's heating and "random app crashes" on this device were **not** a hardware or thermal
  failure. Thermal status was 0 (no throttling), skin 36 C, battery 34.8 C.
- Root cause chain observed: too many resident processes -> memory pressure -> zram + direct
  reclaim -> storage stalls (loadavg 15 with only 21% CPU busy) -> `system_server` kills apps with
  reason `normal_mem_pressure` -> user perceives "the app crashed".
- Most useful read-only signals, all available to `adb shell` without root:
  `dumpsys thermalservice`, `/proc/loadavg`, `/proc/meminfo`, `/proc/vmstat`, `dumpsys cpuinfo`,
  `dumpsys batterystats --charged`, `logcat -b events -d` (`am_kill`), `dumpsys alarm`,
  `dumpsys power`, `dumpsys jobscheduler`, `dumpsys meminfo`, `dumpsys display`.
- Most useful safe *write* operations, all per-user and reversible:
  `am set-standby-bucket`, `pm uninstall -k --user 0`, `cmd wifi set-scan-always-available`.
- Two tempting operations are **not** possible on HyperOS 3 without root:
  `pm disable-user` (blocked) and `settings put global ...` (permission denied). Use `cmd` entry
  points instead when they exist.

---

## 2. Test device and environment

| Item | Value |
| --- | --- |
| Model | POCO X6 Pro 5G (`2311DRK48G`), MediaTek Dimensity 8300 class SoC |
| OS | Android 16, HyperOS 3.0 (`ro.mi.os.version.name=OS3.0`, `ro.miui.ui.version.name=V816`) |
| Security patch | 2026-08-01 |
| Root | none (`which su` -> `no-su`) |
| RAM | 7,495,244 kB total (~7.5 GB usable of 8 GB) |
| Swap | 8,388,604 kB zram ("memory extension") |
| Display | 1220x2712, 60/90/120 Hz capable, **active mode 60 Hz** (`mActiveModeId=1`) |
| Apps | 458 packages total, 94 user apps (`pm list packages -3`) |
| adb | 37.0.1 (platform-tools 1.0.41) |

No serial number, user profile name, or personal file data is recorded here on purpose.

---

## 3. Baseline evidence (snapshot while the phone was idle-ish, screen on, USB attached)

```
/proc/loadavg            13.20 15.33 15.51 8/6508
top summary              800%cpu  37%user  104%sys  633%idle  19%irq
dumpsys cpuinfo          surfaceflinger 22% (2529 major faults), system_server 27.5% / 22:57 CPU
meminfo                  MemFree 84 MB, MemAvailable 3.78 GB, Cached 3.65 GB
zram                     SwapTotal 8.39 GB, SwapFree 6.20 GB -> 2.18 GB compressed in use
/proc/vmstat             pswpout 10,760,744  pswpin 6,688,538  pgmajfault 6,777,743
                         pgsteal_direct 6,379,316  pgscan_direct 8,219,321
thermalservice           Thermal Status: 0
                         CPU 51.3 C, GPU 48.7 C, SOC 48.7 C, SKIN 36.0 C, BATTERY 34.8 C
                         cached (stale max seen) CPU 81.6 C
batterystats             estimated drain 605 mAh, of which cpu: 536 mAh, screen: 125 mAh
jobscheduler             ~25 system jobs, incl. com.miui.daemon Defrag/GC/Dump/Meminfo services
```

`logcat -b events -d | grep am_kill` showed a burst of framework kills, all with reason
`normal_mem_pressure`:

```
18:14:08  com.nvidia.geforcenow:workManager
18:14:08  com.android.vending
18:14:08  com.nvidia.geforcenow
18:14:08  com.android.chrome
18:14:09  com.google.android.apps.docs
18:14:09  com.google.android.gm
18:14:09  com.google.android.apps.tachyon
18:14:09  com.google.android.videos
18:14:09  com.google.android.permissioncontroller
18:14:09  com.instagram.android
```

Interpretation: the "crashes" are LMK/framework kills under memory pressure, not app faults.

Note on counters: `pswpout`, `pgsteal_direct`, `pgmajfault` are **cumulative since boot**. A feature
must sample twice and diff; absolute values mean nothing on their own.

---

## 4. Capability matrix

### 4.1 CONFIRMED read-only (safe, no side effects)

| Data | Command | Notes |
| --- | --- | --- |
| Thermal state | `dumpsys thermalservice` | `Thermal Status:` 0-6, HAL temps with names, throttling thresholds |
| Whole-device load | `cat /proc/loadavg` | last field `running/total` threads |
| Memory + swap | `grep -E 'MemTotal\|MemFree\|MemAvailable\|Cached\|Swap' /proc/meminfo` | |
| Reclaim counters | `grep -E 'pswpout\|pswpin\|pgmajfault\|pgsteal_direct' /proc/vmstat` | cumulative, diff it |
| Top CPU | `dumpsys cpuinfo` or `top -b -n 1 -m 20` | `dumpsys cpuinfo` aggregates ~5 min |
| RSS per process | `dumpsys meminfo \| head -20` | "Total RSS by process" |
| Power by category | `dumpsys batterystats --charged` | "Estimated power use (mAh)" |
| Kill reasons | `logcat -b events -d \| grep am_kill` | `[userId,pid,name,oomAdj,reason,pss]` |
| Wakelocks | `dumpsys power \| grep -A20 'Partial Wakelock Log'` | last ~10 acquisitions |
| Alarm churn | `dumpsys alarm` (`Alarm Stats` section) | per-package running ms + wakeups |
| Jobs | `dumpsys jobscheduler` | inventory of scheduled background work |
| Doze / idle | `dumpsys deviceidle` (`mState`, `mLightState`) | |
| App standby | `am get-standby-bucket <pkg>` | prints an int, see table below |
| Installed apps | `pm list packages -3`, `pm list packages` | user vs all |
| Display mode | `dumpsys display \| grep -E 'mActiveModeId\|mActiveRenderFrameRate'` | |
| GPU memory | `dumpsys gpu` | per-process totals |
| Battery | `dumpsys battery` | level, temp (tenths of C), voltage, health |

### 4.2 CONFIRMED writes (reversible, no root)

| Action | Command | Observed result |
| --- | --- | --- |
| Restrict an app's standby bucket | `am set-standby-bucket <pkg> restricted` | `am get-standby-bucket` -> `45` |
| Restore a bucket | `am set-standby-bucket <pkg> working_set` / `rare` / `active` | bucket int changes |
| Disable Wi-Fi always-scan | `cmd wifi set-scan-always-available disabled` | `settings get global wifi_scan_always_enabled` -> `0` |
| Remove a system app for the current user | `pm uninstall -k --user 0 <pkg>` | `Success`; `dumpsys package` shows `installed=false` for user 0 |
| Reinstall it | `cmd package install-existing <pkg>` | standard recovery path |
| Force-stop an app | `am force-stop <pkg>` | already used by the cleaner |

`am help` on this build lists `set-standby-bucket [--user <USER_ID>] <PACKAGE>
active|working_set|frequent|rare|restricted` — no `never`/`exempted` by name, so only those five
names are safe to expose in the UI.

Standby bucket ints (AOSP `UsageStatsManager`):

| Value | Bucket | Meaning |
| --- | --- | --- |
| 5 | `EXEMPTED` | never restricted |
| 10 | `ACTIVE` | in active use |
| 20 | `WORKING_SET` | recently used |
| 30 | `FREQUENT` | used often |
| 40 | `RARE` | rarely used (HyperOS default for most apps here) |
| 45 | `RESTRICTED` | jobs/alarms/network deferred |
| 50 | `NEVER` | never allowed (not reachable by name on this build) |

### 4.3 BLOCKED on HyperOS 3 (do not build UI around these)

| Attempt | Error |
| --- | --- |
| `pm disable-user --user 0 com.miui.msa.global` | `SecurityException: Cannot disable system packages.` (`PackageManagerServiceImpl.shouldRestrictEnabledSettingsChange`) |
| `settings put global wifi_scan_always_enabled 0` | `SecurityException: ... must have ... WRITE_SECURE_SETTINGS` |
| `settings put global ble_scan_always_enabled 0` | same |
| `cat /proc/swaps` | `Permission denied` |

Consequence: any setting that lives in the `global`/`secure` namespaces is out of reach unless a
dedicated `cmd` entry point exists. Prefer `cmd wifi ...`, `am ...`, `pm ...`, `cmd package ...`.

### 4.4 NOT tested yet (treat as unknown, do not ship as "confirmed")

- `cmd appops set <pkg> RUN_ANY_IN_BACKGROUND ignore` (stronger than the restricted bucket).
- `am send-trim-memory <pkg> <LEVEL>`.
- `set-bg-restriction-level` / `get-bg-restriction-level` (exists in `am help`).
- Whether shell-set buckets survive a reboot and MIUI's powerkeeper re-evaluation.
- Whether `com.miui.msa.global` comes back after a system update.
- Effect of `restricted` on FCM notification latency for messaging apps.
- Bluetooth scan-always toggle (needs a manual Settings toggle; the settings namespace is locked).

---

## 5. What was actually changed on the device in this session

Kept as a session log so the next agent knows the device state:

```
am set-standby-bucket com.instagram.android        restricted   (was 10 ACTIVE)
am set-standby-bucket com.linkedin.android         restricted   (was 40 RARE)
am set-standby-bucket com.reddit.frontpage         restricted   (was 40 RARE)
am set-standby-bucket com.google.android.youtube   restricted   (was 40 RARE)
am set-standby-bucket com.nvidia.geforcenow        restricted   (was 10 ACTIVE)
cmd wifi set-scan-always-available disabled
pm uninstall -k --user 0 com.miui.msa.global
```

Deliberately untouched: `com.android.chrome` (10 ACTIVE), `com.google.android.gm` (5 EXEMPTED),
`com.google.android.apps.tachyon` (Meet), `com.google.android.apps.docs`.
Display refresh rate needed no change: already 60 Hz.

Verification after the change: swap in use 2.18 GB -> 2.03 GB, no `normal_mem_pressure` kills
after 18:14 (the only later kill was the deliberate msa removal), loadavg still high because
loadavg lags ~5-15 min. Full heat verification is still pending.

Rollback:

```
am set-standby-bucket <pkg> working_set
cmd package install-existing com.miui.msa.global
cmd wifi set-scan-always-available enabled
```

---

## 6. Proposed app features

Priority order. Each entry is self-contained enough to implement without re-running this
investigation.

### F1. Device Health panel (read-only) — HIGH value, zero risk

One screen that answers "why is my phone hot / killing apps?".

- Inputs: thermalservice, /proc/loadavg, /proc/meminfo, /proc/vmstat (2 samples + diff),
  dumpsys cpuinfo, dumpsys batterystats --charged, last N `am_kill` events, dumpsys alarm stats.
- Output: thermal status badge, CPU/SKIN/BATTERY temps, load, MemAvailable, swap used,
  reclaim rate (pages/s), top 5 CPU consumers, top 5 RSS, kill list with reason and timestamp.
- Rules of thumb to encode (all observed):
  - `Thermal Status > 0` or SKIN > 45 C -> "throttling / hot".
  - MemAvailable < 1 GB and swap used > 1 GB -> "memory pressure".
  - `pgsteal_direct` growing while CPU idle% > 60% -> "storage/reclaim stalls, not CPU load".
  - any `am_kill` with `normal_mem_pressure` in the last hour -> "the app that closed was killed
    by the system, not crashed".
- No writes. Runs with the same `AdbClient::shell` used by the scanner.

### F2. App standby manager — HIGH value, reversible

- List user apps + current bucket (one batched on-device loop, see 7.3).
- Let the user pick apps to put in `restricted`, plus a "revert to default" action.
- Suggested default exclusions (never restrict): launchers, keyboards, dialers, messaging apps the
  user relies on for notifications, `com.google.android.gms`, `com.android.vending`.
- After every write, re-read the bucket and store `previous -> new` in the audit log.
- UI must say plainly: "Restricted apps may miss background sync and notifications."

### F3. Background churn report — MEDIUM value, read-only

- Merge `dumpsys alarm` (Alarm Stats), `dumpsys power` (partial wakelocks) and
  `dumpsys jobscheduler` into one "wakeups per package" table, sorted by wakeups.
- Lets the user decide what goes into F2 instead of guessing.

### F4. Storage / memory hygiene from the health view — MEDIUM value

- Show zram usage and the top RSS processes; offer `am force-stop` on user-selected apps
  (already implemented for category packages in `cleanup.rs`).
- Do not touch `com.miui.daemon`, `com.miui.powerkeeper`, `com.miui.securitycenter`: without root
  they respawn and can make things worse.

### F5. Scan-always toggles — LOW value, partially blocked

- Wi-Fi: `cmd wifi set-scan-always-available disabled|enabled` (**CONFIRMED**).
- Bluetooth: no shell path on this build; show a button that opens the phone's Settings page
  (`am start -a android.settings.LOCATION_SOURCE_SETTINGS` or the Bluetooth one) and explain the
  manual toggle instead of pretending it worked.

### F6. Debloat allowlist — LOW volume, HIGH risk, opt-in only

- `pm uninstall -k --user 0 <pkg>` works, but must never be free-text. Ship a small allowlist of
  packages that are safe to remove per-user (ads/telemetry/duplicate app stores), each with a
  human label and a one-line reason, plus `cmd package install-existing` for restore.
- Candidate starting point proven here: `com.miui.msa.global` (MIUI system ads service).
- Require the same typed-confirmation pattern the cleaner already uses for deletion.

---

## 7. Implementation notes (fits the current codebase)

Current shape: `core/` = device-independent logic + tests, `src-tauri/src/commands.rs` = thin
`#[tauri::command]` wrappers over `AdbClient`, `src/lib/tauri.ts` = typed frontend API,
`src/pages/*` = screens, `src/i18n.ts` = es/en strings (Spanish default).

### 7.1 Rust: new module `core/src/health.rs` (pure parsers, testable, no device)

Mirror the `scan.rs` style: `parse_*` functions take the raw text, return structs, carry unit tests
with fixtures copied from real output (sanitized).

```rust
pub fn parse_loadavg(text: &str) -> Option<(f32, f32, f32, u32, u32)>;
pub fn parse_meminfo(text: &str) -> MemInfo;              // MemAvailable, MemTotal, Swap*
pub fn parse_vmstat(text: &str) -> VmStats;               // pswpout, pswpin, pgsteal_direct, pgmajfault
pub fn parse_thermalservice(text: &str) -> Thermal;        // status + named temps
pub fn parse_am_kills(text: &str) -> Vec<AppKill>;         // ts, uid, pid, name, adj, reason
pub fn parse_standby_buckets(text: &str) -> Vec<(String, u8)>; // from the batched loop
pub fn parse_alarm_stats(text: &str) -> Vec<AlarmStat>;    // package, running_ms, wakeups
```

`core/src/tuning.rs` holds the actions, mirroring `cleanup.rs`:

```rust
pub fn set_bucket(client: &AdbClient, serial: &str, pkg: &str, bucket: Bucket) -> Result<u8, String>;
pub fn list_buckets(client: &AdbClient, serial: &str) -> Result<Vec<(String, u8)>, String>;
pub fn set_wifi_scan_always(client: &AdbClient, serial: &str, on: bool) -> Result<(), String>;
pub fn uninstall_for_user(client: &AdbClient, serial: &str, pkg: &str) -> Result<(), String>;
pub fn reinstall_for_user(client: &AdbClient, serial: &str, pkg: &str) -> Result<(), String>;
```

Validation rules to encode:
- Reject package names containing anything but `[A-Za-z0-9._]`.
- Only allow the five bucket names the device advertises.
- Verify by reading back after writing (`get-standby-bucket` must equal the target int).
- Never call `pm disable-user` or `settings put global` (see 4.3).

### 7.2 Tauri commands (`src-tauri/src/commands.rs` + `src-tauri/src/lib.rs`)

```rust
#[tauri::command] pub fn device_health(serial: String, state: State<'_, AppState>) -> Result<DeviceHealth, String>;
#[tauri::command] pub fn list_app_buckets(serial: String, state: State<'_, AppState>) -> Result<Vec<AppBucket>, String>;
#[tauri::command] pub fn set_app_bucket(serial: String, package: String, bucket: String, state: State<'_, AppState>) -> Result<u8, String>;
#[tauri::command] pub fn set_wifi_scan_always(serial: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String>;
#[tauri::command] pub fn remove_system_app(serial: String, package: String, state: State<'_, AppState>) -> Result<(), String>;
#[tauri::command] pub fn restore_system_app(serial: String, package: String, state: State<'_, AppState>) -> Result<(), String>;
```

Register every one in `generate_handler!`. Keep commands thin: parse in `core`, run in `core`,
return serializable structs (`#[serde(rename_all = "camelCase")]`).

### 7.3 Performance: batch on-device, not one adb call per app

`am get-standby-bucket` costs roughly one binder round trip; 94 apps as 94 adb processes is slow.
One shell call does the whole list in ~3-5 s (CONFIRMED with 8 apps, same command for all):

```sh
for p in $(pm list packages -3 | cut -d: -f2); do echo "$p $(am get-standby-bucket $p)"; done
```

Output is one `package bucket` pair per line, ideal for `parse_standby_buckets`.

On Windows/PowerShell, wrap the command in **single** quotes so `$( )` is not expanded locally
(`adb shell '...'`).

### 7.4 Config (`core/src/config.rs`)

Add fields with `#[serde(default)]` so existing `config.json` files keep loading:

```rust
#[serde(default)] pub restricted_apps: Vec<String>,      // apps the user chose to restrict
#[serde(default)] pub never_restrict: Vec<String>,        // user exclusions
#[serde(default)] pub health_auto_refresh_secs: u64,      // 0 = off
```

### 7.5 Frontend

- `src/lib/tauri.ts`: add `deviceHealth`, `listAppBuckets`, `setAppBucket`, `setWifiScanAlways`,
  `removeSystemApp`, `restoreSystemApp` following the existing `call<T>("command", args)` shape.
- `src/pages/HealthPage.tsx`: read-only dashboard (F1), plus a "Apps" tab (F2/F3 tables).
- `src/components/Sidebar.tsx`: new nav entry.
- `src/types.ts`: `DeviceHealth`, `Thermal`, `AppBucket`, `AppKill`, `AlarmStat`.
- `src/i18n.ts`: every new key in **both** `es` and `en`; `i18n.test.ts` asserts Spanish strings, so
  add one assertion per important new key.

### 7.6 Safety defaults (follow the existing model)

- Health/alarms/kills = read-only, no confirmation needed.
- Bucket changes = no typed confirmation, but show a "revert all" action and log previous value.
- System app removal = typed confirmation (`RESTRICT` / `REMOVE`), allowlist only, with restore.
- Every action writes an audit line in the existing log format style: `OK|pkg|bucket|previous`.

### 7.7 Tests

Rust (`cd core; cargo test`): parsers against fixture text captured from this device; bucket-name
validation; "reject unsafe package names"; read-back verification logic with a fake `CommandRunner`
(the runner trait already exists in `adb.rs`, so no device is needed).

Frontend (`npm test`): format helpers for temps/bytes, i18n key parity.

---

## 8. Verification protocol (before/after, same numbers)

Do not claim an improvement without this:

1. Baseline: 2 samples 30 s apart of `loadavg`, `MemAvailable`, `SwapFree`, `pswpout`,
   `pgsteal_direct`; plus `dumpsys thermalservice`, top 5 from `dumpsys cpuinfo`, and
   `am_kill` count in the last 60 min.
2. Apply exactly one change group.
3. Wait 30-60 min of normal use (loadavg needs time).
4. Re-sample the same set and diff. Report deltas, not impressions.
5. If within 24 h the phone is still hot: next suspects, in order, are the `system_server` loop
   (582 MB RSS, 23 min CPU in 5.6 h) and `com.miui.daemon` jobs (Defrag / GC / Dump / Meminfo),
   then `surfaceflinger` (27 min CPU at 60 Hz, unexplained and not caused by refresh rate).

Known-good "it worked" signals: no `normal_mem_pressure` kills, swap in use falling, reclaim rate
falling, `Thermal Status` staying at 0 with SKIN under 40 C.

---

## 9. Gaps and open questions

- Why `surfaceflinger` accumulates 27 min CPU at 60 Hz with a mostly static screen: not answered.
- Why `system_server` holds 582 MB RSS: not answered; could be MIUI framework hooks.
- Whether MIUI powerkeeper silently re-promotes `restricted` apps after reboot or after charging.
- Whether `restricted` delays FCM messages the user cares about (needs a targeted test).
- `ble_scan_always_enabled` has no shell path here; a `cmd bluetooth_manager` equivalent was not
  found.
- `pm uninstall --user 0` on a system package is powerful; only the msa case was proven. Any other
  package needs its own risk review before going into an allowlist.

---

## 10. Quick command reference

```sh
# health
adb shell "cat /proc/loadavg; grep -E 'MemAvailable|SwapFree|SwapTotal' /proc/meminfo"
adb shell "dumpsys thermalservice | head -30"
adb shell "dumpsys cpuinfo | head -20"
adb shell "dumpsys batterystats --charged | grep -A 20 'Estimated power use'"
adb shell "logcat -b events -d | grep am_kill | tail -20"
adb shell "dumpsys alarm | sed -n '/Alarm Stats/,/Pending alarm batches/p' | head -40"

# standby
adb shell 'for p in $(pm list packages -3 | cut -d: -f2); do echo "$p $(am get-standby-bucket $p)"; done'
adb shell "am set-standby-bucket com.example.app restricted"
adb shell "am get-standby-bucket com.example.app"          # expect 45

# scanning
adb shell "cmd wifi set-scan-always-available disabled"
adb shell "settings get global wifi_scan_always_enabled"   # expect 0

# per-user app removal + restore
adb shell "pm uninstall -k --user 0 com.miui.msa.global"
adb shell "cmd package install-existing com.miui.msa.global"
```
