# Android Storage Cleaner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a portable Tauri/React Windows app for safe adb-based Android storage inspection and cleanup.

**Architecture:** React UI calls Tauri commands; Rust owns adb transport, scanning, rule evaluation, dry-run reporting, and deletion. Core logic is device-independent and unit-tested; a thin shell layer talks to adb.

**Tech Stack:** Tauri 2, Rust 1.99 GNU, React 19, TypeScript 6, Vite 8, Zustand, d3-hierarchy, Vitest, WinLibs GCC 16.2.

**Spec:** `docs/superpowers/specs/2026-10-30-android-storage-cleaner-design.md`

## Global Constraints

- Windows 10/11, WebView2; no admin for the app.
- Rust target `x86_64-pc-windows-gnu`; `tools/mingw64/bin` and `%USERPROFILE%\.cargo\bin` on PATH.
- No device required for tests.
- No emulator/E2E tests.
- Every deletion passes protected-path validation.
- `.nomedia`, `Fely/`, SnapTube, Downloads, Camera, ScreenRecorder, Screenshots, WhatsApp DBs, Telegram Documents/Files, game data are protected by default.
- Portable data dir beside the exe when writable; fallback `%LOCALAPPDATA%\AndroidCleaner`.

## Review Focus

- A path with a protected prefix must never appear in a deletable candidate list, including case/edge-prefix tricks (`Fely2/`, `Fely/../`).
- A missing device or unauthorized device must produce a guided error, never a panic or empty success.
- A scan interrupted mid-stream must leave no partial candidates marked valid.
- Deleting WhatsApp/Telegram media must warn that chat media disappears, and must not touch databases.
- `pm trim-caches` must be opt-in and must never run as part of a normal file deletion without the user selecting it.

---

### Task 1: Baseline build + embedded adb + data dir

**Files:**
- Modify: `android-cleaner/src-tauri/tauri.conf.json`
- Create: `android-cleaner/src-tauri/resources/{adb.exe,AdbWinApi.dll,AdbWinUsbApi.dll}`
- Create: `android-cleaner/src-tauri/src/config.rs`
- Modify: `android-cleaner/src-tauri/src/lib.rs`

**Interfaces:**
- `config::data_dir() -> PathBuf`
- `config::adb_path() -> Result<PathBuf, String>`

- [ ] Copy the three adb files from platform-tools into `src-tauri/resources`.
- [ ] `include_bytes!` them, extract to `%TEMP%\AndroidCleaner\adb\<hash>` on first use.
- [ ] Test `data_dir()` falls back when the exe dir is not writable.
- [ ] Run `cargo test` and `npm run build`.
- [ ] Boot `npm run tauri dev` once; confirm a window opens.

### Task 2: Domain models + config persistence

**Files:**
- Create: `android-cleaner/src-tauri/src/model.rs`
- Create: `android-cleaner/src-tauri/src/config.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- `DeviceInfo { serial, state, model, android_version, sdk, storage_total, storage_free }`
- `FileEntry { path, size, mtime }`
- `RuleCategory`, `Confidence`, `Candidate`, `DryRunSummary`, `ExecutionReport`
- `AppConfig { protected_paths, enabled_categories, deep_duplicates, cache_trim }`

- [ ] Test config round-trip and default protected paths.
- [ ] Test serde shapes used by the UI.
- [ ] Implement config load/save.
- [ ] Run `cargo test`.

### Task 3: ADB transport

**Files:**
- Create: `android-cleaner/src-tauri/src/adb.rs`
- Test: inline with a `CommandRunner` fake

**Interfaces:**
- `trait CommandRunner { fn run(&self, args: &[String]) -> Result<Output, String>; }`
- `AdbClient::devices()`, `device_info(serial)`, `shell(serial, cmd)`, `exec_out(serial, cmd)`, `mdns_services()`, `pair(host, code)`, `connect(host)`
- `parse_devices(&str)`, `parse_df(&str)`, `parse_getprop(&str)`

- [ ] Test parsing authorized/unauthorized/offline device rows.
- [ ] Test `df` parsing and getprop parsing.
- [ ] Test error messages for missing adb and unauthorized devices.
- [ ] Implement `ProcessRunner` with hidden console.
- [ ] Run `cargo test`.

### Task 4: Scanner

**Files:**
- Create: `android-cleaner/src-tauri/src/scan.rs`
- Test: inline

**Interfaces:**
- `parse_stat_line(&str) -> Option<FileEntry>`
- `scan_command() -> &'static str`
- `build_tree(&[FileEntry]) -> Vec<FolderNode>`
- `Scanner::scan(serial, on_progress) -> Result<ScanResult, String>`

- [ ] Test parsing normal, spaced, unicode, and malformed lines.
- [ ] Test folder tree totals and top-level grouping.
- [ ] Test progress callback cadence.
- [ ] Implement streaming scan over `adb exec-out`.
- [ ] Run `cargo test`.

### Task 5: Rules + protected paths

**Files:**
- Create: `android-cleaner/src-tauri/src/rules.rs`
- Create: `android-cleaner/src-tauri/src/safety.rs`
- Test: inline

**Interfaces:**
- `default_categories() -> Vec<RuleCategory>`
- `evaluate(entries, &config) -> Vec<Candidate>`
- `is_protected(path, &[String]) -> bool`
- `validate_candidates(&[Candidate], &[String]) -> Result<(), Vec<String>>`

