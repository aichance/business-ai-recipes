# One regression in the app's existing Playwright suite

Use this path only after confirming a working `@playwright/test` dependency,
test configuration and local startup method in the authorized app. Select
one boundary that matches the user's request. Read its measured example and
test; the examples do not define another app's selectors, storage or intent.

## Choose by the failure, not a general save test

| Requested boundary | Measured starting point | Keep in the adapted test |
| --- | --- | --- |
| An earlier browser tab must not overwrite a later committed edit | [LivePage: two tabs](https://github.com/aichance/business-ai-recipes/tree/3a13c91e9fc387189b69463046e040c7f4915ef0/tools/app-crash-lab/examples/livepage-native) | Peer opened and hydrated before the edit; actual persisted commit; independent peer action; complete record after reload; normal controls |
| An authoritative save is rejected by storage | [Kinetic Curator: write denial](https://github.com/aichance/business-ai-recipes/tree/3a13c91e9fc387189b69463046e040c7f4915ef0/tools/app-crash-lab/examples/storage-write-denied-native) | Deny only the intended write; preserve the previous complete value; require truthful visible failure feedback; normal save control |
| Main work succeeded but optional history cannot be saved | [MAL: optional history](https://github.com/aichance/business-ai-recipes/tree/3a13c91e9fc387189b69463046e040c7f4915ef0/tools/app-crash-lab/examples/optional-history-native) | Preserve successful output and old history; allow a history-only warning; distinguish a real main-operation failure |

Two app-specific adaptations reduce setup when they match the user's project:

- [StitchWitch](https://github.com/aichance/business-ai-recipes/tree/3a13c91e9fc387189b69463046e040c7f4915ef0/tools/app-crash-lab/examples/stitchwitch-native): a name-only save from an earlier tab must preserve the complete saved chart. Name rollback after reload is a separate assertion.
- [Perma Design Kit](https://github.com/aichance/business-ai-recipes/tree/3a13c91e9fc387189b69463046e040c7f4915ef0/tools/app-crash-lab/examples/perma-native-delete): a pending same-page autosave must not restore an already deleted IndexedDB record. Confirm committed absence before observing resurrection, protect retained records and check view cleanup separately. This is a delayed-write boundary, not the earlier-tab trigger.

## Adapt and run one file

1. Read the selected example's source pin, setup, controls, exact command and
   limitations. Inspect the user's actual save/delete code and rendered DOM
   when needed. Keep the observation table from `SKILL.md` specific to this app.
2. Add a new test file under its existing `testDir`/`testMatch`. Keep existing
   files and configuration; use an unused name. Adapt selectors, storage keys,
   full expected records, UI success/error signals and fault prerequisites.
   Do not copy source-specific sample expectations unchanged into another app.
   Before the first save, check action locators against the rendered UI: each
   action must resolve to the intended unique element, visible and editable
   where required. Check that the same locator still reads the intended value
   after input. Label text in source may differ from the computed accessible
   name, and IDs may be duplicated; use a verified role/name, test ID or scoped
   placeholder rather than guessing from markup.
3. Use synthetic data in a fresh browser context against a disposable local
   app. Create data through its normal flow and independently establish the
   actual persisted baseline. Observe canonical storage read-only where
   possible. Do not seed replacement records, patch app code, or weaken the
   requested condition to get a passing baseline.
4. Reuse the app's existing Playwright command and configuration. First run the
   normal controls, then the relevant regression, retaining all outcomes.
   Do not add `skip`, `test.fail()`, a blanket storage denial, or sleeps that
   make the fault disappear. If a timing prerequisite is required, measure
   and enforce it; a missed window is an unmet precondition, not a green test.
5. Report the exact command, exit code, control/regression outcomes, complete
   compared data and artifact paths. Separate setup/selector/fault-precondition
   errors from an observed app failure. Preserve every observed loss even if
   a later action restores the value. A fixed app may pass the regression;
   do not manufacture a failure to match the published example.
   A selector timeout before establishing the saved baseline is setup
   INCONCLUSIVE, even when Playwright reports the test as failed. This does not
   turn an observed data mismatch after a valid baseline and fault into setup.
   Save the relevant DOM and screenshots to explicit output paths and check
   that they exist; an inline attachment may not survive the chosen reporter.

Use the existing project's approved Node/Playwright/browser versions. The
published examples were measured on their stated versions, not every version
or browser. Avoid new dependencies or configuration changes without a concrete
setup need. Keep reports/traces out of commits and public uploads. Stop only
servers started for this task. Do not call an operator run independent adoption.

For requested real JSON download → empty restore → reload checks, return to
the runner path in `SKILL.md` and [its pinned references](runner.md). None of
these native examples substitutes for that full backup requirement.
