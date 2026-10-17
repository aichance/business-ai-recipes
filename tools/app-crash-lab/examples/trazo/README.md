# Trazo: preserve animated slide notes through a real backup

This synthetic two-slide check keeps the complete selected element records,
including IDs, frame membership, customData and cloned elements' animKey links.
It exercises captions, narration scripts, holds of 700/1900 ms and a Build
transition. The backup check requires **App Crash Lab 0.11+** for sourceReady.

## Tested target

[Trazo](https://github.com/balalex12/trazo), MIT, based on Excalidraw. Pinned source:
`bc44713a52b0201e26b26e8289ca80405cf1922c`. All 1692 original files were checked
unchanged. Use a disposable checkout and synthetic data. The test uses the local
web dev app; it does not require the optional icon library, notebooks, maps,
desktop app, microphone or AI provider setup. This is a targeted development
setup, not a validation of the full packaged Trazo product.

On the pinned checkout, using Node 22+ and Yarn 1.22.22:

```sh
yarn install --frozen-lockfile --ignore-scripts --non-interactive
cd excalidraw-app
BROWSER=none HUSKY=0 VITE_APP_TRACKING=false VITE_APP_DISABLE_SENTRY=true VITE_APP_ENABLE_ESLINT=false VITE_APP_COLLAPSE_OVERLAY=true node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3000 --strictPort
```

See Trazo's [official installation guide](https://github.com/balalex12/trazo/blob/bc44713a52b0201e26b26e8289ca80405cf1922c/docs/INSTALL.md)
for the complete product setup. Our run installed no global runtime and skipped
lifecycle scripts and optional asset builds. Start the app in one terminal;
from this App Crash Lab package, run in another:

```sh
npx playwright install chromium
node cli.mjs run examples/trazo/roundtrip.json --out .crash-lab/trazo-backup
node cli.mjs run examples/trazo/reload.json --out .crash-lab/trazo-reload
```

The contracts embed the synthetic scene, so no fixture path needs editing.
For a different local port, add `--base-url http://127.0.0.1:YOUR_PORT`.
The measured run used 62486. The default shipped contract uses 3000.

## What was actually exercised

Normal Animation UI imports one synthetic frame/shape, duplicates the slide,
and edits both captions/scripts/holds plus the second transition. The backup
contract compares the entire saved `excalidraw` element array and two frame
labels. Its nine sourceReady projections establish the intended persisted
metadata from that same complete baseline. Those projections do not replace
the full records, normalize dynamic IDs or add a fixed sleep.

The app's real Save drawing with narration action produced a 3586-byte JSON
file. The CLI passed export/full-state comparison, preservation after export,
original-file upload into a new empty browser context, restoration and a second
reload. Its **unchanged generated ordinary Playwright test also passed**. Each
run generates different IDs/nonces, so hashes can differ between independent
runs; within a run the exact downloaded bytes are imported unchanged. Read
MEASUREMENTS.json for the candidate version, dates and excluded scope.

The earlier 0.10.0 backup draft was INCONCLUSIVE before export/restore: UI frame
counts matched before autosave finished. The 0.11 precondition waits for the
known saved fields, then retains the full existing stability and comparison
gates. Neither result is a Trazo defect report. The earlier 0.10.0 reload check
already passed and remains valid.

The generated repro.spec.mjs uses ordinary Playwright without an App Crash Lab
import. Reports for backup mode are metadata-only; the generated contract still
contains your declared fixture and expected values, so use synthetic inputs.
These are aichance operator tests, **not independent creator adoption**. Audio,
global animation settings, video and optional integrations were not checked.
