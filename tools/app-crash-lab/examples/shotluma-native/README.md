# Shotluma: a project-name edit in an older tab replaces a newer saved design

Copy [`stale-tab.spec.mjs`](./stale-tab.spec.mjs) into an existing Playwright project. It imports only `@playwright/test` and Node built-ins. There is no App Crash Lab runtime, account, API key, AI run or connector to install.

## What this checks

1. In a fresh browser context, create one blank screen and open the same project in another tab.
2. In the first tab, apply the built-in **Midnight pitch** template and wait for the project to be saved in IndexedDB.
3. In the older tab, change **only the project name**. Compare the saved design and the result after reload with the newer, independently captured snapshot.

The oracle compares the entire selected `slides` and `uploads` values, project ID/creation time and an empty asset store. It is not an element-count assertion. It observes the save window as well as the final reload, so a later repair cannot hide an already observed loss. A visible conflict rejection may preserve the newer design instead of committing the name. Unexpected native dialogs are setup failures, not passing preservation results.

This built-in template has no uploaded blobs. Image/audio bytes, multiple projects, AI generation, export and provider connections are outside this case.

## Run in your existing suite

Start your unmodified Shotluma checkout with its documented Bun workflow, then run the copied test through your usual Playwright command:

```bash
SHOTLUMA_URL=http://127.0.0.1:4173 \
  bunx playwright test tests/stale-tab.spec.mjs --workers=1 --reporter=line
```

For the public, account-free editor, explicitly select it instead:

```bash
SHOTLUMA_URL=https://app.shotluma.com \
  bunx playwright test tests/stale-tab.spec.mjs --workers=1 --reporter=line
```

Use the package manager already used by your Playwright project. The test requires Chromium; install its browser through your normal Playwright setup if missing. The commands assume `@playwright/test` is already in that project. No package install is performed by this file.

Every case creates and closes its own context with empty cookies/storage and blocked service workers. It does not use your browser profile. Only same-origin/font GET requests are allowed; analytics and other methods/origins are blocked. All names and edits are synthetic. It never fills a provider key or opens an AI/Codex connection. Do not point it at an authenticated deployment or replace the fresh context with your personal profile.

## Observed baseline, 2026-10-20

A fresh Chromium inspection of the official editor at **01:59:52 UTC /10:59:52 JST** found:

| Operation | Result |
| --- | --- |
| Save a template and load it in a new tab | PASS; all 6 design elements retained |
| Rename in the tab with the current design | PASS; complete selected design retained |
| Rename in the older tab, then reload | PRESERVATION FAIL; 6 elements became 0 and the background changed; UI said “Saved locally” |

The standalone file was subsequently executed as **3 tests: 2 PASS /1 preservation FAIL**, both against the retained static capture (30.8 s) and the live official editor (17.6 s). All three tests ran, with no skips. The failing case exits nonzero; it is not inverted into a passing assertion. The live HTML and JavaScript hashes matched the first observation before and after this run. Earlier replay navigation timeouts were setup failures and are not included as application failures in these results. Navigation now waits for commit, then explicitly waits for app UI and durable saved values.

No application code or storage was injected, patched or cleared. The test creates its data through ordinary UI; storage reads are atomic, read-only transactions. A fresh context contains only this synthetic project. This is an operator reproduction, not evidence that the author or another developer has run this test.

Runtime provenance: hosted HTML SHA256 `02d762890fae2b63d2b0c11d6936cf004a7afe1fb19d87d90971ee662b5a2744`; `/assets/index-CTAIgee-.js` SHA256 `d38ff176a87ae336e5085f943742a90e1822cb5938d12afeebfc01c060185bd1`. An operator-only, credential-free static HAR was retained for exact offline replay. The optional `SHOTLUMA_HAR=/absolute/path/to/your-capture.har` uses Playwright's replay with missing requests aborted; the capture is not distributed here.

Source consulted: [realZachi/shotluma at d501dbf](https://github.com/realZachi/shotluma/tree/d501dbffdbc09854ee0bf8567f1c2753a80e0ec8), especially [`persistence.ts`](https://github.com/realZachi/shotluma/blob/d501dbffdbc09854ee0bf8567f1c2753a80e0ec8/src/persistence.ts) and [`use-project-workspace.ts`](https://github.com/realZachi/shotluma/blob/d501dbffdbc09854ee0bf8567f1c2753a80e0ec8/src/app/use-project-workspace.ts). **The deployed bundle's equivalence to that source commit has not been established.** This report identifies the tested hosted artifact separately; it does not claim a local build, an original-suite result, or that every release is affected.

The regression intentionally requires preservation. On an affected build, it should fail rather than turn the defect into an expected passing assertion. The two controls should pass. If the application adopts a new conflict UI, adapt the explicit visible-rejection locator while retaining the full design comparison. If UI selectors or IndexedDB schema change, classify that as a setup change and revalidate the case.

Shotluma is an independent MIT-licensed project by its contributors. This test is an independent regression example; it is not an upstream change or endorsement. See [the source project's contribution guidance](https://github.com/realZachi/shotluma/blob/d501dbffdbc09854ee0bf8567f1c2753a80e0ec8/CONTRIBUTING.md) for reports and contributions.
