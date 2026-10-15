# A workout comes back; the profile and goals do not

[Focus / workout-tracker](https://github.com/mfundora19/workout-tracker) has a real
JSON export and an import preview labelled “full-fidelity restore.” On the
[pinned source](https://github.com/mfundora19/workout-tracker/tree/81b731bef0719f55f6a2ab93bf4dfd00d6d25037)
checked on **2026-10-15**, the downloaded file contains the user settings below,
but a completed import into a fresh browser context does not restore them.

The **complete synthetic workout record**, including its generated ID and
creation/update timestamps, restores correctly. A successful record count or
“Import complete” toast alone therefore misses this difference.

| Selected user setting | Saved and present in the exported JSON | After native import and reload |
| --- | --- | --- |
| Height | `171` | `null` |
| Age | `31` | `null` |
| Neck | `37` | `null` |
| Weight unit | `kg` | `lb` |
| Week starts on | `sunday` | `monday` |
| Complete `goals` object | 450 kcal / 35 min / 4 days; kg; optional weight `null`; food goal `true` | Default three targets `null`; optional weight and goal unit absent |
| Height / neck units | `cm` / `cm` | `cm` / `cm` |

These are invented fixture inputs, not anyone's health information or advice.
The `lastBackupAt`, `lastImportAt`, `seedVersion` and `lastBackupReminderAt`
metadata are outside this assertion. Its documented food-log conflict policy is also outside this
case. The initial local diagnostics reproduced the difference twice.

## Run the regression and its control

This is a **standalone Playwright example** distributed with App Crash Lab.
It does not require the App Crash Lab CLI. Runner **0.6.2's JSON backup contract
does not support this app's normal import-preview commit button**; this example
clicks that real HTML button explicitly. Do not describe a 0.6.2 contract as having
passed this workflow.

Use **Node 22+, npm, Python 3** and a disposable local checkout. No account, API key,
cloud dataset or modified upstream code is needed. Keep the app source in its own
folder: it is GPL-3.0; this original test and documentation are MIT.

In an empty working folder, start the pinned app:

```sh
git clone https://github.com/mfundora19/workout-tracker.git focus-under-test
git -C focus-under-test checkout --detach 81b731bef0719f55f6a2ab93bf4dfd00d6d25037
python3 -m http.server 54523 --bind 127.0.0.1 --directory focus-under-test
```

In another terminal in the same working folder:

```sh
mkdir focus-backup-test
cd focus-backup-test
npm init --yes
npm install --ignore-scripts --save-dev --save-exact @playwright/test@1.64.0
npx playwright install chromium
curl -fSL https://raw.githubusercontent.com/aichance/business-ai-recipes/3449463dc0e56395aa3082cdfef101a2a6a0a6e3/tools/app-crash-lab/examples/focus-backup/roundtrip.spec.mjs -o roundtrip.spec.mjs
curl -fSL https://raw.githubusercontent.com/aichance/business-ai-recipes/3449463dc0e56395aa3082cdfef101a2a6a0a6e3/tools/app-crash-lab/examples/focus-backup/playwright.config.mjs -o playwright.config.mjs
npx playwright test --config playwright.config.mjs
```

From an existing App Crash Lab **source checkout**, install its dependencies with
`npm ci --ignore-scripts --no-audit --no-fund` in `tools/app-crash-lab`, install
Chromium once, then run:

```sh
npx playwright test --config examples/focus-backup/playwright.config.mjs
```

The pinned source should report **one passing record control and one failing
settings regression**, with exit status **1**. A timeout, blocked local server,
missing download or different assertion is an unsuccessful reproduction, not
confirmation of the settings defect. Keep the failing equality assertion when
checking a future upstream fix: both tests should then pass. Do not rewrite the
settings or remove mismatching fields to get a green result.

The tests use two fresh browser contexts each time. Focus boots with bundled
demo history, so they remove that history through **Data → Delete all → Delete
everything** inside those new contexts, then confirm the three record stores are empty. The settings record and its
seed marker remain in place; this is not an empty IndexedDB database.
They never connect to your normal browser profile. They create one synthetic
workout and named settings through normal controls, reload to prove the save
finished, download the app's own JSON, import its **unchanged bytes**, commit the
app HTML preview, wait for the completion toast, reload, and read IndexedDB through
readonly transactions. Only the configured loopback origin is allowed.

Each run writes synthetic backup and observation attachments beneath
`.crash-lab-results/`. No output is uploaded. The eight selected user-settings
properties include the **whole `goals` object**; every workout field is compared.
Empty measurements/challenges are checked to remain empty, which does not test
those features. Excel, PDF, arbitrary settings, existing-target merge conflicts,
multiple workouts and real-user execution remain unverified.

[Source identity and license](SOURCE.json) · [Measured results](results-summary.json)

This case is maintained by the AI-operated, human-supervised `aichance` project.
It is our local reproduction, not a report that the upstream author used the tool.
For other local apps, [App Crash Lab](../../README.md) provides declarative
save/reload, rejected-update and compatible JSON-backup checks, with reusable
Playwright tests and local reports.
