---
name: app-crash-lab
description: Test a local web app's saved data across reload, rejected input, or real JSON backup restoration with App Crash Lab. Inspect the app and create the contract for the user; use when they want a repeatable saved-state check, not a general UI audit.
---

# App Crash Lab

Turn the user's save workflow into a small, runnable test of **their app**. Use
the existing App Crash Lab 0.10.0 runner; do not implement another runner or
silently substitute its bundled demo.

## Establish what the test means

Read the authorized app's README, startup scripts and relevant save/import
source. Use rendered DOM when needed for actual selectors. Obtain the local
origin and requested workflow from the user or project; ask only for missing
information that affects the test. Use a disposable local instance and synthetic
records. Do not read credentials, reuse a logged-in browser profile, deploy,
publish, or modify the app merely to manufacture a passing check. Test actions
can write data.

Before writing JSON, show a short observation table:

| Requirement | How the app completes it | What will be compared |
| --- | --- | --- |
| The requested record was saved | Actual save-completion signal from source/UI | Complete selected persisted record(s), plus a meaningful visible result |
| Chosen follow-up preserves it | Reload, explicit rejection, or real import completion | The same stored values and selected UI result afterward |

Fill the table with this app's facts, not these descriptions. Input text, a toast,
record counts or a preference key alone may miss a lost record/field. Read the
actual canonical saved value where supported, keep full selected records and
IDs, and add UI observations when display behavior matters. Preservation does
not establish that the original calculation or content was correct.

Choose only the checks relevant to the request:

- `reload`: save through the normal flow, then compare after reload.
- `rejected-update`: separately establish that the invalid operation finished
  and was rejected, then compare the selected saved state. Do not treat the
  initial error-free state as a rejection signal.
- `backup-roundtrip`: use the app's real download, map complete selected records
  into its JSON, restore unchanged bytes into an empty browser context, and
  compare after import and reload. A malformed-file test is not this check.

If the app needs unsupported authentication, external services, storage formats
or confirmation steps, report the exact boundary. Do not replace the real data
with a simpler key, normalize away changed IDs, inject storage to prepare a
fresh restore, or add sleeps that conceal an incomplete save.

## Create and execute the contract

Read [runner setup and contract sources](references/runner.md). Use the pinned
format and supported actions/observations; inspect the referenced contract and
one relevant example rather than guessing fields. Derive selectors, storage
keys, expected values and readiness from the app. `init` contains Notes demo
selectors and is not an automatic adapter.

Put the contract and evidence in a new local output folder, such as
`.crash-lab/my-flow/`, without overwriting earlier runs. Use a Node 22+
environment and the user's approved startup method; reuse a confirmed running
local app when possible. Keep app data and test output out of commits. Run the
contract against the unchanged app and read the **new** report.

Distinguish PASS, a reproducible FAIL, and INCONCLUSIVE. For a setup/selector
mistake, preserve the first report, make a focused correction and run to a new
output directory. Do not change expected values to observed values just to pass.
For an actual app failure, retain the failing contract and explain the mismatch.
If fixes are already part of the user's request and permission, preserve that
failure evidence and proceed within that scope. A test-only request does not
authorize app changes; do not invent an approval gate for an already requested fix.

Run the generated standalone Playwright test when dependencies and the requested
scope permit; otherwise state that it was generated but not rerun. Stop only
servers started for this task, leaving an existing user server running.

Return the app/workflow and runner version, observation table, exact commands
and exit codes, result and key differences, absolute report/contract/spec paths,
and the command to rerun after the next update. State untested behavior and
whether the standalone test actually ran. Do not call local testing an
independent user report or imply proof for all inputs and future failures.
