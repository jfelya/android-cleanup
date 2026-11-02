# Repository Rules

## Git

- Work on `main`.
- Never commit unfinished, speculative, or untested work.
- Commit only features and parts that are tested and functional.
- When a feature is tested and functional, you may commit it on your own.
- Do not commit anything else without explicit user approval.
- Never commit personal device scan data, credentials, tokens, or local build caches.
- Keep the root `AndroidStorageCleaner.exe` up to date via `npm run build:portable`.

## Build

- Source lives in `android-cleaner/`.
- Portable build: `cd android-cleaner; npm.cmd run build:portable`.
- Tests: `cd android-cleaner/core; cargo test` and `cd android-cleaner; npm.cmd test`.

## Context

- Device health/tuning findings, confirmed ADB commands, and the plan for turning them into app
  features live in `DEVICE-TUNING.md`. Read it before touching anything outside storage cleanup.
