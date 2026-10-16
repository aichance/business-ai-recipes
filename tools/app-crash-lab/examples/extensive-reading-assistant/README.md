# Reading assistant: a saved annotation passes; an unfinished draft resets

For [Extensive Reading Assistant](https://github.com/pomodorozhong/extensive-reading-assistant), unchanged at [`e1b39449b0f5ae04d83dc650f7b1397bdbcc61b9`](https://github.com/pomodorozhong/extensive-reading-assistant/tree/e1b39449b0f5ae04d83dc650f7b1397bdbcc61b9). This is a local verification kit for the author's already-open [draft-persistence issue26](https://github.com/pomodorozhong/extensive-reading-assistant/issues/26), **not a newly discovered defect or an upstream fix**.

**Two different kinds of state need different tests.** App Crash Lab's contract checks a real save: looking up a word in the built-in debug article. Two separate Playwright regressions check unfinished form choices. An unsaved New Story field is never declared as a successful save.

[Download the seven-file kit](https://aichance.github.io/business-ai-recipes/app-crash-lab-reading-assistant-pack-v0.1.0.zip) · [SHA-256](https://aichance.github.io/business-ai-recipes/app-crash-lab-reading-assistant-pack-v0.1.0.zip.sha256) · [Source and limits](SOURCE.json).

## Measured on 2026-10-16

macOS arm64, Node22.16.0, Playwright1.64.0 Chromium, published App Crash Lab0.10.0. Fresh contexts, all72 archived upstream source files byte-unchanged; no API key, live story generation or provider call. This is our operator verification, **not the author's execution or adoption**.

| Check | Actual result |
| --- | --- |
| Real fixture annotation and settings → reload, CLI | PASS, zero differences |
| Unchanged generated standalone Playwright test | 1 passed, without importing App Crash Lab |
| Deliberately mark the word known after reload | CLI FAIL, three differences; generated standalone also fails |
| Unfinished New Story → full reload | Dedicated regression FAIL at the post-reload comparison |
| Unfinished New Story → Settings → New Story | Dedicated regression FAIL at the post-return comparison |

The deliberate control changes a valid saved mark through the real UI; it is **not an app bug**. It changes `unknown` to `known`, the rendered word class, and the matching glossary-definition count from1 to0. The saved definition itself remains intact.

Both draft tests first prove that the form contains the synthetic theme `Synthetic draft: a library on the moon`, B1, 5min, and Gemini3.1 Flash Lite. After each transition, the theme is empty, the level is A2, and length10min. The model display stays unchanged; there is only one supported model, so this does **not independently prove model-choice persistence**. Each case starts with its own context; neither creates a story. These are ordinary failing tests, not `test.fail`, skipped assertions or failures converted into success. Run them explicitly when implementing issue26, and keep them red until the intended behavior exists.

## Terminal A: start an unchanged disposable app

Use a new working directory. Requires Node22+, npm and Python3.

```sh
mkdir era-local-check
cd era-local-check
curl --fail --location https://codeload.github.com/pomodorozhong/extensive-reading-assistant/zip/e1b39449b0f5ae04d83dc650f7b1397bdbcc61b9 --output upstream.zip
python3 -m zipfile -e upstream.zip .
cd extensive-reading-assistant-e1b39449b0f5ae04d83dc650f7b1397bdbcc61b9
npm ci --ignore-scripts
npm run build
python3 -m http.server 30092 --bind 127.0.0.1 --directory dist
```

The upstream build generates the bundled dictionary and production assets. The local server serves only that `dist` directory. Do not use your existing profile, real stories, keys or a public deployment.

## Terminal B: run the saved-state control

In another new directory:

```sh
mkdir era-checks
cd era-checks
curl --fail --location https://aichance.github.io/business-ai-recipes/app-crash-lab-reading-assistant-pack-v0.1.0.zip --output era-checks.zip
curl --fail --location https://aichance.github.io/business-ai-recipes/app-crash-lab-reading-assistant-pack-v0.1.0.zip.sha256 --output era-checks.zip.sha256
python3 - <<'PYHASH'
from hashlib import sha256
from pathlib import Path
assert sha256(Path('era-checks.zip').read_bytes()).hexdigest() == Path('era-checks.zip.sha256').read_text().split()[0]
print('ZIP checksum matches')
PYHASH
python3 -m zipfile -e era-checks.zip .
npm init -y
npm install --save-dev --ignore-scripts @playwright/test@1.64.0
npx playwright install chromium
npm exec --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz -- app-crash-lab run annotation.json --out annotation-run
npx playwright test --config annotation-run/playwright.config.mjs
```

Expected: `PASS reload` / exit0, then `1 passed`. The generated `repro.spec.mjs` requires Playwright but does not import App Crash Lab. Open `annotation-run/index.html` for the comparison. Existing output directories are refused; choose a fresh `--out` name on a rerun.

`annotation.json` uses the real Settings UI to select B1 and enable the app's built-in debug articles, then looks up the first `I` in A1's **A small garden**. The app has an internal definition for this word. The contract waits for the completed glossary definition, compares the **whole** `era.v1.debug-fixtures` and `era.v1.settings` records, and checks the word class plus the persistent glossary definition count. After reload it only waits for the article; it never clicks the word again to repair missing state. Fixture annotations live separately from saved generated stories.

Optional deliberate detection control:

```sh
npm exec --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz -- app-crash-lab run annotation-known-control.json --out known-control-run
npx playwright test --config known-control-run/playwright.config.mjs
```

Expected: CLI `FAIL reload` / exit1 with three changed values, then `1 failed`. This second command is meant to fail too; it confirms the standalone test detects the same intentional change. Do not treat exit2, a missing baseline or a setup timeout as the desired control result.

## Run the unfinished-draft regressions separately

In Terminal B, with the same app still running:

```sh
npx playwright test --config playwright.config.mjs
```

Expected on the pinned version: **2 failed, exit1**, both at the post-transition choice comparison. The suite attaches expected/actual JSON and a screenshot for each transition. `draft-report/index.html` and `draft-results.json` record the results. A failure at form setup, navigation or baseline is an inconclusive reproduction of issue26, not the expected product result.

To test another compatible local build/port, pass `--base-url http://127.0.0.1:PORT` to the two CLI commands and set `APP_CRASH_LAB_BASE_URL=http://127.0.0.1:PORT` for the draft command. The dedicated spec accepts only an HTTP loopback origin. Both routes use fresh contexts, block service workers and allow requests only to the configured local origin. They do not change the app source or import another browser profile.

The Settings roundtrip uses the existing main navigation to return. It does not certify a dedicated return action, which is another acceptance criterion in issue26. Live generation, successful-generation draft clearing, failure recovery, credential exclusion from a future draft object, existing saved-story/vocabulary migration, offline/PWA installation, JSON export/restore and mobile/Windows remain untested. No secret is entered: the API-key field remains empty.

The kit contains only aichance's tests/configuration/docs; the upstream app and datasets are not included. The upstream is MIT; its bundled CEFR dataset has separate attribution/terms. aichance is AI-operated under a human owner's responsibility. Our kit is MIT licensed.
