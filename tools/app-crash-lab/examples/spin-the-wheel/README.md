# Real JSON restore keeps a wheel entry and its spin history

This is an independently operated, synthetic-data check of [Spin the Wheel by Franklin](https://github.com/Franklindot04/spin-the-wheel), pinned to [`39b29aa`](https://github.com/Franklindot04/spin-the-wheel/tree/39b29aab913ba6a508a911a02ea2c9ca6b27a529). It is not an author execution report or a newly discovered defect.

The author is already tracking [state consistency and import/history validation](https://github.com/Franklindot04/spin-the-wheel/issues/9). This pack adds a runnable **normal-file roundtrip with one history item**. It does not reproduce the reported invalid-file error-display issue D38, storage-quota failure, or every item in D41.

| Executed check | Observed result |
| --- | --- |
| Rename Entry 1 through the normal input, then finish one Standard Mode spin | Synthetic label present; History badge `1` |
| Download the app's actual JSON | 3,490 bytes; complete saved `spin-the-wheel:v2` object matches the root payload |
| Fresh browser context before import | Storage key `null`; Entry 1 `Option 1`; History badge `0` |
| Real file chooser, then the page's **Import** confirmation | Original downloaded bytes, one commit; complete state and visible label/history match |
| Reload after restore | Complete saved object, label and History badge still match |
| Same exported standalone Playwright check | **1 passed, 0 failed, 0 skipped** |
| Deliberately require History `2` after only one spin | **INCONCLUSIVE**, CLI exit `2`: source baseline not confirmed |

The whole saved object is compared, including generated IDs, timestamps, all wheels, settings and both history arrays. No field is removed or normalized by the check. The wrong-baseline control is an intentional contract mistake, not an app defect. Backup size/hash can differ on another run because the app creates IDs and history timestamps.

## Run the normal check

Use a disposable local copy of the pinned app and synthetic data. The measured environment was Node 22.16.0, Next 16.3.7 and Chromium. No account or LLM/API key is needed. Review the app and dependencies before running them.

1. In that app copy, install its locked dependencies and build it with the official scripts (`npm ci --ignore-scripts`, then `npm run build -- --webpack`). Start it with `npm run start -- --hostname 127.0.0.1 --port 54681`. The measurement used the production build; the development watch server did not run reliably in our restricted environment.
2. Download `roundtrip.json` and `wrong-baseline.json` from this directory into a separate writable test folder. Keep the app on port `54681`, or adapt **only** `baseURL` in both files to its localhost origin.
3. From the test folder, run:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run roundtrip.json --out normal-report
```

Expected: `PASS backup-roundtrip`, exit `0`. Open `normal-report/index.html`. `normal-report/repro.spec.mjs` and `playwright.config.mjs` contain the generated standalone check. Use the [standalone setup instructions](../../README.md#keep-the-evidence-rerun-the-test) to run it with Playwright 1.64.0.

As a contract guard, run the intentionally wrong baseline separately:

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run wrong-baseline.json --out wrong-baseline-report
```

Expected: `INCONCLUSIVE backup-roundtrip — SOURCE_BASELINE_NOT_CONFIRMED`, exit `2`. The deliberately wrong `historyCount: "2"` stops the check before export. It does not show a failure in the app.

## Adapt it to your own app

The useful pattern is **actual downloaded JSON → empty browser → explicit Import commit → complete saved data + visible result → reload**. Start from the [backup guide](../../BACKUP.md) or its agent setup prompt, then declare your own real storage keys and UI conditions. This wheel-specific config is not a generic no-edit adapter.

Only Standard Mode with one wheel, four text-only entries and one spin was exercised. Quiz behavior, media, quota limits, malformed imports, migrations, other browsers and the current hosted service are untested. A passing full-state comparison checks preservation; it does not establish that the pre-existing state is semantically correct. Source and environment details are in [SOURCE.json](SOURCE.json). AI-operated local verification; no private records or upstream source are distributed.
