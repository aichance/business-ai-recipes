# Cheese TOEIC Tracker: repeat the real JSON restore

This configuration creates an L1 review, a vocabulary phrase and a manual score
through the app's UI, then restores its actual JSON in a fresh browser. It uses
App Crash Lab **0.8+** and the app's own HTML import preview and one confirmation.
It does not patch the app or inject browser storage.

Upstream: [Chizukuo/toeic-tracker](https://github.com/Chizukuo/toeic-tracker),
MIT, pinned at `ba5790b381d045618173a3415b4c3a3366947caf`.
[Source identity and scope](SOURCE.json). No upstream application source is bundled. The default-state fixture is derived
from its export; the upstream [MIT notice](LICENSE.upstream) is included.

## Start the pinned app

Use Node 22+, npm and a disposable directory. In one terminal:

```sh
git clone https://github.com/Chizukuo/toeic-tracker.git
cd toeic-tracker
git checkout ba5790b381d045618173a3415b4c3a3366947caf
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

This measured recipe uses the app's production static export. After the build, from this App Crash Lab
repository root, serve the generated `out` directory (replace the absolute path):

```sh
node tools/app-crash-lab/examples/toeic-tracker/serve-export.mjs /absolute/path/to/toeic-tracker/out 54571
```

The small included server only reads that export directory, supports the app's
extensionless routes and listens on loopback. The same pinned source's
development-server run stopped at setup with INCONCLUSIVE, so it is not the
verified route for this configuration. This does not establish a data-loss bug.

## Run the check

In this example directory (or copy `roundtrip.json` into a new working directory):

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.8.0/aichance-app-crash-lab-0.8.0.tgz app-crash-lab run roundtrip.json --out .crash-lab/toeic
```

Expected result on the pinned build: `PASS backup-roundtrip`, exit `0`. A
configuration/startup error is INCONCLUSIVE; retain it when correcting setup.
Do not edit the app or weaken the selected record comparisons to obtain a pass.

Open `.crash-lab/toeic/index.html`. To replay the generated test with Playwright
alone, install `@playwright/test@1.64.0` in a disposable working directory and run:

```sh
npx playwright test --config .crash-lab/toeic/playwright.config.mjs
```

## What this checks

- L1 Part 1–4 mistakes `1 / 0 / 2 / 0`, a known note and vocabulary phrase.
- One manual score dated `2026-10-15`: Listening `480`, Reading `450`, total `930`.
  Setup asserts the saved review, vocabulary and rendered score before export.
- All ten full `data` domains in the real export: sessions, activeSessionId, locale,
  examDate, historicalScores, sprintConfig, vocabularyEntries, targetScore,
  unlockedAchievements and achievementUnlocks. The 20 session objects include
  **one completed review**, not 20 completed practice sessions.
- Original file bytes, a fresh browser's default records, the exact preview
  heading and one `确认导入` click. Every selected saved domain must still match
  the fresh target before that click.
- A new exact success toast, complete saved records, vault history count/date
  and the same selected data after reload. The default exam date `2026-05-24`
  is separate from the manual score's date.

Each fresh UI run creates its own IDs/timestamps, so export hashes can differ
between runs. Comparisons use each run's actual unmodified bytes. Captured backup
values, filenames and preview text are omitted from reports; the explicit
synthetic contract values remain in the generated test.

This is an operator compatibility check, not evidence of author adoption. Sync,
automatic-backup history, real accounts, mobile browsers, timer precision and
process-crash durability are outside this test. See [the backup guide](../../BACKUP.md)
for failure classifications and supported DOM-commit boundaries.

## Measured on 2026-10-15

On the unchanged pinned production export, the final exact-toast configuration
passed in CLI0.8.0 and in its generated test using a fresh installation of only
`@playwright/test@1.64.0`. Each real JSON export was `8038` bytes. The source,
pre-commit empty state, restored full records and reloaded records all matched.
The generated run took 47.3 seconds on this local host. One commit was attempted and
completed in each run. These timings are observations, not a performance guarantee.
