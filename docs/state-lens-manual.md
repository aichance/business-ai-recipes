# Record your own app without writing a test

State Lens0.6.0-experimental.1 includes a manual checkpoint entry in the same
common MIT package. You operate your own app and name the checkpoints; the
helper observes selected storage values and screenshots into one local HTML.
It does not click Save, alter storage, generate assertions or decide PASS.

Use **Node22+ and a project that already has Playwright/Chromium installed**.
No existing test is required. Nothing is installed automatically. If you
already have a save/reload test, [keep that test and add the library](state-lens-install.md).

## Run from your app's directory

1. Download the [common0.6.0-experimental.1 archive](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.6.0-experimental.1.tgz)
   and [SHA256](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.6.0-experimental.1.tgz.sha256),
   verify and review the source, and extract it into a **new** directory.
   Keep its `package` folder intact. Do not replace an existing tool copy.
2. In your app's directory, create a small JSON file selecting a key you know
   from your app's code. For example, save this as `state-lens-probe.json`,
   replacing `your-known-draft-key` with the actual key:

```json
{"name":"draft","source":"localStorage","key":"your-known-draft-key","json":true}
```

Use `json: false` for ordinary text. A probe for one known IndexedDB record is:

```json
{"name":"draft","source":"indexedDB","database":"your-database","store":"your-store","key":"your-record-key"}
```

A JSON array of1–16 normal probes also works. The same sessionStorage, Date,
undefined and optional JSON-pointer observations are supported. Only configured
storage values are included. The IndexedDB observer lists database-name metadata
to check the selected database; it does not export other database contents. For large records, [select known fields](state-lens-selected-fields.md).

3. Keep your terminal in your app's project directory, start its normal dev
   server, and run the extracted entry using your actual paths and app URL:

```text
node "path-to-new-directory/package/capture.mjs" --url "http://127.0.0.1:5173" --probe-file "state-lens-probe.json"
```

The entry finds your existing `playwright` or `@playwright/test` installation
from the current directory. It does not change dependencies or browser
settings. `--help` works without a project or browser.

## Operate, wait, then name a checkpoint

The command opens a **fresh temporary browser**, with no everyday profile,
login or saved app data carried over. Prepare a normal workflow using your
own app's test data in that window.

- When the starting screen is ready, type `Before` in the terminal and Enter.
- Perform the edit/save yourself. Wait for the app's normal ready condition,
  then type `Saved` and Enter.
- Reload the browser yourself, wait until ready, then type `Reloaded` and Enter.
- Enter a blank name to finish and print the new local HTML path.

Those names are your labels, not claims that saving succeeded. Each checkpoint
has `CHECKPOINT` status. Compare the captured fields and screens; use your
existing assertions/Trace when a correctness test is needed. Observations can
change timing and do not establish server commit time.

At most50 checkpoints are recorded per invocation, with names up to160
characters. The first observed HTTP origin becomes the selected origin;
later cross-origin observations are inconclusive. New tabs are not followed.

EOF, Ctrl+C or closing the observed page stops capture. Already-recorded
checkpoints are written before cleanup; an empty session writes no report.
Output errors remain errors. Every invocation uses a new private temporary
directory and never replaces an earlier HTML. Closing the temporary browser
does not retain its browser data; the HTML is the observation that remains.

Reports contain selected app data and screenshots. Keep them local unless you
have reviewed their contents. A trial report can simply state your tool/runtime
versions, whether it ran on your own project, and whether the HTML added value.

## Evidence and scope

[Sethera's author](state-lens-sethera-ownapp.md) used the earlier common0.4.1
library from a newly written plain Playwright script on their own app. That
showed an existing test suite is not an intrinsic requirement of the observer.
This0.6 entry reduces the setup code; that author has not reported using it.

The entry's local checks use controlled synthetic apps for save/reload,
localStorage/sessionStorage/IndexedDB, interrupted input, partial results and
cleanup. These are operator checks on macOS, Node22.23.4 and Playwright1.64.0,
including a real headed terminal run. The native Windows interactive entry
has not been verified; the earlier Windows author report used0.4.1.
Standard DevTools, explicit page evaluation and Playwright Trace remain valid choices.
