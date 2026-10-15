# Bami Fitness: an actual backup restored into an empty browser

A passing regression check for [anhdang1112/bamifitlog](https://github.com/anhdang1112/bamifitlog) at [`542945b`](https://github.com/anhdang1112/bamifitlog/commit/542945b50dceabc91fd4c1df81b3cf1c648d32d3) (app 2.5.0). We ran it with App Crash Lab 0.7.0 against unchanged local source and synthetic data. This is our compatibility test, not a bug report or evidence that the author uses App Crash Lab. Upstream source is not bundled.

The actual 2,541-byte JSON download restored successfully into a separate empty context. The runner accepted the exact native replacement confirmation once, observed the new `Backup restored` signal, then compared the whole saved `fitlog.v1` database immediately and after reload. CLI: **PASS**, 19,384ms. Separately generated Playwright: **PASS**, 26,632ms. Times describe these runs, not a performance guarantee.

## What was checked

- All four saved domains: settings, routines, sessions and custom exercises. Entire nested records and their IDs/references are compared, not just a count or success message.
- Seven non-default profile/settings values, including 63.5kg, a weekly goal of 3 and a 120-second rest timer.
- One routine and one completed session on 2026-10-14 at 19:30, with two exercises and three sets each. Weights/reps: landmine press 22.5×10, 25×8, 25×8; squat 80×8, 85×6, 85×6. Duration75min, heart-rate values and notes are included.
- One UI-created custom exercise and the rendered routine button with its exact name.

The normal-UI source control separately asserted these values and checked that the complete parsed download equalled the saved database. No app files, payload bytes or storage values were patched/injected.

## Run the pinned app

Requires Python3, Node22+, npm and Playwright Chromium. Use a disposable checkout and leave this source-only server running in a separate terminal:

```sh
git clone --filter=blob:none --no-checkout https://github.com/anhdang1112/bamifitlog.git bamifitlog-disposable
git -C bamifitlog-disposable checkout --detach 542945b50dceabc91fd4c1df81b3cf1c648d32d3
python3 -m http.server 54561 --bind 127.0.0.1 --directory bamifitlog-disposable
```

In another terminal, create a new check folder. Do not reuse a report directory:

```sh
mkdir bamifitlog-roundtrip
cd bamifitlog-roundtrip
curl -fL https://raw.githubusercontent.com/aichance/business-ai-recipes/main/tools/app-crash-lab/examples/bamifitlog/roundtrip.json -o roundtrip.json
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.7.0/aichance-app-crash-lab-0.7.0.tgz app-crash-lab run roundtrip.json --out report
```

Expected: `PASS backup-roundtrip`, exit0, and metadata-only `report/index.html` / `report/report.json`. A different app revision or unavailable setup may produce INCONCLUSIVE instead; inspect the phase before blaming a restore.

Run the generated test independently while the same server is running:

```sh
mkdir replay
cp report/repro.spec.mjs report/playwright.config.mjs replay/
cd replay
npm install --ignore-scripts --no-save --no-package-lock --no-audit --no-fund @playwright/test@1.64.0
npx playwright test repro.spec.mjs --config playwright.config.mjs --workers=1
```

Install the dependency in this disposable replay folder. A separate `npx --package` launcher alone does not guarantee that the generated ESM spec can resolve it. Stop only the source server you started when finished.

## Configuration details and limits

Settings commit on `change`, so each numeric settings input is followed by a normal Tab keypress and a known-value assertion. Filling without committing had produced our own setup error. A brand-new app has no saved storage entry: the contract observes the whole database, maps its export path to `[]`, and declares a fresh `null`, rather than trying to traverse missing JSON subpaths. No saved domain was dropped to obtain a pass.

Earlier attempts stopped during setup/export/fresh-state observation because our configuration was incomplete. Those results were INCONCLUSIVE, not app defects. The final contract includes the actual Settings navigation before Export, exact-name rendered presence, unchanged byte upload and full database comparisons. IDs are generated afresh on each independent run, so the CLI and generated-test SHA256 values differ even when both pass.

Browser-local JSON on this pinned revision only. The runner blocks service workers; offline caching/update lifecycle, broken-file rejection, multi-device sync and OS power loss were not tested. Complete selected saved data is checked within each run. Captured records and native dialog text are omitted from backup reports; synthetic inputs intentionally remain in the contract/generated spec. See [SOURCE.json](SOURCE.json) for the measured hashes, environment and scope.

Built and tested with AI assistance. If you try this on your own development copy, a tool/app version and PASS/FAIL/INCONCLUSIVE result (or the first blocked step) is enough feedback; no real workout data or raw private logs are needed.
