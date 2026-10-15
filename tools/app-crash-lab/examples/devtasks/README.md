# DevTasks: a backup can export successfully and still fail to restore

The [DevTasks](https://github.com/shamilahmdt/devtasks) Task Workspace supports
custom categories. On unchanged source
[`d59dc107`](https://github.com/shamilahmdt/devtasks/tree/d59dc107dd7fcc6e427cc683a5ee79474b4fac29),
we created a task in category `DOCS`, clicked **Export JSON**, and uploaded that
exact file into a fresh browser context. Import rejected it with
`File validation failed — invalid task schema detected.` The target task store
remained absent. The same flow with the default `FEATURE` category restored the
task and survived reload.

The source permits new category strings in `CategoryContext.jsx`, while the
Task Management `DataCenter.jsx` import validator only accepts `FEATURE`, `BUG`
and `REFACTOR`. We did not change the app, manufacture the exported JSON, or
claim that existing data was deleted. This is an AI-assisted local reproduction,
not a test of the current public deployment or an endorsement by its author.

Want this check for your own app? [Copy the test and change four areas](#adapt-the-test-to-your-own-app).

## Watch the real export/restore flow

[![Actual DevTasks UI: create a custom DOCS task and export JSON; import the unchanged file into a fresh context and receive a schema rejection; the built-in FEATURE control restores and survives reload](https://aichance.github.io/business-ai-recipes/devtasks-backup-roundtrip.gif)](https://aichance.github.io/business-ai-recipes/devtasks-backup-roundtrip.mp4)

[Play the MP4](https://aichance.github.io/business-ai-recipes/devtasks-backup-roundtrip.mp4).
This is a local recording of the pinned, unchanged DevTasks source above,
with synthetic records. Separate source and fresh-target context clips are
joined at normal speed; initial startup waits are trimmed and explanatory
captions sit above the app. App pixels are not altered. The `FEATURE` control
uses its own export. The round-trip is the separate Playwright test below,
not a recording of the later App Crash Lab0.6 CLI feature.

## Two different promises to check

| Promise | Local result on the pinned source |
|---|---|
| A valid imported task survives reload | PASS |
| Malformed JSON is rejected and existing task data stays identical | PASS |
| Missing `tasks` is rejected and existing task data stays identical | PASS |
| The app's own default-category export restores in a fresh context | PASS |
| The app's own custom-category export restores in a fresh context | FAIL: schema rejection; no target task restored |

The first three were App Crash Lab0.4.0 contracts (CLI **3 PASS**, exported
Playwright **3 PASS**). The last two are a separate Playwright round-trip test
(**1 PASS, 1 FAIL**). That 0.4 release did not capture downloads as dynamic input for a later import. Passing its preservation checks does not
prove that all valid backups can be restored.

## Run against disposable local source

Tested 2026-10-12 on macOS arm64, Node22.16.0, Playwright1.64.0 / Chromium,
App Crash Lab0.4.0. Use two terminals. All task records are synthetic, every
check uses fresh browser contexts, and test traffic is restricted to the one
loopback origin. Do not point the tests at a real account or valuable data.

In a checkout of DevTasks:

```sh
git clone https://github.com/shamilahmdt/devtasks.git devtasks-local
cd devtasks-local
git checkout d59dc107dd7fcc6e427cc683a5ee79474b4fac29
npm ci --ignore-scripts
npm run build
npm run preview -- --host 127.0.0.1 --port 54431 --strictPort
```

Keep that server running. In this repository's `tools/app-crash-lab` directory
(the DevTasks example was added after the 0.4.0 release archives):

```sh
npm ci --ignore-scripts
npx playwright install chromium
node cli.mjs run examples/devtasks/malformed.json
node cli.mjs run examples/devtasks/missing-tasks.json
npx playwright test --config examples/devtasks/playwright.config.mjs
```

The first command runs reload and malformed-file checks. The second tests the
missing-task database. Each writes a new report folder with HTML, JSON,
screenshots, traces and a standalone `repro.spec.mjs`. For each report, run
`npx playwright test --config <report-folder>/playwright.config.mjs` to rerun it.

The final command exits **1** on the pinned version because the `DOCS` case
asserts the desired restore behavior, not the current refusal. The default
control must pass. Its output folder retains the actual unedited backup,
import screenshot and observations JSON. After a future upstream fix, both
round-trip cases should pass; we have not tested a repair.

The preservation contracts import one fixed `BUG` task and compare its entire
saved record plus the rendered inventory count. Rejection requires the exact
visible error toast, and data is compared through a 750ms final stability
window. They do not check a second reload after rejection, UI-created tasks,
all schema variants, multiple tabs, storage limits, mobile, or process crashes.
The round-trip test separately creates its task through the normal UI and
waits for the startup splash to disappear before importing in the new context.

## Adapt the test to your own app

For a web app that exports and imports browser-local data, copy
[`backup-roundtrip.spec.mjs`](backup-roundtrip.spec.mjs) and
[`playwright.config.mjs`](playwright.config.mjs) side by side into an existing
`@playwright/test` project, for example `tests/backup/`. The spec is an editable
starting point; it does not discover your app's controls automatically.

| Edit area | In the current spec | Replace with your app's behavior |
|---|---|---|
| 1. Local app and cases | `origin`, `importError`, `['FEATURE', 'DOCS']` | One disposable loopback app, its import error text, and two valid records your UI allows: an ordinary case and an edge case. The existing route restriction allows only that origin. |
| 2. Create and read the source | `/taskmanage/add-tasks`, `Task Description`, `Create Task`, `localStorage.getItem('tasks')` | Create a synthetic record through the normal UI, wait for it to save, then read and assert the complete expected record. Update every state read, not just the first one. |
| 3. Export and import | `/taskmanage/data-center`, `Export JSON`, `JSON.parse(backup.toString()).tasks`, `Upload Backup`, splash heading, `input[type=file]`, toast selectors | Your download/upload controls, exported payload shape and readiness/result signals. Retain the assertion that the complete exported record equals `saved`; shape or count alone can miss lost fields. Keep the same downloaded `backup` buffer as the upload input; do not edit or reserialize it. Verify the fresh target contains no records before import. |
| 4. Prove restoration | The final `expect.poll(...).toEqual(saved)`, `/taskmanage/list-tasks`, task text checks | Compare the complete restored record with the source, then navigate to its visible UI and check again after reload. A success toast or record count alone is insufficient. |

Start your local app, then run from your Playwright project:

```sh
npx playwright test --config tests/backup/playwright.config.mjs
```

Both valid cases should restore. The unchanged DevTasks example deliberately
stays red for `DOCS` on the pinned source: do not change that assertion to
expect rejection, mark it `test.fail()`, or hide exit code 1. Keep the actual
download, import screenshot and observations from the test output to diagnose
the failure. If importing never reaches the expected UI signal, that is a
setup failure to investigate, not evidence that the saved data survived.

Fresh contexts separate browser storage, **not a shared server database**.
This example therefore uses a disposable browser-local app. A server-backed
app needs its own isolated synthetic dataset and independent target setup
before adapting this flow. The historical separate test remains available; runner0.6+ also offers the
common backup-roundtrip mode described below.

DevTasks is Shamil's MIT-licensed project and is downloaded from its author;
its source is not bundled here. These independently written tests and contracts
use this repository's MIT license.

## Run the same real-file roundtrip with App Crash Lab0.6+

Keep the unchanged app preview running at `http://127.0.0.1:54439` (change the
preview port above, or pass `--base-url` to match your chosen loopback port).
From `tools/app-crash-lab` in the current source checkout:

```sh
node cli.mjs run examples/devtasks/roundtrip-feature.json
node cli.mjs run examples/devtasks/roundtrip-docs.json
```

On the unchanged pinned source, FEATURE must PASS and DOCS must FAIL. These
contracts create real UI records, download each app-generated JSON file, check
its complete `tasks` payload against the source, and import the same bytes in
a separate empty context. The normal control must retain every task field and
rendered task after reload. DOCS never reaches the expected successful import
signal because its self-exported custom category is rejected. Do not relabel
that failure as a passing rejection test. This is a local reproduction with
synthetic data, not the author's own run or a claim about the current deployment.

The core [backup contract guide](../../BACKUP.md) explains adapting the mode.
Unlike the historical separate spec, this mode does not attach the raw backup,
state values, screenshots or traces. Its report retains status/phase, export
size/hash and comparison flags; the declared contract remains in the output.
Generated standalone tests use the same protocol and preserve result semantics.
