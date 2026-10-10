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

## Also check the downloaded file and a fresh import

The original contract checks five exact input values. After the author's
[question about end-to-end integrity](https://bsky.app/profile/ibloud.xyz/post/3mxk57g3pa22z),
we added a **separate, handwritten Playwright test** for the portable JSON
boundary. This is not an additional check implemented by the 0.3.0 CLI.

Save these two files into the same empty working folder:

- [`roundtrip.spec.mjs`](pixie-roundtrip/roundtrip.spec.mjs)
- [`playwright.config.mjs`](pixie-roundtrip/playwright.config.mjs)

Keep the same disposable PIXIE server running on `127.0.0.1:49731`. From the
folder containing those two files, run:

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright install chromium
npx playwright test --config playwright.config.mjs
```

The test uses the UI to prepare synthetic text and one **synthetic,
user-reported publication-link record** pointing to `example.com`. It never
opens a sharing destination or posts anything. Requests to other origins are
blocked. It then:

1. Downloads the actual JSON and checks the prepared metadata and receipt.
2. Rejects one unsupported import, downloads again, and compares the complete
   parsed JSON to the first file.
3. Opens a fresh browser context, imports the first downloaded file, checks the
   five visible input values, rights choice, destination and recorded link, then
   downloads again and compares the complete parsed JSON.
4. Checks that import invalidates the previous review/handoff, as PIXIE intends.

**Observed: 1 passed** against the unchanged pinned source on macOS arm64,
Node 22.16.0 and Playwright 1.64.0. The three downloaded JSON objects matched
across all 12 top-level fields, including `pixie_id` and the one receipt.

We also tested a deliberately modified local control that changes only
`pixie_id` after import. The five visible input values still matched, but the
full JSON comparison failed on `pixie_id`. This control is our seeded defect,
not a bug found in the author's original app.

Outputs are under `.crash-lab/pixie-roundtrip/` in the current working folder:
`results.json`, three downloaded JSON files, screenshots and a Playwright trace.
Playwright replaces its output on another run; copy evidence first if needed.
The config accepts `PIXIE_BASE_URL` for another loopback URL and
`PIXIE_TEST_OUTPUT_DIR` for a separate output folder. Stop your local server
with Ctrl+C when finished.

This expands coverage to the **portable metadata file**. Media bytes are
deliberately excluded by PIXIE's draft format. Account identity/authentication,
actual destination publishing, browser/device coverage, concurrent edits,
every invalid input, and restoration of arbitrary histories remain untested.
The one receipt is synthetic; the test does not verify that its URL represents
a real publication. JSON objects are compared, not formatting/byte identity.

## Scope of the original five-field contract

The automated result covers one unsupported-schema import and five observed
input values over a 250 ms stability window. It does not verify the downloaded
JSON bytes, export/import round-trip, media, identity, publication history,
actual social posting, or every invalid-input class. The download-request
message is a readiness signal, not evidence that a file reached disk.

Separately, a manual Chromium check on the public workspace retained those same
five values after both malformed JSON and an unsupported schema. That manual
check is not additional automated coverage or independent use of App Crash Lab.
