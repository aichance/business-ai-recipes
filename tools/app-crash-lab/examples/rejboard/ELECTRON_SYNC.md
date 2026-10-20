# Real sync-folder acceptance: two Electron profiles, one disposable directory

## Fixed lock retest: a73ee29

The maintainer confirmed the lock bug and [requested verification of the fix](https://github.com/RejwanShafi25/RejBoard/issues/2#issuecomment-6286392970). On [`a73ee294`](https://github.com/RejwanShafi25/RejBoard/tree/a73ee29468ff61f44fc3a4868503cc8438b34819), the **same lock scenario passes**: A still believes it holds the lock, B explicitly takes over, and A's real page reload leaves B's on-disk lock present and B-owned, including ten further checks over one second.

Copy these three files together into your existing Playwright suite:

- [`electron-lock-fixed.spec.mjs`](electron-lock-fixed.spec.mjs)
- [`electron-sync-bootstrap.cjs`](electron-sync-bootstrap.cjs)
- [`media-backup.json`](media-backup.json)

Use a separate disposable RejBoard checkout at the exact fixed commit with its Electron dependencies installed, as described below. Run from the Playwright project, using a fresh output directory:

```sh
REJBOARD_SMOKE=0 REJBOARD_SOURCE_DIR=/absolute/path/to/disposable/RejBoard npx playwright test tests/rejboard/electron-lock-fixed.spec.mjs --workers=1 --retries=0 --global-timeout=180000 --reporter=line --output .crash-lab/rejboard-lock-fixed-1
```

**Measured on 2026-10-20:** one test passed, zero skips/retries; test 19,493 ms, runner 22,427 ms. A was still held and B owned the actual lock 155 ms after A acquired it, before the first 60-second ownership heartbeat. Both Electron apps closed, and all 80 upstream source blobs remained unchanged. Node22.16.0 / Playwright1.64.0 / Electron44.5.1, macOS arm64. [Machine-readable before/after measurements](SYNC_RESULTS.json) retain the original failure and add a separate `fixed_lock_retest` record.

The lock test body is byte-for-byte identical to the earlier failing case. The new file updates four reviewed source pins and the evidence revision, selects the exact `index.html` window despite the added splash, and records process IDs for cleanup. The existing bootstrap and synthetic fixture are unchanged. It imports no App Crash Lab runtime.

This retest covers **only the lock case**. The fixed source is four commits newer and changes board-storage representation; the earlier two full-content backup/import tests were not rerun or declared compatible with it. The original three-case spec and its measurements below stay pinned to4156c283. This is not an isolated single-patch causality experiment, an atomic cross-computer lock guarantee, cloud-sync qualification, or proof that the maintainer ran this test.

## Earlier full-suite measurement: 4156c283

The maintainer [requested a retest](https://github.com/RejwanShafi25/RejBoard/issues/2#issuecomment-6283052485) after adding per-board synced-folder backups in [`4156c283`](https://github.com/RejwanShafi25/RejBoard/tree/4156c283719b40ce4eecf469b308cb95535d7868).

Copy these three files together into an existing Playwright project:

- [`electron-sync.spec.mjs`](electron-sync.spec.mjs)
- [`electron-sync-bootstrap.cjs`](electron-sync-bootstrap.cjs)
- [`media-backup.json`](media-backup.json)

They use only `@playwright/test` and Node built-ins. **No App Crash Lab runtime is imported or installed.** The separate RejBoard checkout needs its own Electron dependencies.

## Run

Use Node22+, Playwright1.64.0 and a disposable RejBoard checkout at the measured commit. In that checkout, install its locked dependencies with lifecycle scripts disabled, then explicitly run the official Electron runtime installer:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node node_modules/electron/install.js
```

From your Playwright project, use a new output directory; Playwright manages its selected output directory:

```sh
REJBOARD_SOURCE_DIR=/absolute/path/to/disposable/RejBoard npx playwright test tests/rejboard/electron-sync.spec.mjs --workers=1 --reporter=line --output .crash-lab/rejboard-sync-1
```

The spec verifies seven upstream source hashes and Electron44.5.1 / electron-updater6.6.2 / lodash.isequal4.5.0. Inspect a changed upstream revision and adapt the pinned hashes/test before using it; changing hashes alone does not establish compatibility. It creates its own empty directories and profiles under test output. It cannot be pointed at an existing sync folder. Do not replace these with your real app/cloud data.

## Measured outcome

Operator run on2026-10-20, macOS arm64, Node22.16.0 / Playwright1.64.0 / Electron44.5.1: **two tests pass; the lock-retention regression fails on the original source. The full command intentionally exits1 on that revision.** [Machine-readable measurements](SYNC_RESULTS.json).

| Check | Result |
| --- | --- |
| Actual per-board `.rjwb` export through original native IPC → actual files → fresh profile Import selected → reload | PASS: complete board fields, ink, synthetic PDF raster, text, tags, two-way links, recording metadata and all3,567 audio bytes |
| Same-count saved-value change used against the original oracle | Difference detected; this is an authored negative control, not spontaneous app corruption |
| Keep both for linked boards | PASS: four complete boards / two recordings; copies point to the copied boards and retain their original data |
| Reserved characters in a title / actual editor rename / re-export | PASS: safe filenames, same board ID, exactly one current file for that ID; old filename removed |
| Newer local edit → import an older real file | PASS: older warning, Skip unchanged, Keep both with correct recording association, Replace and reload |
| Stale lock / fresh foreign lock + Cancel / explicit takeover | PASS: stale marker acquired, Cancel writes no board and preserves original lock, takeover assigns B |
| A still holds its old in-memory lock → B takes over → A reloads before its60s heartbeat | **FAIL: the actual B-owned `.rejboard-lock.json` disappears** |

The last assertion requires the new owner's lock to survive. It is not marked as an expected failure or changed to accept missing locks. The test records that A still considered itself the holder, that B owned the disk marker, and the elapsed time before A's real page lifecycle. It does not establish lost user data or simultaneous cloud writes.

The fixture contains synthetic ink/text/tags, a rasterized synthetic PDF page and a fake-device audio recording. It does not decode an original PDF or prove audio playback. The existing `audio/webm;codecs=opus` → `audio/webm` import normalization is explicitly recorded, not hidden as MIME preservation.

Full file-to-import/reload board comparisons are strict. When Keep both first saves an unchanged open board, RejBoard advances its legacy access stamp `t`; that change is separately range-checked. Creation/modification timestamps and every other original field stay strict. Copy IDs/timestamps and remapped references have separate assertions.

## What is real, and what remains unverified

The original renderer, preload and main-process `sync:*` handlers run unchanged. Only the native folder-dialog **selection result** is supplied by the test launcher. Reads, atomic-temp writes, renames, removal, IndexedDB and profiles use real local files. The launcher isolates `appData` before loading main.js, as well as userData/sessionData/logs/crashDumps; the spec checks actual Electron paths and empty databases. Each app must close, and measured source files must remain unchanged. Attachments include measured results and a restored screenshot; disposable data stays in test output for diagnosis.

External browser requests and unrelated IPC features are blocked; OCR, LAN transfer, updates, real microphones and embedded browsing are not exercised. Vendor math/PDF/export libraries were absent and external fallbacks blocked, so this is a source-checkout desktop test, not a complete packaged-app qualification.

**Not measured:** OneDrive/Dropbox/Google Drive/Nextcloud transport, two physical computers, Chromium File System Access handles, Firefox/Safari download fallback, malformed/duplicate-ID files, symlink/path security, simultaneous lock acquisition, takeover during a long export, and arbitrary user backups. Two local profiles are not evidence for these paths. The earlier [single-board Save/Open test](NATIVE.md) is a separate path.

AI-assisted original tests under a human owner's responsibility; MIT, see [LICENSE](LICENSE). No upstream implementation is redistributed. These are operator measurements, **not a report that the maintainer executed this test**. [App Crash Lab source](https://github.com/aichance/business-ai-recipes/tree/main/tools/app-crash-lab).
