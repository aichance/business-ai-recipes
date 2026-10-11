# MealAI: preserve a manual record across reload and rejection

This contract checks the manual-entry path in [MealAI](https://kam2525-hub.github.io/diet-meal-ai/),
introduced by its author in [this feedback invitation](https://note.com/cozy_briony8843/n/n28e65519fe57).
It saves a synthetic lunch on **2026-10-10**, reloads and selects that date again,
then separately attempts to replace the lunch with a zero-calorie record.
No photo, API key, AI request, real health data or nutrition advice is involved.

## Prepare a local copy

Use your own disposable copy of [the app source](https://github.com/kam2525-hub/diet-meal-ai).
This example supplies our test and preparation helper only; the app is not bundled
or relicensed. The helper verifies five source hashes from the public app retrieved
on 2026-10-11 and refuses changed input or an existing output directory.

The app loads Tailwind from a CDN. App Crash Lab blocks off-origin requests, so
testing it without a local CSS build changes which controls are visible. The helper
copies the three application JS files unchanged, replaces the CDN script reference
with local CSS, and moves the original Tailwind theme into the CLI configuration.
This is a **local dependency preparation**, not an unchanged public-site test.
The pinned CLI version below is our build choice, not a verified CDN version.

From this example directory, with Python 3, Node 22+ and npm:

```sh
python3 prepare-local.py /path/to/your/MealAI ./mealai-local
cd mealai-local
npx --yes --package=tailwindcss@3.4.17 tailwindcss -c tailwind.config.cjs -i tailwind-input.css -o css/tailwind-local.css --minify
python3 -m http.server 54198 --bind 127.0.0.1
```

Keep the server running. In a second terminal, from this example directory:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run mealai.json
```

Open the printed report path. Nothing is uploaded. Do not use real records or a
shared browser profile. For a different local port, append
`--base-url http://127.0.0.1:YOUR_PORT` to the run command. If a source hash differs,
review the new save flow and update the contract; do not bypass the mismatch.

## What is checked

- The complete date-specific stored object must first contain the known synthetic
  lunch (`450`, P `20`, F `12`, C `60`) with the other three slots empty.
- The saved card text and one **visible** matching meal name must survive reload.
  The date is selected through the app's UI both before saving and after reload;
  the test does not depend on the wall-clock date's storage key.
- The original empty-lunch entry must have **zero visible matches** after saving.
  Missing `.hidden` CSS therefore cannot produce the earlier misleading success.
- For rejection, open the still-empty **dinner** entry, select `lunch` in the modal
  and assert that selection, then submit zero calories. The exact native alert
  `カロリーを入力してください！` must occur and the complete saved object/card must remain equal.
  The normal UI's hidden lunch button is never used as an edit entry.

Our 2026-10-11 local run with the prepared CSS passed both CLI checks and both
exported Playwright tests (Node 22.16.0, Playwright 1.64.0 / Chromium on macOS).
An earlier run without Tailwind also returned PASS, but was **not accepted**:
it could click a control that is normally hidden. The visibility assertion and
normal-UI rejection path were added before the reported result above.

The [CSS precondition experiment](CSS-PRECONDITIONS.md) reproduces this difference
with a four-run comparison at one local URL. It includes the rejected
first contract as a counterexample and keeps the app JavaScript unchanged.

## Limits

This is our compatibility run, not the author's use or endorsement. The public
website, CDN rendering equivalence, mobile layout, photo recognition, calorie
estimates, day-boundary rollover, service-worker caching, quota failures and other
record paths are not validated. FontAwesome and remote fonts remain blocked by
the runner. The server may log missing manifest/icon requests; they are not
included because service workers and external dependencies are blocked in these
fresh test contexts. Source hashes and the unchanged JS files define this snapshot;
there is no pinned upstream release in this example.
