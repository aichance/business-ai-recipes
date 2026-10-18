# One native Playwright script: back-navigation must not erase another tab's answer

On unchanged [ai-dev-readiness 82989c25](https://github.com/yunbow/ai-dev-readiness/tree/82989c25c0572a93c9516433a43b9ac2791103b7), an earlier browser tab can erase an answer saved by the primary tab merely by pressing **Back**. It does not change that answer. The shared draft loses `Q01`, and it is still missing after the primary tab reloads.

**Two controls PASS; the earlier-peer regression FAILS.** This is an app-specific adaptation of the [same earlier-tab preservation check](../livepage-native/README.md), with the app's existing plain `playwright` dependency. It needs no `@playwright/test`, App Crash Lab runner, JSON contract, API key or account.

## Copy one file into the existing app

Copy [draft-navigation.mjs](draft-navigation.mjs) to the app's unused `app/tests/crashlab-draft-tab.mjs` path. Review the file first; do not overwrite an existing test. The script is MIT licensed and leaves the application source unchanged.

To reproduce the measured version, prepare a disposable local checkout of the pinned source above:

```sh
cd ai-dev-readiness/app
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install chromium
npm run build
npm run preview -- --host 127.0.0.1 --port 57960 --strictPort
```

In a second terminal at the same `app` directory:

```sh
READINESS_URL=http://127.0.0.1:57960 node tests/crashlab-draft-tab.mjs
```

Expected on the pin:

```text
PASS same-tab
PASS fresh-peer
FAIL earlier-peer PRESERVATION
```

Exit **1** means the regression was detected; it is not skipped or marked as an expected failure. The failed case prints the complete before/after drafts. A repaired application should pass all three cases. `PRECONDITION` instead means loading, UI operation, or actual persistence was not established; it does not prove answer loss.

For local traces, screenshots and full JSON results, choose an unused output directory:

```sh
READINESS_REPORT_DIR=./test-results/crashlab-draft READINESS_URL=http://127.0.0.1:57960 node tests/crashlab-draft-tab.mjs
```

The default run creates no reports. It always uses fresh browser storage and accepts only a loopback HTTP target. Each browser context is closed after its case; the browser is closed in a finalizer.

## What the three cases establish

All cases use normal UI clicks to answer the two profile questions. The primary tab then answers `Q01` and advances to the following question. The test confirms the new answer exists in the actual stored draft before proceeding.

| Tab pressing Back | Answers before Back | Answers after Back and primary reload | Result |
| --- | --- | --- | --- |
| Primary tab | P1, P2, Q01 | P1, P2, Q01 | PASS |
| Peer opened after the save | P1, P2, Q01 | P1, P2, Q01 | PASS |
| Peer hydrated before Q01 was answered | P1, P2, Q01 | P1, P2; Q01 is missing | FAIL |

The baseline is hydrated at question index2. In the regression the primary saves index3 with `Q01: "new_development"`; the earlier peer only navigates back and persists index1 with its older answer map. The synthetic profile, `tier` and the other answers stay the same. The oracle compares **every draft field except `currentIndex` and `updatedAt`**, so navigation metadata is allowed to change. It observes the real persisted index transition and the visible question; it does not require a timestamp change or infer a write merely from a click.

If a correct storage-event fix updates the peer before Back, its actual visible index supplies the expected previous question. The test does not force that peer to remain stale. Reads never seed storage or inject answers. The declared no-network context saw no external requests and no page errors in any measured case.

[RESULTS.json](RESULTS.json) binds the exact script hash to all three complete synthetic drafts and outcomes. All **107 original app files stayed unchanged**. We used a production Vite build on macOS, Node22.16.0, the app's locked Playwright1.61.1 and matching Chromium149.0.7827.55 (revision1228).

## Scope

This checks one ordered draft-navigation conflict. It does not test score correctness, result-history IndexedDB, all locales/browsers, simultaneous writes or an upstream fix. It is an AI-assisted operator reproduction, not proof that the author ran the test. The upstream app is MIT licensed; its source is not bundled here.

For another app, adapt the actual UI workflow, persisted record, readiness and allowed metadata changes. Keep both controls and verify the peer's real commit. [Report your own-app run or first setup blocker](https://github.com/aichance/business-ai-recipes/issues/new?title=Native%20draft%20preservation%20test%20result) with the app/version, command, adaptations and actual outcome.
