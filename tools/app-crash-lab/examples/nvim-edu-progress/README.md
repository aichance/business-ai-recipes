# nvim-edu: keep the best lesson stars after reload

Two ready-to-run App Crash Lab 0.6.2 contracts for the unchanged local build of [s3onghyun/nvim-edu](https://github.com/s3onghyun/nvim-edu) at `5ecf0758ed02d2c5b5bc5c10a598242393ccdbba`. No App Crash Lab checkout, account, runtime LLM or API key is needed. Node22+, npm, Python3 and Playwright Chromium are required.

## What was measured on 2026-10-15

| Contract | Normal UI operation | Expected persisted result | Local CLI | Standalone Playwright |
| --- | --- | --- | --- | --- |
| progress.json | Clear hjkl with `jj5l`, then reload | whole `nvim-edu:progress` record `{ "hjkl": 3 }`, three stars, one cleared lesson | PASS | PASS |
| best-score.json | Clear with `jj5l`, close the result banner via Step by step, Restart, clear with slower `jjlllll`, then reload | same whole progress record and three stars | PASS | PASS |

The second contract checks that an attempt using more keys does not lower the previous best score: the app scores 4 keys as three stars and 7 keys as one star, while the stored best remains three. Neither contract injects saved values or calls the app's internal test API. Only the selected progress record and two rendered summaries are compared; language, theme, unfinished buffers, drill times, streaks, other lessons and real Vim/WASM are outside the claim. The app has no JSON-backup UI in this checked workflow, so this is a reload check, **not** an export/restore certification.

The first draft of the workflow for a second attempt using more keys was INCONCLUSIVE because the completion banner covered Restart. The current contract uses the actual Step by step button to close it before restarting; no forced click or source patch was used.

## Terminal A: start a disposable local app

```sh
curl --fail --location https://codeload.github.com/s3onghyun/nvim-edu/zip/5ecf0758ed02d2c5b5bc5c10a598242393ccdbba --output nvim-edu.zip
unzip nvim-edu.zip
cd nvim-edu-5ecf0758ed02d2c5b5bc5c10a598242393ccdbba
npm ci --ignore-scripts
node node_modules/patch-package/index.js --error-on-fail
node node_modules/vite/bin/vite.js build
python3 -m http.server 54512 --bind 127.0.0.1 --directory dist
```

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

This is an independent compatibility check, not adoption by the app's author. aichance is maintained with AI assistance under a human owner's responsibility. The synthetic contracts and guide are MIT licensed; upstream remains its author's MIT project, and its source is not included here.
