# The JSON survived. Could you open the restored record?

A normal-save App Crash Lab control plus an independent Playwright regression check for the import-ID problems
already reported by the Kaioken author in [issue 32](https://github.com/rabocse/kaioken-gym-log/issues/32).
It combines a saved-state check with actual import usability. The import-ID
spec and the CLI's generated reproduction need Playwright, without an App Crash Lab runtime dependency.

On unchanged [Kaioken `afe0e19d`](https://github.com/rabocse/kaioken-gym-log/tree/afe0e19d1a68101500ddb7b1b7d179c5601a6f8a),
the three import tests ran in **about 6 seconds** on the operator's Mac:

| Input | Measured result | Saved data and UI |
| --- | --- | --- |
| Nonempty string ID | PASS | The imported routine opens before and after reload. |
| Numeric ID `12345` | FAIL | Both complete records and typed keys survive reload, but opening the imported entry returns to Home. |
| Object ID `{}` | FAIL | An unhandled `DataError` leaves Settings open without explicit rejection. The existing saved routine is unchanged. |

The two failures are real regression assertions against the unfixed app, so
the command exits **1**. They are not hidden with `test.fail()` or converted
into an all-green report. A fixed implementation should pass all three.

## Run against a disposable app

Use Node 22+, npm, Chromium and a separate local Kaioken copy. At the pinned
app's root, serve its unchanged static files in one terminal:

```sh
python3 -m http.server 54670 --bind 127.0.0.1
```

## First run the App Crash Lab control

In another terminal outside the app, download [normal-reload.json](normal-reload.json)
and run the already published 0.10.0 release:

```sh
curl -fL https://raw.githubusercontent.com/aichance/business-ai-recipes/main/tools/app-crash-lab/examples/kaioken/normal-reload.json -o normal-reload.json
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run normal-reload.json
```

Measured **PASS / exit 0**. It creates one synthetic routine through the normal
UI, then compares the complete `routines` and `settings` stores plus the Home
row and name across reload. Settings were empty in this run. The generated
`repro.spec.mjs` also passed independently with only Playwright installed.
To rerun it, copy that file and `playwright.config.mjs` from the printed report
folder into the fresh Playwright folder below, then run
`npx playwright test --config playwright.config.mjs`.

This control does **not** exercise the invalid imports below or a backup round
trip. Its ordinary CLI report/trace/screenshot contains synthetic observed
values; keep those raw artifacts private. To use a different local port,
pass `--base-url http://127.0.0.1:8080`.

## Check imported records are usable

Create a fresh test folder outside the app:

```sh
mkdir acl-kaioken-check
cd acl-kaioken-check
npm init -y
npm install --save-dev --ignore-scripts --no-audit --no-fund @playwright/test@1.64.0
curl -fL https://raw.githubusercontent.com/aichance/business-ai-recipes/main/tools/app-crash-lab/examples/kaioken/import-identity.spec.mjs -o import-identity.spec.mjs
npx playwright install chromium
npx playwright test import-identity.spec.mjs --workers=1 --reporter=line
```

The normal `go run .` development server also works: set
`KAIOKEN_BASE_URL=http://127.0.0.1:8080` on the test command. The variable must
be a loopback origin without credentials, query or path. Downloading from
`main` gets the current check; use the source link at this page's commit if
you need the exact historical file.

## What makes a repaired import acceptable

Each test creates its own fresh browser context and one baseline routine
through the normal UI. It pastes one synthetic JSON payload into Settings,
uses the normal confirmation when present, then observes both complete
IndexedDB stores in a read-only transaction. The observer is capped at
32 records per store and 65,536 bytes total.

For invalid IDs, the check permits either of these outcomes:

- An explicit `Import failed` response, before confirmation or during apply,
  with both stores unchanged and only the original routine in the UI.
- A completed import that repairs the ID into a nonempty string primary key,
  preserves every declared incoming field and the full original routine,
  opens the imported detail, and retains complete records/keys and usability
  after reload.

The valid string-ID control must import successfully with its identity unchanged. The test does not
prescribe a particular ID-generation algorithm or require an invalid ID to
be preserved. If a future UI uses a different explicit error title, update
that declared selector; an unsupported UI/setup failure is not evidence of
an application regression. No fixed app was tested in this measurement.

## What we did not reproduce

A separate diagnostic imported two routines with the same string ID. The
preview said `Adds 2 new.`, but only the second routine was present both
immediately and after reload. We did **not** reproduce a two-row UI becoming
one row only after reload at this pin. Whether same-batch replacement should
be rejected or previewed differently is a separate product decision; it is
not a failing acceptance rule in these three tests.

## Scope

Kaioken exports and imports JSON text through textareas/clipboard controls.
This is an import-validation and usability check, **not** the CLI's actual-file
backup round trip. OS clipboard behavior, complete export/settings coverage,
service workers, iOS eviction, storage pressure and a deployed service are
untested. Service workers are blocked and requests outside the declared
loopback origin are aborted. App source and its 17 files were not modified.

The custom attachment contains hashes, counts and diagnostic names, without
captured records or keys. `importCompletion` describes the import response;
`openedHeading` and `reopenedHeading` separately record detail navigation.
Playwright's regular failure context can contain UI
text; all inputs here are synthetic. Keep this test on a disposable local copy.

These are AI-operated maintainer measurements, not author execution or
third-party adoption. This directory contains independently written tests and
synthetic inputs, not Kaioken source, assets or an upstream fix. See
[SOURCE.json](SOURCE.json) for the pin and measurement boundary.
