# Android Storage Cleaner — Design

**Date:** 2026-10-30
**Status:** approved approach (Tauri + React + TypeScript)
**App dir:** `android-cleaner/`

## Intent

A portable Windows desktop app that turns the proven adb cleanup workflow into a safe, visual tool: connect a phone, inspect storage, select rule categories, review a dry run, and execute a logged cleanup.

## Goals

- USB and wireless ADB connection, including Android 11+ pairing.
- Device dashboard: model, Android version, storage totals/free space.
- Full `/sdcard` scan (files + sizes + mtimes), treemap and folder tree.
- Data-driven rules: S1–S7, P1–P10, WhatsApp media, Telegram media, duplicates.
- Configurable protected paths, enforced in the scanner, dry run, and deletion engine.
- Mandatory dry-run report before deletion; explicit confirmation to execute.
- Per-path audit logs and before/after free-space reporting.
- Single portable `.exe`; no installer, no admin, no external runtime beyond WebView2.

## Non-goals (v1)

- Root-only paths (`/data/data`, `/data/app`, system partitions).
- Bypassing scoped storage.
- Background/scheduled cleaning.
- Multi-device simultaneous operations.
- Cloud sync or telemetry.

## Architecture

```
React UI (Vite)
  └─ Tauri commands/events
       └─ Rust core
            ├─ adb transport (process wrapper, embedded adb)
            ├─ scanner (find + stat over exec-out)
            ├─ rule engine + protected-path guard
            ├─ duplicate hashing (on-device sha256)
            ├─ dry-run/report generator
            └─ deletion engine + audit log
```

### Portable layout

- `android-cleaner.exe` embeds the React assets, Rust logic, and `adb.exe` + its two DLLs.
- On first run, adb is extracted to `%TEMP%\AndroidCleaner\adb\<build-id>\`.
- If the exe folder is writable, config/reports/logs live in `<exe_dir>\data\`; otherwise `%LOCALAPPDATA%\AndroidCleaner\data\`.
- No registry writes.

### ADB transport

- `AdbClient` wraps `std::process::Command` with hidden console windows.
- Methods: `devices`, `shell`, `exec_out`, `mdns_services`, `pair`, `connect`, `disconnect`, `push`, `start_server`.
- Device discovery polls `adb devices -l` every 2 s while the app is open.
- Metadata comes from `getprop` and `df -k /storage/emulated/0`.
- Wireless: `adb mdns services` for discovery; user supplies pairing code; `adb pair host:port code`, then `adb connect host:port`.

### Scanner

- One streaming command:
  `find /storage/emulated/0 -type f -print0 | xargs -0 stat -c '%s|%Y|%n'`
- Parses `size|mtime|path` lines, emits progress events every 2,000 files.
- Builds a folder tree in Rust; serializes the flat file list + tree to the UI.
- Skips inaccessible paths and reports them rather than escalating.

### Rule engine

- Rules are data-driven (`id`, `label`, `confidence`, `include` predicates, `exclude` predicates, optional group).
- Default categories mirror the proven CLI:
  - S1 Ringtone trash; S2 thumbnails; S3 WhatsApp `.Shared` temp >24 h; S4 zero-byte corrupt media; S5 stale locks; S6 MIUI bug-report cache; S7 Android cache marker.
  - P1 WhatsApp `.Links`; P2 `.Statuses`; P3 sticker backups; P4 Telegram cache; P5 Wild Rift logs; P6 other app logs; P7 SHAREit cache; P8 ReadEra covers; P9 `.crdownload`; P10 hash duplicates.
  - WA media: Images, Video, Audio, Voice Notes, Animated Gifs, Stickers, Video Notes, AI Media, Sticker Packs, Backup Excluded Stickers.
  - TG media: Images, Video, Audio, Stories.
- Protected paths are checked first; a candidate inside any protected prefix is never selectable.
- Default protected prefixes: `Fely/`, `snaptube/`, `Download/`, `DCIM/Camera/`, `DCIM/ScreenRecorder/`, `Pictures/Screenshots/`, `DCIM/Screenshots/`, WhatsApp `Databases/`, Telegram `Documents`/`Files`, `Android/data` game packages, `Android/obb`.
- `.nomedia` is always protected.

### Duplicates

- Group by exact size, exclude protected paths and `Android/data`.
- Hash candidates on-device with `sha256sum` fed through stdin.
- Caps: 5,000 files / 2 GB per run (configurable); over-cap groups are reported as “not hashed”.
- Keeper preference: protected copy first, then oldest; never delete inside a protected prefix.

### Dry run and execution

- Dry run produces JSON, CSV, and Markdown under `data/reports/<timestamp>/`.
- Summary: file count, bytes, estimated free-space gain, protected exclusions, warnings.
- Execution requires typing `DELETE` and checking the device serial.
- Before deletion: force-stop affected packages (`com.whatsapp`, `org.telegram.messenger`, and optional SHAREit/ReadEra if installed).
- Deletion runs one shell loop with a path list on stdin; logs `OK|size|path`, `MISSING|0|path`, `FAIL|size|path`.
- After deletion: optional `pm trim-caches <target bytes>`, then `df` before/after.
- No retries with workarounds; failed paths are reported.

### UI

- Dark “studio” theme: deep navy, teal/violet accents, soft cards, native title bar.
- Pages: Connect, Dashboard, Scan, Rules, Protected, Report, Logs, Settings.
- Charts: custom SVG storage ring + treemap (`d3-hierarchy`), CSS bars; no chart framework.
- State: Zustand store; Tauri event listeners for scan/cleanup progress.
- Virtualized folder tree (simple windowing) for 90k+ entries.

## Constraints

- Windows 10/11, WebView2 runtime.
- No admin rights for the app.
- Non-root Android; scoped-storage limits are reported, not bypassed.
- Build target: `x86_64-pc-windows-gnu` (Rust 1.99 + WinLibs GCC 16.2) because MSVC Build Tools would require UAC.
- Tests must stay lightweight: no emulator, no device required, no browser E2E.

## Risks

- GNU-target Tauri build quirks; fallback is MSVC Build Tools with user-approved UAC.
- 7.2 GB RAM / 1 GB free: cap Cargo jobs, avoid debuginfo, clean `target` after release.
- Wireless mDNS is network-dependent; manual IP:port fallback is required.
- Deleting WhatsApp/Telegram media removes it from chats; the confirmation screen must say so.
