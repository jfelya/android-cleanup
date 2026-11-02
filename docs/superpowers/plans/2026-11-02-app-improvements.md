# Android Storage Cleaner — Improvement Plan

**Date:** 2026-11-02
**Status:** proposed, awaiting approval
**Constraint:** implementable offline; device verification only when the phone is reconnected.

---

## What we learned from the connected session

- Device: POCO X6 Pro 5G (`2311DRK48G`), Android 16 / SDK 36, HyperOS 3.0.9.0.
- The `[Build.BRAND] …` flood was **not** a device problem.
- Root cause: `adb shell sh -c "<cmd>"` is re-split by adb. The device ran `sh -c getprop` with no key, so `getprop` dumped every property. This affected every `shell`/`exec-out` command, including scan and device metadata.
- Fix applied in `core/src/adb.rs`: one remote command argument; quoted stdin scripts. Regression tests added. Core suite: **32 passed**.
- Phone disconnected before the full storage profile completed; device-specific verification of the rebuilt exe is pending.

---

## Gaps and opportunities

| # | Area | Current behavior | Problem |
|---|------|------------------|---------|
| 1 | Scan | `exec-out` captured fully, then parsed | UI shows “0 entries” for the whole scan; no cancel; large memory spike |
| 2 | Device state | Scan/dry-run stay in memory | Switching/disconnecting leaves stale data visible |
| 3 | Metadata | Shows `miproduct_duchamp` / raw state | Product name is not human-friendly |
| 4 | Rule counts | All categories show 0 until a dry run | Users can’t see what is junk after scanning |
| 5 | File types | Only folder sizes | Original requirement asked for a type breakdown |
| 6 | Reports | Backend Markdown/JSON is English only | Spanish UI produces English reports |
| 7 | Wireless | Pair/connect only; no persistence | Re-pairing every session; no disconnect control |
| 8 | Duplicates | Summary only | No keeper path/group view before deleting |
| 9 | Logs | Only folder paths | Can’t read the run log in-app |
| 10 | Cache trim | Config only | No preview of app-cache size or expected recovery |
| 11 | Errors | Rust strings leak into Spanish UI | Mixed-language errors |
| 12 | Performance | 90k-entry scan cloned/JSON-serialized | High memory/transfer cost |
| 13 | CI | None | No automated check on GitHub |
| 14 | Rule UX | Hard-coded categories | No custom rules/protected patterns beyond paths |

---

## Proposed batches

### Batch 1 — Reliability and clarity (recommended first)

**1. Streaming scan + cancel**
- Stream `find | xargs stat` stdout line-by-line instead of buffering all.
- Emit real progress every 500 files.
- Add a cancel flag that terminates the adb child.
- Acceptance: scan shows increasing counts immediately; cancel stops within 1s; partial index is discarded.

**2. Stale-state safety**
- Clear scan/dry-run when the selected serial changes or the device goes offline.
- Mark the last scan as stale if the serial or free-space changed.
- Acceptance: switching/disconnecting never shows another phone’s files.

**3. Device metadata cleanup**
- Prefer `ro.product.marketname`, then `ro.product.model`; cap length and strip newlines.
- Hide `miproduct_*` internal names; localize `device`/`unauthorized`/`offline` states.
- Acceptance: POCO X6 Pro 5G shows a clean name, no raw props.

**4. Rule counts from the scan**
- Add a backend command that evaluates rules against the stored scan without hashing duplicates.
- Rules page shows counts/sizes immediately after scanning.
- Acceptance: S1–S9/P1–P9 and media counts populate before “Build dry run”.

---

### Batch 2 — Missing product features

**5. File-type breakdown**
- Aggregate images, video, audio, documents, archives, APKs, other.
- Show a compact donut/bar on Dashboard and Scan.
- Acceptance: totals match the scan within 1%.

**6. Localized reports**
- Generate report text from language-neutral codes; render Spanish/English Markdown and CSV headers.
- Map backend error codes to localized messages.
- Acceptance: Spanish UI produces Spanish report/log headers; paths unchanged.

**7. Duplicate detail view**
- Show groups: hash, size, keeper path, deletable copies.
- Stream hash progress; show cap status.
- Acceptance: user can inspect why a file is marked duplicate.

**8. Wireless session management**
- Persist paired host:port, reconnect list, disconnect button.
- Better mDNS parse (pairing vs connect), manual fallback.
- Acceptance: reconnect without re-pairing; disconnect removes the device.

**9. In-app log viewer**
- Read `logs/<id>.log`, `dry-run.md`, and `execution.json` in a modal.
- Add “open file” and “copy path”.
- Acceptance: no need for Explorer to inspect a run.

**10. Cache-trim preview**
- Read `dumpsys diskstats` App Cache Size; show estimated recovery before execution.
- Acceptance: preview matches the subsequent trim within a reasonable margin.

---

### Batch 3 — Performance, tests, CI

**11. Memory/transfer**
- Store scan behind `Arc`, avoid cloning 90k entries, send only folder summaries + lazy file pages.
- Acceptance: <150 MB peak RAM for a 100k-file scan.

**12. Test/CI**
- GitHub Actions: `cargo test` (core), `npm test`, `npm run build`.
- Add tests for command construction (already added), stale-state reset, rule counts, report localization.
- Acceptance: CI green on push.

**13. Configurable rules**
- JSON rule definitions with include/exclude patterns, editable from Settings.
- Acceptance: users can add a custom cache folder without code changes.

---

## Explicitly out of scope for now

- Root-only paths (`/data/data`, `/data/app`, system partitions).
- Scoped-storage bypass.
- Cloud sync/telemetry.
- Scheduled background cleaning.
- Deleting personal media automatically; always requires dry-run approval.

## Device verification checklist (when reconnected)

- Scan shows a live count and completes.
- Dashboard folder totals match `du`.
- Device name is clean.
- Rules counts populate before dry run.
- Cancel scan works.
- No `[Build.BRAND]` text anywhere.
- Wireless pair/reconnect works.
- Report/log language matches UI.
- Portable exe still launches after cleanup.

## Recommendation

Start with **Batch 1** — it fixes the remaining reliability issues exposed by the flood and makes the app trustworthy on first connect. Batch 2 adds the missing product surface; Batch 3 pays down memory and CI.
