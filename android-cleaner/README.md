# Android Storage Cleaner

Portable Windows desktop app for inspecting and cleaning Android storage over ADB. Tauri 2 + React 19 + TypeScript.

The app is a GUI over a proven read-only-first workflow:

1. Connect over USB or wireless ADB.
2. Scan `/storage/emulated/0` (files, sizes, mtimes, folders).
3. Pick rule categories and protected paths.
4. Build a dry-run report.
5. Type `DELETE` to execute, with per-path audit logs and before/after free space.

Nothing is deleted during scan or dry run.

## Features

- Ready-to-run portable build: `AndroidStorageCleaner.exe` in the project root (and the workspace root).
- Spanish (Latin America) is the default UI language; English is one click away.
- Dark theme is the default; light theme is one click away.
- Language and theme live in the sidebar footer (and Settings) and persist across restarts.
- Streaming storage scan with live progress and cancel.
- Device Health page: thermal status, load, memory/swap, reclaim counters, recent framework kills.
- File-type breakdown (images, video, audio, documents, archives, APK, other).
- USB device discovery, authorization state, and guided troubleshooting.
- Android 11+ wireless pairing (`adb pair` + `adb connect`), saved hosts, and disconnect.
- Device dashboard: model, Android version, total/used/free storage.
- Storage treemap, folder tree, and top-folder bars (custom SVG / `d3-hierarchy`).
- Rule categories S1-S7, P1-P10, WhatsApp media, Telegram media, hash duplicates, custom rules.
- Category counts populate immediately after scanning; no dry run needed for counts.
- Configurable protected paths, enforced at scan, dry-run, and deletion time.
- Duplicate detail view with keeper path and copy list.
- Hash-confirmed duplicate detection on the phone (`sha256sum`), never pulling media to the PC.
- Localized dry-run reports and execution logs (Spanish/English).
- In-app report/log viewer.
- App-cache trim preview from `dumpsys diskstats`; optional `pm trim-caches`.
- Portable config/reports/logs; no registry, no installer, no admin.
- GitHub Actions CI for core tests, frontend tests, and production build.

## Safety model

- **Dry run is mandatory.** The execute button only appears on a generated dry run.
- **Type `DELETE`** before any path is removed. adb deletion has no recycle bin.
- **Protected paths** are checked twice: when candidates are built, and again immediately before deletion.
- **`.nomedia` is always protected.** So are the default personal/app-data paths (Fely, SnapTube, Downloads, Camera, ScreenRecorder, Screenshots, WhatsApp databases, Telegram Documents/Files, game data).
- **Media warnings.** Deleting WhatsApp/Telegram media removes it from chats; databases and documents are kept.
- **Audit log per path:** `OK|size|path`, `MISSING|0|path`, `FAIL|size|path`.
- Non-root only. `/data/data`, `/data/app`, and system partitions are reported as unreachable, not bypassed.

## Portable layout

- The distributed `AndroidStorageCleaner.exe` embeds the Tauri app, `WebView2Loader.dll`, and the app's own embedded `adb.exe` + DLLs.
- On first run the launcher extracts the app and loader to `%LOCALAPPDATA%\AndroidCleaner\runtime\`.
- adb is extracted to `%TEMP%\AndroidCleaner\adb\platform-tools-37.0.1\`.
- Data lives in `<exe_dir>\data\` when writable, otherwise `%LOCALAPPDATA%\AndroidCleaner\data\`:
  - `config.json`
  - `reports\<id>\dry-run.json`, `candidates.csv`, `dry-run.md`
  - `logs\<id>.log`
- WebView2 Runtime is required. It ships with Windows 11 and updated Windows 10.

## Build

### Portable build (this machine)

The whole pipeline is one command:

```powershell
npm.cmd install
npm.cmd run build:portable
```

`build:portable` runs:

1. `tsc && vite build`
2. `tauri build --no-bundle`
3. the `launcher/` release build
4. copies the final single file to **both** project roots

Output:

```
android-cleaner\AndroidStorageCleaner.exe
..\AndroidStorageCleaner.exe
```

The script adds `../tools/mingw64/bin` and `%USERPROFILE%\.cargo\bin` to `PATH` itself. If you moved MinGW, set `PATH` before running it.

<details>
<summary>Manual two-step build</summary>

```powershell
$env:Path = "C:\Users\Fely\Documents\OpenCode\android-cleanup\tools\mingw64\bin;$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_BUILD_JOBS = "2"

npm.cmd run tauri build -- --no-bundle
cd launcher
cargo build --release
Copy-Item .\target\release\android-cleaner-launcher.exe ..\AndroidStorageCleaner.exe -Force
```

</details>

### Why a launcher

Tauri's GNU build needs `WebView2Loader.dll` beside the app. The `launcher/` crate embeds both the app and the loader, so the distributed artifact is one 12.5 MB `.exe`. On first run it extracts the app and loader to `%LOCALAPPDATA%\AndroidCleaner\runtime\`, then starts it with `ANDROID_CLEANER_DATA_DIR` pointing at `data\` beside the launcher. Rebuild the launcher whenever the Tauri app changes, because its bytes are embedded.

### Standard MSVC toolchain

If Rust MSVC + Visual Studio Build Tools are installed, the same commands work without the MinGW PATH entry. The crate is desktop-only (`rlib`); do not re-add `cdylib`/`staticlib` unless you also fix the GNU export-ordinal issue.

## Development

```powershell
npm.cmd install
npm.cmd run tauri dev
```

The dev build loads Vite at `http://localhost:1420`; keep `npm run dev` running (Tauri starts it through `beforeDevCommand`).

## Tests

Lightweight, no device and no emulator:

```powershell
# Rust core (rules, safety, scanner parsing, reports, deletion logs)
cd core
cargo test

# Frontend pure logic (formatting, treemap layout)
cd ..
npm.cmd test
```

`cargo test` in `src-tauri` is intentionally not used: the Tauri test harness links the Windows manifest twice under GNU ld. All testable logic lives in `core/`.

Current coverage: 29 Rust tests + 7 Vitest tests.

## Project layout

```
android-cleaner/
  core/                 Rust device-independent logic + tests
    src/adb.rs          adb process wrapper and parsers
    src/scan.rs         find/stat scanner and folder rollups
    src/rules.rs        S1-S7, P1-P10, WA/TG media matchers
    src/safety.rs       path normalization and protection
    src/duplicates.rs   size grouping + SHA-256 on device
    src/report.rs       dry-run JSON/CSV/Markdown
    src/cleanup.rs      force-stop, deletion, cache trim
    resources/          embedded adb.exe + DLLs
  src/                  React UI
    pages/              Connect, Dashboard, Scan, Rules, Protected, Report, Logs, Settings
    components/         treemap, folder tree, ring, cards, dialog
  src-tauri/            Tauri shell, commands, embedded frontend
  launcher/             single-file wrapper for app + WebView2Loader.dll
  scripts/              build-portable.ps1
  AndroidStorageCleaner.exe  ready-to-run portable build
```

## Known limitations

- Wireless mDNS depends on the network; use manual `host:port` when discovery is blocked.
- Android 16 scoped storage may hide some app data; the app reports inaccessible paths instead of bypassing them.
- Duplicate hashing is capped (default 5,000 files / 2 GiB) to avoid long scans on low-memory PCs.
- `pm trim-caches` is opt-in and may force games to re-download assets.
- The UI is English; device paths and media names may contain any language.

