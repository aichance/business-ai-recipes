# Creator Frame Studio: reject a bad project without damaging the editor

**Observed on 2026-10-11: `PASS rejected-update`; the exported Playwright test also passed.**
This is our compatibility run against the unchanged [Creator Frame Studio](https://github.com/alptugharun/ai-social-media-toolkit/tree/563e8c78badbd6fa26fd620bccf7af56f4da2b07/tools/creator-frame-studio)
at commit `563e8c78badbd6fa26fd620bccf7af56f4da2b07`, not a report of the author's adoption.

The editor saves to a local `.frame.json` file. Reload alone is not intended to
restore the project. This contract selects **rejected-update only**: after
preparing a project file, opening a wrong-schema file must show the specific
error and leave 11 selected editor observations unchanged.

## Run on your local copy

Start your disposable development copy of Creator Frame Studio. For the exact
source we checked, download and extract the author's [fixed source ZIP](https://github.com/alptugharun/ai-social-media-toolkit/archive/563e8c78badbd6fa26fd620bccf7af56f4da2b07.zip).
From the extracted repository root, keep this running in a terminal (Python 3):

```sh
python3 -m http.server 49684 --bind 127.0.0.1 --directory tools/creator-frame-studio
```

Our run served the four unchanged app files (`index.html`, `app.js`,
`styles.css`, `favicon.svg`) from that commit. No app install or build was
needed. The author's source and sample images are not redistributed here;
this repository contains our independent test configuration.

Save [`creator-frame.json`](creator-frame.json) in a separate working folder
(use GitHub **Raw → Save As**). With Node 22+ and npm, run there:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run creator-frame.json
```

For an existing server on another port, append
`--base-url http://127.0.0.1:3000` to the second command, replacing the port as
needed. Serve the editor at `/`, or update `path` in the JSON to its route.
First-time dependency and Chromium downloads need internet access and disk space.

The check starts in a fresh browser context, chooses English and the Story
canvas, edits the included sample's first text layer to `REOPEN TEST 2026`,
and clicks Save project. It waits for the file-prepared message, then opens
this synthetic invalid file:

```json
{"schema":"not-creator-frame-studio","schemaVersion":2}
```

The error must change to `This is not a supported Frame Studio project.`
The contract compares text, width, height, text X/Y, font size/weight/color,
canvas-size label, page count and layer labels. In our run all 11 matched:
1080 × 1920, 3 pages, and the edited text remained intact. It uses the stable
`#projectSave` selector because the button label is hidden in the compact layout.

## Keep the exported test

Open the absolute `index.html` report path printed by the CLI. Keep the editor
server running. Change into the directory containing that report, then run:

```sh
npm install --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

Our macOS arm64 / Node 22.16.0 / Playwright 1.64.0 run passed this one standalone
test too. It depends on Playwright, not App Crash Lab. Stop the local server
with Ctrl+C when finished.

## Boundaries

The automated result covers one wrong-schema rejection and 11 selected DOM
observations over a 250 ms stability window. It does not inspect downloaded
file bytes, reload/reopen, images, canvas pixels, all internal state, or every
invalid-input class. Some values are deliberately clamped by the editor;
those are not rejection cases in this contract.

Separately, we exercised the public UI's save → reload → reopen flow using the
actual downloaded sample project: edited text and the 1080 × 1920 dimensions
returned. A manual wrong-schema import left 26 form-control readings unchanged.
Those are operator observations, not extra automated coverage or independent
use of App Crash Lab. The automated check uses only the 11 values listed above.
