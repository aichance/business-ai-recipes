# Passing unit checks, then two selections cleared by an earlier state

Copy [one dependency-free Node test](two-state-preservation.test.mjs) into a checkout of [MisaNeco’s diagnosis app](https://github.com/fearless0712/misaneco-tools). It executes the original scripts, not a replacement save function. No App Crash Lab runner, account or new package is needed.

On the pinned source, the author’s existing Japanese Node suite passed **76,788 checks**. A separately run preservation test found the two selected tasks were retained by the same state and by a state loaded after saving; an older state’s industry change cleared them. A real Chromium replay independently produced the same two passes and one failure. These are operator measurements, not an author execution report.

## Run the Node file

Use a disposable checkout of upstream [`02e7befca9d5e0248f8668adf94607d8c62a9c88`](https://github.com/fearless0712/misaneco-tools/tree/02e7befca9d5e0248f8668adf94607d8c62a9c88). Do not replace an active working copy. The file verifies SHA-256 for `data.js`, `logic.js` and `app.js` before running. A mismatch or missing path is a setup failure.

Save the linked test file somewhere convenient, then run with Node 22 (measured 22.16.0):

```sh
MISANECO_DX_ROOT="/absolute/path/to/misaneco-tools/dx" \
  node --test /absolute/path/to/two-state-preservation.test.mjs
```

Expected on that pin: **2 PASS / 1 FAIL, exit code 1**, with no skipped or expected-failure cases. Node’s test runner reported 121.09 ms for the three cases; source download and setup time were not measured. `MEASURED` rows contain the complete before, expected and actual stored records. This is an additional command; it does not modify the original test harness.

| State performing the industry change | Reloaded selection | Complete record |
| --- | --- | --- |
| Same state that selected the tasks | 2 tasks | PASS |
| State opened after the tasks were saved | 2 tasks | PASS |
| State opened before the tasks were selected | **0 tasks** | **FAIL — PRESERVATION** |

Each case first selects `invoice` and `reconcile` through the original registered handlers. The second operation changes industry from `office` to `realestate`; the test confirms that write actually committed, then compares the whole newer record while allowing only the industry field to change. The failing output has `order: []` and `sel: {}`. Original frequency, minutes, environment and choices are included in the oracle.

## Independent real-browser replay

The Node file uses two VM contexts, a minimal DOM and a shared Map. It does not model a browser’s full DOM, storage events or scheduling. To cross-check that selected path, [browser-replay.mjs](browser-replay.mjs) runs the unchanged app in real Chromium through checkboxes and the industry radio input, then reloads the primary tab.

For the optional replay, put the file in a project with an existing `@playwright/test` and Chromium installation (measured Playwright 1.64.0 / Chromium 156.0.8078.4):

```sh
MISANECO_DX_ROOT="/absolute/path/to/misaneco-tools/dx" \
MISANECO_EVIDENCE_DIR="/absolute/path/outside-dx/evidence" \
  node /absolute/path/to/browser-replay.mjs
```

It starts an ephemeral loopback server, blocks every remote request, does not submit a diagnosis or click affiliate links, and closes the server and browser. It writes screenshots and full records into the evidence directory. Expected: the same **2 PASS / 1 PRESERVATION_FAIL, exit 1**. A launch, source-hash or setup error is not a reproduced preservation failure.

## Scope and attribution

All 233 original source blobs remained unchanged after the checks. The upstream app and data stay in the reader’s checkout; no original implementation or assets are distributed here. This directory distributes the App Crash Lab test files and [measurement metadata](RESULTS.json).

This checks one sequential two-state/two-tab workflow. It does not establish arbitrary concurrent behavior, analytics delivery, backend sync, CSV export, irrecoverable loss, or a production fix. The author can choose an explicit conflict policy; this file expresses a preservation contract and should be revised to test that chosen policy, rather than hiding a failure.

If you run this native App Crash Lab example, a useful result report names your source version, the command and all three outcomes, including any setup issue. Other apps need their own real actions, commit condition and full-record oracle; copying this unchanged file is not a universal test.
