# Android Storage Cleaner

## Run it

Double-click:

```
AndroidStorageCleaner.exe
```

That is the portable app. No installer and no admin rights.

- Default UI: Spanish (Latin America), dark theme.
- Use the **ES / EN** and **Light / Dark** controls in the top bar to switch instantly.
- Your choice is saved and restored on the next launch.
- First run extracts the runtime to `%LOCALAPPDATA%\AndroidCleaner\runtime\`.
- Config, reports, and logs go in `data\` next to the executable.
- The phone must have USB debugging enabled and the RSA prompt accepted.

## Build it

```powershell
cd android-cleaner
npm.cmd install
npm.cmd run build:portable
```

The build copies the finished executable to both this folder and `android-cleaner\`.

## Source layout

```
android-cleaner\        Tauri app, React UI, Rust core, tests
  core\                 device-independent Rust logic + tests
  src\                  React UI
  src-tauri\            Tauri shell and commands
  launcher\             single-file wrapper
  scripts\              build-portable.ps1
docs\superpowers\       design and implementation plan
scan\                   earlier CLI cleanup audit data
```

Full documentation: `android-cleaner\README.md`.

## Earlier CLI cleanup reports

- `cleanup-report.md`
- `deletion-report.md`
- `safe-junk.txt`, `probably-junk.txt`, `ask-first.txt`
