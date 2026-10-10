# PIXIE: keep a draft intact when an import is rejected

**Observed on 2026-10-11: `PASS rejected-update`; the generated Playwright test also passed.**
This is our compatibility check against the unchanged [PIXIE Creator workspace](https://github.com/ibloud/pixie-creator-os/tree/eada1426b6db3b221debed6de82a2312c1cc9be4),
not a report of adoption by its author.

PIXIE explicitly requires downloading a draft before closing the tab. Reload
does not promise to restore it, so this contract selects **rejected-update only**.
It prepares a draft download, tries an unsupported draft format, and verifies
that **title, public link, caption, credits and accessibility text** remain intact.

## Run the check

Use a disposable local copy of PIXIE. For the exact version checked, download
and extract the author's [source ZIP](https://github.com/ibloud/pixie-creator-os/archive/eada1426b6db3b221debed6de82a2312c1cc9be4.zip).
From the extracted repository root, keep this command running (Python 3):

```sh
python3 -m http.server 49731 --bind 127.0.0.1
```

Our run served six unchanged files: `index.html`, `creator.css`,
`creator-model.js`, `streamplace.js`, `creator.js` and `manifest.webmanifest`.
No app install or build was needed. The author's source is not redistributed here.

Save [`pixie.json`](pixie.json) into a separate working folder using GitHub
**Raw → Save As**. With Node 22+ and npm, run there:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run pixie.json
```

For an existing local server, append `--base-url http://127.0.0.1:3000`, replacing
the port as needed. The contract expects the workspace at `/`. First-time
package and Chromium downloads require internet access and disk space.

The check starts in a fresh browser context, enters synthetic text, clicks
**Download draft**, and waits for its download-request message. It then imports:

```json
{"schema":"unsupported-pixie-draft"}
```

The exact rejection must be `Import rejected: Unsupported PIXIE draft. Current work retained.`
The five input values must still match the known-good values after returning to
Prepare. A missing rejection or a changed value fails the check.

## Keep a test for your next version

Open the absolute `index.html` report path printed by the CLI. Keep the local
server running, change into the directory containing that report, then run:

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

Our macOS arm64 / Node 22.16.0 / Playwright 1.64.0 run passed the one generated
test. It depends on Playwright, not the App Crash Lab CLI. Stop the local server
with Ctrl+C when done.

## Scope

The automated result covers one unsupported-schema import and five observed
input values over a 250 ms stability window. It does not verify the downloaded
JSON bytes, export/import round-trip, media, identity, publication history,
actual social posting, or every invalid-input class. The download-request
message is a readiness signal, not evidence that a file reached disk.

Separately, a manual Chromium check on the public workspace retained those same
five values after both malformed JSON and an unsupported schema. That manual
check is not additional automated coverage or independent use of App Crash Lab.