- [ ] Test each S1–S7 and P1–P10 matcher against positive and negative paths.
- [ ] Test WhatsApp/Telegram media folder matchers and `.nomedia` exclusion.
- [ ] Test protected prefixes: exact, child, lookalike (`Fely2`), traversal (`Fely/../`).
- [ ] Test that protected candidates are removed before totals.
- [ ] Implement rules and safety.
- [ ] Run `cargo test`.

### Task 6: Duplicates + dry-run reports

**Files:**
- Create: `android-cleaner/src-tauri/src/duplicates.rs`
- Create: `android-cleaner/src-tauri/src/report.rs`
- Test: inline

**Interfaces:**
- `find_size_groups(entries, cap_files, cap_bytes) -> Vec<Vec<FileEntry>>`
- `apply_hashes(groups, hashes) -> Vec<DuplicateGroup>`
- `write_report(dir, &DryRun) -> Result<ReportPaths, String>`

- [ ] Test size grouping excludes zero-byte and protected paths.
- [ ] Test hash grouping keeps one copy and never keeps a protected path as deletable.
- [ ] Test report markdown contains totals, protected paths, and warning text.
- [ ] Test CSV quoting for paths with commas/quotes.
- [ ] Implement duplicate engine and reports.
- [ ] Run `cargo test`.

### Task 7: Deletion engine + cache trim

**Files:**
- Create: `android-cleaner/src-tauri/src/cleanup.rs`
- Test: inline

**Interfaces:**
- `force_stop_packages(serial, categories) -> Vec<PackageResult>`
- `delete_paths(serial, paths, on_log) -> DeletionStats`
- `trim_caches(serial, target_bytes) -> Result<(), String>`
- `free_space(serial) -> Result<u64, String>`

- [ ] Test package selection for WhatsApp/Telegram/optional apps.
- [ ] Test deletion log formatting (`OK`, `MISSING`, `FAIL`).
- [ ] Test that a dry-run guard rejects execution without `DELETE`.
- [ ] Test cache trim target is current free + requested bytes.
- [ ] Implement cleanup.
- [ ] Run `cargo test`.

### Task 8: Tauri commands/events

**Files:**
- Modify: `android-cleaner/src-tauri/src/lib.rs`
- Create: `android-cleaner/src-tauri/src/commands.rs`

**Interfaces:**
- `list_devices`, `connect_wireless`, `pair_wireless`, `mdns_services`
- `load_config`, `save_config`, `scan_device`, `build_dry_run`
- `execute_cleanup`, `trim_cache`, `list_reports`, `open_data_dir`

- [ ] Register commands and event names.
- [ ] Emit `scan-progress` and `cleanup-progress`.
- [ ] Test that commands reject protected paths.
- [ ] Run `cargo check`.

### Task 9: Frontend shell + state + theme

**Files:**
- Modify: `android-cleaner/src/App.tsx`, `main.tsx`, `App.css`
- Create: `src/styles.css`, `src/store.ts`, `src/lib/format.ts`, `src/lib/tauri.ts`
- Test: `src/lib/format.test.ts`

- [ ] Sidebar/nav, connection pill, page container, dark theme.
- [ ] Zustand store: device, scan, config, selection, dry run, logs.
- [ ] Format bytes/counts/dates with tests.
- [ ] Tauri command wrappers with typed results.
- [ ] Run `npm test` and `npm run build`.

### Task 10: Connection dashboard + wireless

**Files:**
- Create: `src/pages/Connect.tsx`, `src/pages/Dashboard.tsx`
- Create: `src/components/DeviceCard.tsx`, `StorageRing.tsx`, `TopFolders.tsx`

- [ ] USB device list with authorized/unauthorized states and troubleshooting.
- [ ] mDNS discovery + pair code form + manual IP:port.
- [ ] Device metadata and free/used ring.
- [ ] Poll every 2 s; stop on unmount.
- [ ] Run build.

### Task 11: Scan, treemap, folder tree

**Files:**
- Create: `src/pages/Scan.tsx`
- Create: `src/components/Treemap.tsx`, `FolderTree.tsx`, `ScanProgress.tsx`
- Create: `src/lib/treemap.ts`
- Test: `src/lib/treemap.test.ts`

- [ ] Treemap layout from folder nodes.
- [ ] Virtualized/expandable folder tree.
- [ ] Progress + cancel.
- [ ] Tests for layout and top-N selection.
- [ ] Run `npm test` and build.

### Task 12: Rules, protected paths, report, execute, logs

**Files:**
- Create: `src/pages/Rules.tsx`, `Protected.tsx`, `Report.tsx`, `Logs.tsx`, `Settings.tsx`
- Create: `src/components/CategoryCard.tsx`, `ConfirmDialog.tsx`, `ExecutionLog.tsx`

- [ ] Category toggles with counts/bytes and per-category file preview.
- [ ] Protected path editor with defaults/reset and validation.
- [ ] Dry-run summary, warnings, export, and “DELETE” confirmation.
- [ ] Execution progress and final stats.
- [ ] Log list and open-folder action.
- [ ] Run `npm test` and build.

### Task 13: Final verification + portable exe

- [ ] `cargo test` (all Rust tests)
- [ ] `npm test -- --run`
- [ ] `npm run build`
- [ ] `npx tauri build --no-bundle` with GNU target
- [ ] Confirm single `android-cleaner.exe` and embedded adb extraction
- [ ] Launch exe, confirm window loads with no console
- [ ] Write `android-cleaner/README.md` with build/run instructions and safety notes
