# Pinned runner and contract references

The skill is instructions, not a bundled browser or runner. It uses the existing
MIT App Crash Lab **0.11.0**, Node **22+**, and Playwright **1.64.0**. The agent
creates the app-specific JSON; the user does not need to copy sample selectors.
No LLM/API key or account is required by the runner. Agent setup uses the user's
existing coding agent.

## Install and run

In a writable test folder, use the pinned public package:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.11.0/app-crash-lab-0.11.0.tgz app-crash-lab run my-app.json --out report-01
```

Replace `my-app.json` with the contract you created for the user's app and choose
a new report directory. `report-01/index.html` is a local report. On Linux,
browser system libraries may be missing; the runner's setup guide explains
`--with-deps`, which may need administrator permission. Do not silently install
system packages. A package/browser download may take time on a first run.

A verified 0.11.0 source checkout can instead run `node cli.mjs run ...` from its
tool directory. Do not assume this skill folder contains `cli.mjs` or depends
on a sibling repository. Do not install or alter global agent configuration.

## Choose the matching source of truth

- [0.11.0 contract](https://github.com/aichance/business-ai-recipes/blob/app-crash-lab-v0.11.0/tools/app-crash-lab/CONTRACT.md): schema, exact selectors, step/observation types, completion signals and exit codes.
- [Current setup and standalone rerun](https://github.com/aichance/business-ai-recipes/blob/main/tools/app-crash-lab/README.md#keep-the-evidence-rerun-the-test): installation, reports and generated tests.
- [0.11.0 backup guide](https://github.com/aichance/business-ai-recipes/blob/app-crash-lab-v0.11.0/tools/app-crash-lab/BACKUP.md): real JSON download, full-record mapping, empty restore, file chooser and native/HTML confirmation.

For source-reading tools, use `raw.githubusercontent.com/aichance/business-ai-recipes/app-crash-lab-v0.11.0/` with the same file path. Read only the relevant sections and an example that fits the app; examples do not define another app's selectors or intent.

Useful examples in that pinned tree:

| Actual app shape | Example |
| --- | --- |
| localStorage save with explicit invalid-input error | `tools/app-crash-lab/examples/notes.json` |
| same-origin JSON response and HTTP rejection | `tools/app-crash-lab/examples/inventory.json` |
| dynamic localStorage key and JSON input | `tools/app-crash-lab/examples/tunoron.json` |
| real JSON restore through a file chooser | `tools/app-crash-lab/examples/price-table/roundtrip.json` |
| native restore confirmation | `tools/app-crash-lab/examples/paisa/roundtrip.json` |
| HTML preview with one Import click | `tools/app-crash-lab/examples/toeic-tracker/roundtrip.json` |

`schemaVersion: 1` and `pack: "state-preservation@1"` are required. Select the
requested `checks` explicitly. Rejection has a separate observation and expected
signal. Backup mode requires `isolation: "browser-local"`, explicit empty target,
real download, complete selected `statePaths`, and a new import success signal
that can also be read before import (use count for a success toast initially
absent). Its report deliberately omits before/after values and a raw trace.

For autosave, read the pinned backup guide before using optional
`backupRoundtrip.sourceReady`. Project explicit persisted values from already
selected complete storage observations; keep full-record stability and every
export/restore/reload comparison. A visible edit or fixed sleep is not evidence
that the complete saved record was committed.

Missing/unsupported observations or an unconfirmed source baseline are
INCONCLUSIVE, not evidence of an app defect. Full-record preservation is
different from a business-specific semantic assertion; state the scope.
