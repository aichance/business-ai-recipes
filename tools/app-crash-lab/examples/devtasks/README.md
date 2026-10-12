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

## Two different promises to check

| Promise | Local result on the pinned source |
|---|---|
| A valid imported task survives reload | PASS |
| Malformed JSON is rejected and existing task data stays identical | PASS |
| Missing `tasks` is rejected and existing task data stays identical | PASS |
| The app's own default-category export restores in a fresh context | PASS |
| The app's own custom-category export restores in a fresh context | FAIL: schema rejection; no target task restored |

The first three are App Crash Lab contracts (CLI **3 PASS**, exported
Playwright **3 PASS**). The last two are a separate Playwright round-trip test
(**1 PASS, 1 FAIL**). App Crash Lab does not currently capture downloads as
dynamic input for a later import. Passing its preservation checks does not
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

DevTasks is Shamil's MIT-licensed project and is downloaded from its author;
its source is not bundled here. These independently written tests and contracts
use this repository's MIT license.
