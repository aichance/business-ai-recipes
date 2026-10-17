# Pomoflow: three saved records, two visible tasks

**Run one task-preservation contract, then keep the generated test in your existing Playwright suite.**

This checks an unchanged local [Pomoflow](https://github.com/amoslives/pomoflow)
at commit `65cfab7fc6a4c49526221cfba9cc1d7731b0bcf7`.
Its existing `tests/e2e/core.spec.ts` CRUD case adds, completes and deletes a task;
this separate check compares the complete saved records after reload.
No new Pomoflow defect is alleged.

The normal UI creates three synthetic tasks, completes one, deletes another,
then edits the pending task. After browser reload, it compares the entire
`pomodoro_tasks` array: generated IDs, titles, completion flags, creation/update
times and the deleted record's tombstone. Two visible rows must still show
the intended pending and completed titles. The deleted record remains in
storage, rather than being mistaken for an unwanted extra row.

| Local measurement | Result |
| --- | --- |
| App Crash Lab 0.10.0, reload-only contract | PASS, all three records unchanged |
| Generated standalone in Pomoflow's existing Playwright 1.64.1 Chromium project | 1 passed |
| Deliberately change the tombstone's `updatedAt` by 1,000 ms on reload | FAIL; visible task titles and counts stay unchanged |

The last row is an authored diagnostic fault, **not a bug found in Pomoflow**.
These are operator measurements on macOS with Node24.19.0; they do not establish
independent author use. The CLI uses Playwright1.64.0; the existing-suite run
uses Pomoflow's locked1.64.1. No mobile run is claimed.

## Run on your local copy

Use a disposable checkout of that source commit and Node24+. Pomoflow's
[own README](https://github.com/amoslives/pomoflow/blob/65cfab7fc6a4c49526221cfba9cc1d7731b0bcf7/README.md)
documents its local development server. No cloud credentials are required.
Keep sync disabled and do not open a pairing link. Start your local app at
`http://127.0.0.1:3000`; the test creates its own fresh browser context.

From a writable working directory, with this kit's `tasks-reload.json` available:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run tasks-reload.json
```

The command prints an absolute report path and creates a new `.crash-lab/`
directory for the run. Use `--base-url http://127.0.0.1:YOUR_PORT` for another
local port. Keep the contract and report together. A broken setup is distinct
from a changed saved state.

## Keep one generated file in the existing suite

Take `repro.spec.mjs` from **your own successful run**. The downloadable kit
also includes the exact generated file tested here, targeting port3000.
From your Pomoflow checkout, copy it to the path below if that path does not
already exist. Review an existing file instead of overwriting it.

```sh
cp -n /path/to/run/repro.spec.mjs tests/e2e/app-crash-lab-task-reload.spec.mjs
npm run test:e2e -- tests/e2e/app-crash-lab-task-reload.spec.mjs --project=chromium --workers=1
```

This exact command collected and passed one test using the unchanged
`playwright.config.ts`. We served the unmodified built frontend on loopback;
its `/api/tasks` backend was absent because this check stays in local task mode.
The spec imports `@playwright/test`, not the App Crash Lab runtime.
If your app uses another port, rerun the contract with `--base-url` and take
the newly generated spec, rather than keeping a stale embedded address.

## Optional counterexample: same UI, changed metadata

After `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build` in a
disposable Pomoflow checkout, serve its build output with the authored control:

```sh
python3 serve-metadata-control.py /path/to/pomoflow/dist --port 3001
```

Leave that terminal running. In another terminal, use the same contract:

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run tasks-reload.json --base-url http://127.0.0.1:3001
```

Expected: FAIL for `completeTaskRecords[0].updatedAt`, while both visible titles
and row counts are unchanged. The control changes only the synthetic deleted
task on the next page load. Stop the control server with Ctrl+C when finished.
The normal source files are never edited.

## Scope

Reload only. Cross-device sync, conflicts, Cloudflare D1, room-key rotation,
invalid updates, backup/restore, music, timer statistics and operating-system
crashes are outside this check. Browser traffic stays on the selected local
origin and service workers are blocked. The saved snapshot is sampled for
500 ms after a match; that does not prove indefinite durability.

The first draft of this contract incorrectly assumed new tasks were appended.
The runner stopped as INCONCLUSIVE before comparison; source review confirmed
Pomoflow prepends tasks. The supplied contract uses the actual ordering. That
setup error was ours, not a Pomoflow defect.

Pomoflow is Apache-2.0; its source is linked, not bundled. The authored contract,
control and App Crash Lab-generated test are MIT licensed. Work is AI-assisted.
If you try the contract on your own app, a short report with the app commit,
environment and result helps; do not include pairing links, credentials or real tasks.
