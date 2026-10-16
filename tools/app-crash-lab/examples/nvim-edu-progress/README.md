# nvim-edu: keep the best lesson stars after reload

Two ready-to-run App Crash Lab 0.6.2 contracts for the unchanged local build of [s3onghyun/nvim-edu](https://github.com/s3onghyun/nvim-edu) at `5ecf0758ed02d2c5b5bc5c10a598242393ccdbba`. No App Crash Lab checkout, account, runtime LLM or API key is needed. Node22+, npm, Python3 and Playwright Chromium are required.

## What was measured on 2026-10-15

| Contract | Normal UI operation | Expected persisted result | Local CLI | Standalone Playwright |
| --- | --- | --- | --- | --- |
| progress.json | Clear hjkl with `jj5l`, then reload | whole `nvim-edu:progress` record `{ "hjkl": 3 }`, three stars, one cleared lesson | PASS | PASS |
| best-score.json | Clear with `jj5l`, close the result banner via Step by step, Restart, clear with slower `jjlllll`, then reload | same whole progress record and three stars | PASS | PASS |

The second contract waits for the result banner after **both** clears before checking that an attempt using more keys does not lower the previous best score: the app scores 4 keys as three stars and 7 keys as one star, while the stored best remains three. Neither contract injects saved values or calls the app's internal test API. Only the selected progress record and two rendered summaries are compared; language, theme, unfinished buffers, drill times, streaks, other lessons and real Vim/WASM are outside the claim. The app has no JSON-backup UI in this checked workflow, so this is a reload check, **not** an export/restore certification.

The first draft of the workflow for a second attempt using more keys was INCONCLUSIVE because the completion banner covered Restart. The current contract uses the actual Step by step button to close it before restarting; no forced click or source patch was used.

## Independent author report and follow-through

On 2026-10-15, [nvim-edu's author reported running these two contracts on their own app](https://qiita.com/s3onghyun/items/7966ac7e6a534a84f9db#comment-2d25dc275d61b168ee4a). With the official Playwright 1.64.0 Noble image, Node24.21, Python3.12 and App Crash Lab0.6.2, both CLI checks and both exported standalone tests passed. They reported the same saved record and UI shown above. This is one author's public execution report, not our Docker run or a guarantee for every environment; raw logs were not provided.

The author also caught two gaps. Their image lacked `unzip`, so Terminal A now uses Python3's ZIP extractor. The original `best-score.json` did not explicitly confirm completion of the slower second attempt. The revised contract adds `expectVisible #next` after the last input. That prevents a preserved old score from being treated as evidence that the new attempt finished. The author's report applies to the earlier contract; execution of this revision by the author is unconfirmed.

### Maintainer recheck on 2026-10-16

The revised contracts were checked on the same unchanged pinned source, on macOS with Node22.16.0, Playwright1.64.0 and the published App Crash Lab0.6.2 package:

| Run | Result |
| --- | --- |
| Normal progress / revised best-score CLI checks | PASS / PASS |
| Their unchanged generated standalone specs | 1 passed each |
| Diagnostic: omit one second-attempt motion, original contract | PASS despite the unfinished attempt |
| Same incomplete attempt, revised completion guard | INCONCLUSIVE at the hidden result banner |

The omitted-motion case is a deliberately incomplete test workflow, not an app defect. The new guard refuses that misleading PASS. Python3's standard ZIP extraction was also run and all37 archived source files matched.

## Terminal A: start a disposable local app

```sh
curl --fail --location https://codeload.github.com/s3onghyun/nvim-edu/zip/5ecf0758ed02d2c5b5bc5c10a598242393ccdbba --output nvim-edu.zip
python3 -m zipfile -e nvim-edu.zip .
cd nvim-edu-5ecf0758ed02d2c5b5bc5c10a598242393ccdbba
npm ci --ignore-scripts
node node_modules/patch-package/index.js --error-on-fail
node node_modules/vite/bin/vite.js build
python3 -m http.server 54512 --bind 127.0.0.1 --directory dist
```

Python3's standard-library ZIP extractor works without `unzip`; `unzip nvim-edu.zip` is an alternative if installed.

The app's existing dependency patch is applied as its README's normal installation would do. No upstream source is changed. The runner blocks requests outside the configured local origin, including fonts and optional analytics. Do not point this at an existing browser profile or production account.

## Terminal B: run the checks

In a new folder:

```sh
curl --fail --location https://raw.githubusercontent.com/aichance/business-ai-recipes/main/tools/app-crash-lab/examples/nvim-edu-progress/progress.json --output progress.json
curl --fail --location https://raw.githubusercontent.com/aichance/business-ai-recipes/main/tools/app-crash-lab/examples/nvim-edu-progress/best-score.json --output best-score.json
npm exec --yes --package=@playwright/test@1.64.0 -- playwright install chromium
npm exec --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.6.2/aichance-app-crash-lab-0.6.2.tgz -- app-crash-lab run progress.json --out first-run
npm exec --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.6.2/aichance-app-crash-lab-0.6.2.tgz -- app-crash-lab run best-score.json --out best-score-run
```

Expected: `PASS reload`, exit0 for each. Existing output directories are refused: choose a new `--out` name on each run. If the app runs on another port, use `--base-url http://127.0.0.1:PORT` on both commands.

Open `first-run/index.html` or `best-score-run/index.html` for the state comparison. Each folder also contains a self-contained `repro.spec.mjs`, requiring Playwright but not App Crash Lab:

```sh
npm init -y
npm install --save-dev @playwright/test@1.64.0
npx playwright test --config first-run/playwright.config.mjs
npx playwright test --config best-score-run/playwright.config.mjs
```

Each run uses a fresh temporary browser context. Closing a level's result screen is part of setup; after reload the checks only wait for the editor to appear. They do not redo the lesson to repair progress.

aichance is maintained with AI assistance under a human owner's responsibility. The synthetic contracts and guide are MIT licensed; upstream remains its author's MIT project, and its source is not included here.
