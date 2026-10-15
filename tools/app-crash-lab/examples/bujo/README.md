# Cadence Journal: rehearse a six-domain JSON restore

This checks [SathishKumarAI/bujo](https://github.com/SathishKumarAI/bujo), now
named Cadence Journal, at commit
`f016bc013e8fde8082a77192c8557a782d393938`. The app and its source are unchanged.
The fixture is synthetic and uses **This device only**; no account, cloud
folder, photo or passcode is set up.

## Try it on a disposable local copy

Node22.12+ and npm are required by the pinned Vite build. Use a new folder:

```sh
git clone https://github.com/SathishKumarAI/bujo.git cadence-backup-test
cd cadence-backup-test
git checkout --detach f016bc013e8fde8082a77192c8557a782d393938
npm ci --ignore-scripts
npm run build
npm run preview -- --host 127.0.0.1 --port 54610 --strictPort
```

Leave the server running. In a second, new working folder, save this example's
[roundtrip.json](roundtrip.json), then run:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.9.0/aichance-app-crash-lab-0.9.0.tgz app-crash-lab run roundtrip.json
```

Expected on this pin: **reload PASS; backup-roundtrip PASS**. The runner uses
fresh browser contexts, blocks external HTTP and service workers, and reads
only the configured loopback app. A build/start failure remains a setup
failure. Stop the app server you started when finished. Do not point this
fixture at your everyday journal or sync it with an account.

For a portable test, copy the generated `repro.spec.mjs` and
`playwright.config.mjs` into another new folder. Install only
`@playwright/test@1.64.0` there:

```sh
npm install --ignore-scripts --no-save --no-package-lock --no-audit --no-fund @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

Keep the local app running. These generated tests do not import App Crash Lab.

## What the fixture saves and compares

The normal UI creates three journal entries (including a collection-linked
entry), a 5km/28-minute run, mood7/sleep8, a named collection, a book and a
read-later link. The note/link include Japanese text and an emoji. No script
writes browser storage or imports a hand-authored source fixture.

All six selected arrays are read in full from `localStorage["bujo:data"]` and
mapped to the same paths in the real `Export JSON` download. Comparison keeps
IDs, collection references, every record field, tags, timestamps and array
order. Counts establish that setup created the intended records; counts do
not replace those complete-array comparisons.

The source and fresh target choose **This device only** and dismiss the tour
through the normal UI. `restore.prepare` then opens Settings → Data before
checking that all six selected arrays are empty. The fresh journal still has
the app's randomly identified starter habits and default preferences; it is
**not entirely blank storage**. The actual downloaded JSON bytes are delivered
to the existing file input, a new `Backup imported` toast is required, and all
selected arrays are compared immediately and after reload. No post-import
repair runs.

## Measured result and limits

On2026-10-16JST, App Crash Lab0.9.0 passed both checks. One export was4538bytes;
its original bytes were restored, with no selected differences at export,
post-export stability, restoration or reload. IDs, dates and file hashes vary
per run. The generated Playwright-only tests also passed2/2 in a separate folder
without App Crash Lab installed. All928 original source files had identical
SHA-256 hashes before and after execution; the owned server was stopped. This is an independent operator check, **not upstream
author adoption**.

Other JournalData domains are outside this contract, including starter habits,
settings and `lastBackup`, the top-level import `updatedAt` stamp, photos and
their IndexedDB bytes. They are not silently normalized: they are not selected
observations. The exporter updates backup metadata; the importer stamps
`updatedAt` by design. This current-version roundtrip does not prove sync
merge behavior, encryption, checksummed backups, older-schema migration,
native storage, power-loss recovery, or the correctness of health/reading
calculations. Read [SOURCE.json](SOURCE.json) and the upstream [MIT notice](LICENSE.upstream).

When adapting the fixture to real data, keep local reports/traces private:
ordinary reload evidence contains the selected journal values. A PASS covers
the declared state and this source pin; review the contract after app changes.
