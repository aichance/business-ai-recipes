# Existing single-board `.rjwb` Save/Open: a standalone Playwright test

For the newer per-board sync-folder feature and real Electron/filesystem checks at `4156c283`, use the separate [sync-folder acceptance test](ELECTRON_SYNC.md). The original Save/Open measurement below remains unchanged.

Copy [`single-board.spec.mjs`](single-board.spec.mjs) and [`media-backup.json`](media-backup.json) together into an existing Playwright project. **The test imports only `@playwright/test` and Node built-ins. It does not import or install App Crash Lab.** The optional files are in this repository; the older v0.1.0 trial ZIP contains the separate all-board JSON baseline.

This follows the maintainer's [backup testing request](https://github.com/RejwanShafi25/RejBoard/issues/2). Single-board Save a copy/Open already exists in measured commit [`14d6318`](https://github.com/RejwanShafi25/RejBoard/tree/14d63180e4cb932db39793050992ff406f8a3165). This is a regression for that path, separate from future multi-board export, synced folders and locks.

## Run against a disposable local checkout

Use Node.js22+ and Playwright1.64.0 with its Chromium installed. In a disposable RejBoard checkout at the measured commit, start the app:

```sh
python3 -m http.server 59819 --bind 127.0.0.1
```

In your Playwright project, put the two files together (for example under `tests/rejboard/`), then run:

```sh
REJBOARD_URL=http://127.0.0.1:59819 npx playwright test tests/rejboard/single-board.spec.mjs --workers=1 --reporter=line --output .crash-lab/rejboard-single-1
```

Use a new output directory: Playwright manages and may clear its selected output directory. Use an isolated test configuration that permits local HTTP and Chromium. The spec creates its own fresh, unauthenticated contexts with service workers and WebSockets blocked and forwards only GET/HEAD to the selected numeric-loopback origin. No account, API key, real backup, microphone or cloud folder is used.

The test verifies the served `index.html` SHA-256 (`af289841ee78c711bf08122fad9e34f38abefe33c4586d8129ff6dc8c8037039`). For a changed revision, inspect the source, adjust selectors/assertions if needed, then explicitly set `REJBOARD_SOURCE_SHA256` to its reviewed hash. A new hash alone does not establish compatibility.

## What was actually measured

Operator run on 2026-10-20 JST, Node22.16.0 / Playwright1.64.0 / Chromium: **one Playwright test passed, including all three cases below, in7.1s**. The original496,196-byte `index.html` was unmodified before/after. Vendor PDF/math/export libraries and icons were absent in this source-only loopback check; external fallback requests were blocked. This is not a full packaged-desktop test.

| Case | Actual app behavior | Comparison with the original file |
| --- | --- | --- |
| Real Save a copy download → Open file in empty context → reload | PASS: exported board fields, recording name/time/duration, all3,567 audio bytes and association with the newly created board survive | PASS |
| Same item count, one text item deliberately changed | The changed file is imported and persisted; its contents match the changed payload | Original-state oracle detects the difference before and after reload |
| Same recording metadata and byte length, one audio byte deliberately changed | The changed bytes are imported and persisted | Original-state oracle detects the difference before and after reload |

The real download was23,574bytes, SHA-256 `29ed753afd2e329a313495f1c3897533d1c0e91b725b31f16784533bd09b1cd9`. Synthetic audio SHA-256 `b58efacc493ade315bf285b5d5119e222640956a08cb293b7c1f41b9047a0704`. The unchanged downloaded bytes are used for the positive import, rather than rebuilding a substitute file.

The file-to-restored-state assertions compare every field in `title/items/bg/pat/gs/gd/layers/tags/pg`, not counts alone. Preparing the synthetic seed can change the rendered non-sticky text width/height: the original app’s `txt()` recomputes these from canvas font metrics. The spec records fixture/stored/exported sizes and excludes only those derived text dimensions from the seed-preparation comparison. It keeps the full strict comparison, including dimensions, from the actual exported file through Open/reload. This does not claim that opening the seed preserves its old layout cache exactly. New board/recording IDs are required, timestamps are checked, and the recording must belong to the newly imported board. Complete old/new database records are intentionally not expected to be identical: Open assigns new IDs/times/parent. Test attachments contain the actual synthetic board file, states, restored screenshot and summary.

The fixture is the previously disclosed board with synthetic PDF raster, text, ink, tags and fake-device recording. Initial whole-board JSON Restore changes `Blob.type` from `audio/webm;codecs=opus` to `audio/webm`; the new file test records that known difference and starts from the actual restored state. The `.rjwb` export still carries the recording metadata MIME `audio/webm;codecs=opus`, while Open normalizes that metadata to `audio/webm` as well. The test separately asserts that normalization; it does not establish original MIME-parameter retention or an audio playback defect.

The deliberate changed-file cases test the comparison's sensitivity; they are not claims that RejBoard spontaneously corrupts data. Linked boards, arbitrary/user backups, malformed files, replace/keep-both/skip, original PDF bytes/decoding, audio playback, other browsers, desktop IPC and folder synchronization remain outside scope. These are operator measurements, **not evidence that the maintainer has run the test**.

AI-assisted original test under a human owner's responsibility; MIT, as in this directory's [LICENSE](LICENSE). No upstream implementation is redistributed. [Reusable App Crash Lab source](https://github.com/aichance/business-ai-recipes/tree/main/tools/app-crash-lab) · [Separate all-board JSON baseline](README.md).
