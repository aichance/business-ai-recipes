# Keep a real music-practice record through export, fresh import and reload

This authored test set checks the unchanged personal
[Teoria musicale app](https://github.com/mkparente/teoria-musicale) at commit
`b406da8bb820a77f7c8bbc8954a1dffc8acaea48`. The app source is **not included**.
It is a local compatibility check, not a report of an upstream defect or proof
that the author has used App Crash Lab.

## What is saved

The normal UI selects English note names, manual advance, a 10-minute session
and program start `2026-10-01`. It narrows the scale quiz to the C-major key
signature, answers **1♯** once (a real wrong answer), then opens Settings.
The whole values of these four localStorage keys are compared:

- `tm.srs`: the complete object, including the exercise ID, box, due, seen,
  correct, totalMs, last and any additional saved fields.
- `tm.settings`: all note-naming, advance and session-duration preferences.
- `tm.cfg.scale`: the complete exercise configuration.
- `tm.program`: the complete program state, including its nondefault start date.

The readiness projections assert that this answer was actually recorded.
They do not replace the whole SRS object with a count. No ID, time or timing
field is normalized. Guided-session plans, daily logs, offline PWA updates,
other exercises and malformed imports are outside this case.

## Start a disposable app

Use Node22+. In a **new disposable directory**, obtain the pinned source:

```sh
git clone --no-checkout https://github.com/mkparente/teoria-musicale.git
cd teoria-musicale
git checkout b406da8bb820a77f7c8bbc8954a1dffc8acaea48
npm ci --ignore-scripts --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 59812 --strictPort
```

Keep that server running. Do not point these tests at the hosted app, a signed-in
profile or valuable records. Each check uses new isolated browser contexts.

## Run the checks

In the extracted App Crash Lab package, install its dependencies once with
`npm install --ignore-scripts --no-audit --no-fund` and install Chromium with
`npx playwright install chromium`. A source checkout with its lockfile uses
`npm ci --ignore-scripts --no-audit --no-fund` instead.

```sh
node cli.mjs run examples/teoria-musicale/reload.json
node cli.mjs run examples/teoria-musicale/roundtrip.json
```

The reload contract works with stable0.11.0. **The roundtrip contract requires
prerelease0.12.0-dev.1** because this app finishes import with the native alert
`Progressi ripristinati.` Stable0.11.0 rejects that new field before execution;
that is a tool-support boundary, not an app failure.

The backup check clicks **Salva backup**, verifies all four complete values in
the actual JSON download, uploads its original bytes to the app's real file
input in an empty context, dismisses the one declared alert, then compares
restoration and reload. A success alert alone cannot pass. It does not combine
with native confirm or DOM preview/commit in this prerelease.

Each run writes its exact contract, `report.json`, HTML and unchanged standalone
`repro.spec.mjs`. Run that spec with its included `playwright.config.mjs` from a
folder where `@playwright/test` is installed. The backup report keeps comparison
metadata rather than captured records, screenshots or traces. Declared inputs
remain in the contract/spec. Review artifacts before sharing them.

## Actual local result

On macOS with Node22.16.0 and Playwright1.64.0, stable0.11.0 reload passed. The
0.12.0-dev.1 source candidate's real backup check and its unchanged generated
standalone test passed. The download was400 bytes; export, source preservation,
full restoration and reload all matched. [MEASUREMENTS.json](MEASUREMENTS.json)
preserves the tested conditions and initial locator correction. The versioned
package's public download and fresh installation are separate release checks.

This is a passing control for one real workflow. Deliberate test fixtures in
the tool's test suite separately prove that hidden-field, identity, timestamp
and reload losses still fail even when an alert is shown. It does not certify
every backup or every future release of the app.
