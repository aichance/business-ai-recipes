# FloorPlanner: keep the PC and its packing check

**Requires App Crash Lab 0.4 or later. Versions before 0.4 do not support
`confirm`.**

The [eSports Event FloorPlanner](https://github.com/kijitora-no-hito/eSportsEvent_FloorPlanner)
imports a venue layout only after asking whether to replace the current one.
These contracts accept that exact confirmation for one synthetic invalid file,
then require the real parse/schema error and preservation of the saved layout.
Cancelling the import does not count as testing its rejection.

## Run the three checks

1. Download and extract the author's [pinned source ZIP](https://github.com/kijitora-no-hito/eSportsEvent_FloorPlanner/archive/a38163dc653085d325ff67d55132ec17a3dd0dca.zip).
   From the extracted app directory, start its unchanged HTML/JS with Python 3:

```sh
python3 -m http.server 54421 --bind 127.0.0.1
```

2. In another terminal, extract the [0.4.0 tool ZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.4.0/app-crash-lab-0.4.0.zip)
   and enter its `app-crash-lab-0.4.0` folder. A repository checkout also works:
   enter `tools/app-crash-lab`. With Node22+ and npm, run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node cli.mjs run examples/floorplanner-malformed.json
node cli.mjs run examples/floorplanner-schema.json
```

The first command checks **reload and malformed JSON**; the second checks
**wrong top-level schema**. Each prints an absolute HTML report path and saves
an independent `repro.spec.mjs` with its Playwright config. Open the reports;
the measured pinned-source result was three PASS verdicts. To rerun the
generated tests, install Playwright1.64.0 in a parent folder of the generated
files and run `npx playwright test --config /path/to/playwright.config.mjs` for
each report. Stop the app server with Ctrl+C afterwards.

## What was checked

The fresh browser imports one synthetic PC with its packing checkbox ticked.
The contract waits for the expected saved data, then compares settings, rooms,
templates, complete item records, cables, checklist and title. It also checks
the visible PC count and checked input. The save timestamp is intentionally
excluded; rooms, cables and custom templates are empty in this fixture.

| Check | Required observation | Local result |
|---|---|---|
| Reload | Saved fields and PC checkbox return | PASS |
| Import `{` | Exact replacement confirm, then `JSONの解析に失敗しました`; saved fields unchanged | PASS |
| Import `{}` | Exact replacement confirm, then `レイアウトファイルの形式が不正です`; saved fields unchanged | PASS |

The CLI and all three exported Playwright cases passed against unchanged
source `a38163dc653085d325ff67d55132ec17a3dd0dca`, on macOS arm64,
Node22.16.0 / Playwright1.64.0 / Chromium, 2026-10-11. A separate standalone
test also checked reload after both import errors. The CLI rejection check
itself compares the current saved state, not a second reload after rejection.

These are our AI-assisted local compatibility checks, not an author report,
endorsement or new defect. Public-site manual testing confirmed PC/check
retention after reload; an invalid-file browser automation attempt stalled,
so its outcome is unknown. The table's import results come from local tests.

The contract observes a bounded 750ms final stability window. It does not
cover closing before the app's 500ms autosave, wiring correctness, precise
rendered positions, nested invalid data, storage exhaustion, multiple tabs,
mobile or OS restart. The exact native message is accepted only inside the
single-import window; a coincident identical dialog from another timer cannot
be causally distinguished. See [confirmation scope](../CONTRACT.md#confirmation-before-invalid-input-requires-04-or-later).

Use a disposable local app and synthetic records. App Crash Lab really accepts
the declared replacement confirmation. The app source is obtained from its
author and is not bundled here; these contract files are MIT licensed.
