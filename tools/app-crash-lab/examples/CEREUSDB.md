# CereusDB: read the same OPFS row after reload

**Observed on 2026-10-11: `PASS reload`; the generated standalone Playwright test also passed.**
This checks the author's unchanged [CereusDB playground source](https://github.com/tobilg/cereusdb/tree/f7b8dd56dc41aced048993c77eb8e8c619fd2764/packages/playground)
with the official `@cereusdb/minimal@0.4.0` package. It is our compatibility
run, not a report of adoption by the author.

The contract creates a synthetic OPFS database and one row through the SQL
editor. After a real page reload it explicitly runs `ATTACH`, runs a new
`SELECT`, and compares the complete result:

```json
[{"id":1,"note":"Saved English"}]
```

The left-hand Tables list stayed empty in our trial, including after a
successful `ATTACH`. That was not evidence of lost data: a fresh `SELECT`
returned the saved row. This check observes the JSON result, not the sidebar
or the previous query's row-count label.

## Start an unchanged local playground

Use a disposable folder, Node 22+ and npm. Download and extract the pinned
[source ZIP](https://github.com/tobilg/cereusdb/archive/f7b8dd56dc41aced048993c77eb8e8c619fd2764.zip).
From its `packages/playground` directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm pack @cereusdb/minimal@0.4.0 --ignore-scripts
mkdir -p ../minimal
tar -xzf cereusdb-minimal-0.4.0.tgz -C ../minimal --strip-components=1 package/dist
npm run dev -- --host 127.0.0.1 --port 49743 --strictPort
```

Keep the server running. The upstream Vite configuration resolves the package
to `../minimal/dist/index.js`. These commands supply the **official published
build** at that path; they do not change the playground source or require a
local Rust/Wasm build. We verified the npm archive's published SHA-512 integrity.
This is a source-plus-published-package compatibility run, not verification of
a locally rebuilt CereusDB engine. First-time package downloads require network
access and disk space.

## Run App Crash Lab

Save [`cereusdb.json`](cereusdb.json) into a separate working folder using
GitHub **Raw → Save As**. In that folder:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run cereusdb.json
```

Expected: `PASS reload`. Open the absolute `index.html` report path printed by
the CLI to inspect the before/after row, screenshot and reproduction test.
For a different local port, append `--base-url http://127.0.0.1:PORT` with the
actual port. The app must be at `/`.

Every run uses a fresh, nonpersistent Chromium context. The synthetic database
is `opfs://crash_lab_trial`, created through this editor sequence:

```sql
CREATE DATABASE 'opfs://crash_lab_trial';
CREATE TABLE crash_lab_trial.public.notes AS SELECT 1 AS id, 'Saved English' AS note;
SELECT id, note FROM crash_lab_trial.public.notes ORDER BY id;
```

After reload:

```sql
ATTACH 'opfs://crash_lab_trial';
SELECT id, note FROM crash_lab_trial.public.notes ORDER BY id;
```

The CLI submits one statement at a time and selects the JSON result tab.
It does not reuse your everyday browser's storage or delete an existing database.

## Keep the generated test

Keep the server running and change into the directory containing the report:

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

The generated test passed on macOS arm64, Node 22.16.0 and Playwright 1.64.0.
As a separate local control, we deliberately inserted an `UPDATE` after
`ATTACH` that changed the note to `Changed after reload`. The same comparison
failed with the changed row. This was our test mutation, not an upstream defect.
Stop the development server with Ctrl+C when finished.

## What this does and does not establish

This checks one saved row across page reload, explicit attach and re-query,
with a 250 ms observation window after the expected result appears. It does
not establish machine-crash durability, browser restart behavior, multi-tab
concurrency, quota handling, every SQL type, or cross-browser compatibility.

Separately, a manual run on the author's public 0.4.0 playground rejected an
integer-column INSERT containing `not_an_integer`; a subsequent SELECT still
returned the original row. That rejection is **not automated by this contract**.
The error clears the displayed result, and a fresh query clears the error, so
the current contract does not pretend to observe both simultaneously.
