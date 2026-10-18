# Preserve a complete review thread through reload and rejected imports

This small EdenText check creates a **bold Unicode paragraph, a comment and a reply through the real UI**, then compares the **entire saved document**. A deliberately added second reply is detected even while the original paragraph, comment and first reply remain unchanged.

Measured on an unchanged local production build of **EdenText 0.10.1**, source [`375aa2e9`](https://github.com/stffnb/edentext/tree/375aa2e9b2202ae44db3bb0076c33b454322c0d9). These are operator measurements using synthetic data, not an author run or a bug report.

| Case | CLI result | Unchanged generated Playwright test |
| --- | --- | --- |
| `reload.json` | PASS | PASS |
| `reject-odt.json` | PASS: one exact rejection alert; complete document retained | PASS |
| `reject-docx.json` | PASS: one exact rejection alert; complete document retained | PASS |
| `control-extra-reply.json` | FAIL: deliberate extra reply detected in the full saved document | FAIL for the same reason |

The control intentionally performs an ordinary UI edit **after** the malformed file is rejected. It verifies that the selected full-document comparison can detect the extra reply. **It is not an EdenText defect or an import-induced change.** Its command should exit 1; the other three should exit 0. See [measured results](results-summary.json).

## Try the prepared checks

[Download the kit](https://aichance.github.io/business-ai-recipes/app-crash-lab-edentext-trial-v0.1.0.zip) · [SHA256](https://aichance.github.io/business-ai-recipes/app-crash-lab-edentext-trial-v0.1.0.zip.sha256)

Extract into a new folder. The kit contains four original contracts, this guide, results and the MIT license. It includes no EdenText source, upstream default document, real document, account or provider settings. EdenText is separately licensed under AGPL-3.0-only; follow [its repository](https://github.com/stffnb/edentext) for its license and notices.

Use a **separate disposable checkout** and synthetic data only. The measured environment was Node **22.16.0**, npm **11.21.1**, Playwright **1.64.0**, Chromium **156.0.8078.4**, on macOS:

```sh
git clone https://github.com/stffnb/edentext.git edentext-local
git -C edentext-local checkout --detach 375aa2e9b2202ae44db3bb0076c33b454322c0d9
cd edentext-local
npm ci --ignore-scripts --no-audit --no-fund
npm run build
python3 -m http.server 54193 --bind 127.0.0.1 --directory dist
```

Keep the production server running. In another terminal, from the extracted kit:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.12.0-dev.2/app-crash-lab-0.12.0-dev.2.tgz app-crash-lab run reload.json
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.12.0-dev.2/app-crash-lab-0.12.0-dev.2.tgz app-crash-lab run reject-odt.json
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.12.0-dev.2/app-crash-lab-0.12.0-dev.2.tgz app-crash-lab run reject-docx.json
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.12.0-dev.2/app-crash-lab-0.12.0-dev.2.tgz app-crash-lab run control-extra-reply.json
```

The tested runner is **0.12.0-dev.2**. Append `--base-url` with your actual loopback origin if another port is used. No runtime LLM or API key is needed. Each run writes an HTML/JSON report and ordinary `repro.spec.mjs` / `playwright.config.mjs` files, replayable with Playwright 1.64.0 using the [runner instructions](../../README.md). The failing control stays an ordinary failing assertion; it is neither skipped nor converted into an expected-pass test.

## What is compared

The default first document is selected by an empty `sessionStorage.edentext-tab-doc`. The contract waits for that scope, editor boot completion, the saved synthetic body, bold mark, comment and final reply. These known values are read in the same Web Storage sample as the **complete `localStorage.edentext-doc` JSON**, so a visible reply alone does not establish autosave completion.

The complete document remains selected for all comparisons, including every generated comment ID and comment/reply date. No field is removed or normalized. The whole stored document name is also compared. The separate custom-style key is observed as null; no custom style is created. Rendered bold text, comment and reply supplement the saved-record check. The heartbeat/presence key is outside document content and is not selected.

The rejection inputs are literal UTF-8 text with `.odt` / `.docx` filenames, **not valid ZIP-format documents**. Each must produce exactly one native alert with the measured archive-error message. No replacement confirmation is granted, and the saved document must remain equal through the bounded comparison window. The deliberate edit control uses a 2.5-second stability window to include the app's debounced save.

## Boundaries and a setup correction

This checks **browser autosave**, not ODT/DOCX binary export/import equivalence, native file-picker behavior, desktop AppImage, rich layout, images, named styles, headers/footers, track changes or every setting. The `.odt • Not saved` label concerns an external file; it does not mean the browser autosave is missing. No AI provider was configured or invoked. All 781 tracked app source blobs and modes matched the pin and were unchanged after our build. Our loopback server also applied a same-origin CSP; the runner restricts browser requests to its configured loopback origin and blocks service workers.

An initial custom diagnostic dismissed the app's `beforeunload` warning and cancelled reload. We retained that timeout separately. Playwright 1.64.0's default handling accepts `beforeunload`; the ordinary CLI and its unmodified generated reload test pass. A separate diagnostic explicitly accepted one warning and also preserved the complete document. No app or runner patch was used to obtain the passing result.

After an app update, rerun the three preservation checks and the deliberate edit control unchanged. A report that includes the exact app revision and runner version can establish whether the same saved review thread still survives on that revision.
