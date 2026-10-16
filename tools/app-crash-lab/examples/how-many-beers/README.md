# A valid backup restores; one null task breaks the restored cook

Original black-box checks for [How Many Beers](https://github.com/Warconn/how-many-beers), pinned to [`2822b6c`](https://github.com/Warconn/how-many-beers/tree/2822b6cd1b2c675bb524dab674c59a13e7f3b263). The author's [reliability issue #10](https://github.com/Warconn/how-many-beers/issues/10) requests browser-level persistence and backup tests. These are AI-operated local measurements, **not an author execution or adoption report**.

The test creates an archived cook with a custom step, note, outcome and three activity events, plus a new active cook with a different custom step. It uses no built-in recipes and never seeds storage directly.

| Executed check | Measured result |
| --- | --- |
| Upstream Vitest suite | 30 passed across 3 files |
| App Crash Lab 0.10.0 reload | **PASS**: complete active and history values, visible active step and archive survive |
| Generated standalone reload test, unchanged | **1 passed** |
| Deliberately incorrect archived-cook name | **INCONCLUSIVE**, exit `2`; source baseline not confirmed |
| Independent Playwright: actual downloaded JSON → new empty browser context → native confirm → restore → reload | **PASS**: all fields in both saved objects equal the source, including IDs, times and the nonempty archive |
| Independent Playwright: append one `null` to `active.customTasks` in another real backup | **FAIL**: no explicit rejection; null is saved, the page throws, and reload still shows the application error |

The normal download was **3,356 bytes** (SHA-256 `d4dbdde9cbc1b9e5449b4114529bb51886fc527be70a999a802a8566fbd93509`). Each run creates fresh IDs/timestamps, so the size/hash can change. The invalid test has its own independently created real download; it appends just one null and checks that removing that appended value restores the complete original JSON.

The failed test accepts the exact normal restore confirmation once. It then observes `Cannot read properties of null (reading 'id')`, compares **both whole storage values** immediately and after reload, and requires an explicit restore refusal. The active object's only saved change is the appended null. **The history object remains identical**; this is not evidence of an erased archive or failed writes in general. The rejection requirement is this test's preservation contract, not a quoted promise about every malformed file.

## Rerun the independent backup checks

Use a disposable local evaluation of the pinned app with synthetic data only. Review the app and dependencies before running them, and respect its license conditions. The tested runtime used Node 22.16.0, Chromium and Next 15.5.28. The upstream has no lockfile; future dependency resolution may differ. No API key or account is used.

Start the app with its normal scripts on loopback port `60291` (`npm run dev -- --hostname 127.0.0.1 --port 60291`). Next regenerated `next-env.d.ts`; the other 22 source files, including app logic/CSS/configuration, remained unchanged. This is a development-server measurement, not a test of the deployed site.

Copy **`backup.spec.mjs` and `playwright.config.mjs`** from this directory into a separate writable test folder. In that folder:

```sh
npm init -y
npm install --save-dev --ignore-scripts @playwright/test@1.64.0
npx playwright install chromium
ACL_HMB_OUTPUT=./browser-evidence npx playwright test --config playwright.config.mjs
```

Expected on the tested pin: **1 passed, 1 failed**, exit `1`. The failed malformed-file preservation test is intentionally kept failing; do not weaken its assertions to make it green. Complete synthetic observations are written as JSON and attached to the report; the failure also gets a screenshot. `ACL_HMB_OUTPUT` chooses the artifact directory. For another disposable local port, set `ACL_HMB_URL=http://127.0.0.1:PORT/how-many-beers/`. Non-loopback app URLs are rejected.

The positive test uploads the **unmodified downloaded bytes** into a separate browser context with no cookies/origins. It observes the app's fresh random default ID and empty history before restore, and compares every field after restore and reload. The negative test runs in a separate isolated context and uses the actual file input; it does not patch the app or write storage on its behalf.

## Rerun the CLI reload and baseline guard

Download `reload.json` and `wrong-baseline.json` into your test folder. Keep the app on the configured loopback origin, or adapt only `baseURL` to your disposable local origin.

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run reload.json --out reload-report
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run wrong-baseline.json --out wrong-baseline-report
```

Install Chromium as above first. The first command should report `PASS reload`, exit `0`; the second intentionally stops as `INCONCLUSIVE reload`, exit `2`. The latter is a bad test baseline, not an app defect. Open `reload-report/index.html` and retain the generated spec/config using the [standalone instructions](../../README.md#keep-the-evidence-rerun-the-test).

**The CLI's generic `backup-roundtrip` was not run for this app.** In version 0.10.0 its fresh-target contract requires exact declared empty values. This app persists a new random default cook at startup, so that contract cannot express a fixed full active object. The CLI reload captures both complete objects dynamically and compares them without removing IDs or time fields. The two backup checks above are independent Playwright tests, not generic CLI backup results.

## Scope and reuse

For another local-first app, reuse the pattern: UI-created nonempty data → real downloaded file → fresh context → actual import confirmation → full saved values plus UI → reload. Also test a minimally malformed file against a stated refusal/preservation contract. Read the [backup guide](../../BACKUP.md); this app-specific pack is not a universal adapter.

Only local Chromium, one synthetic active cook, one archive and one malformed input were exercised. Offline/PWA, real mobile OS, sleep, quotas, partial-write recovery, schema migration and food safety are untested. No upstream code, recipe text, built app or upstream tests are distributed here, and no upstream modification is included. Our original checks inherit this repository's MIT license; that does not license the upstream app. See [SOURCE.json](SOURCE.json) and [results-summary.json](results-summary.json).
