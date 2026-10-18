# A successful translation must not become a failed translation because history is full

This small native Playwright adapter reproduces [MAL issue #1](https://github.com/laffyxy/MAL/issues/1).
The primary translation succeeds, but an optional `translation_history` write throws.
On the measured revision, the new result stays visible and the old persisted
history is intact, yet the app displays an unqualified `Error` notification.
**This is an error-classification regression, not evidence of lost translation output.**

Copy `optional-history.spec.mjs` into a Playwright suite, or use this standalone
folder. No App Crash Lab runtime, contract, real API key or provider account is
needed. The provider response is fulfilled locally; all other external requests
are blocked. This does not test real OCR, translation quality or model availability.

[Download the seven-file ZIP](https://aichance.github.io/business-ai-recipes/app-crash-lab-optional-history-native-v0.1.0.zip)
· [SHA-256](https://aichance.github.io/business-ai-recipes/app-crash-lab-optional-history-native-v0.1.0.zip.sha256)
· [Measured results](RESULTS.json)

## Try the measured app

Use Node 22+ and npm. In a separate disposable directory, start the static app:

```sh
git clone https://github.com/laffyxy/MAL.git mal-local-trial
cd mal-local-trial
git checkout 216005fae2214cec4c6c6597435992d37a9eb810
python3 -m http.server 54201 --bind 127.0.0.1
```

In the extracted `optional-history-native` folder, in another terminal:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run controls
npm test
```

`npm run controls` runs the normal-success and genuine-provider-failure controls.
`npm test` also runs the regression: **two tests pass and one fails at `OUTCOME`**
on the pinned app. A missing selector, invalid baseline or absent write denial is
a setup/precondition failure, not the measured error-classification bug.
Read `results.json`; the regression attaches its exact witnesses and screenshot.

To use another local port or path:

```sh
OPTIONAL_HISTORY_BASE_URL=http://127.0.0.1:54201/ npm test
```

The test uses fresh browser contexts, a fake settings value and its own tiny PNG.
It does not use your normal browser profile, photos, camera or real provider key.
Stop the static server with Ctrl+C when finished. Do not point this adapter at a
deployed app or a project containing real customer data.

## What it proves

| Case | Pinned MAL | Required evidence |
| --- | --- | --- |
| Normal successful response | PASS | Exact result visible; one actual history record saved |
| Successful response, only optional history write denied | OUTCOME FAIL | A distinct second result visible; actual write denied; old durable history unchanged; misleading visible main-operation Error |
| Real provider failure, locally simulated | PASS | Main failure remains visible; no history write |

The desired behavior may show a truthful **translation completed; history not
saved** warning. It does not have to show a green success toast. Merely hiding a
stale Error string in the DOM must not cause a failure.

On an isolated hypothetical corrected copy, all three tests passed. A second
negative control changed the misleading text to `Translation failed` and still
failed; a hidden stale history-error control passed. These controls test the
oracle. They are **not upstream fixes or evidence of author adoption**.

## Adapt it to your app

This is a concrete MAL adapter, not an automatic test for arbitrary apps. Change
the normal UI actions/selectors, provider response shape and exact optional
storage key together. Require a distinct successful business result before
interpreting the storage fault. Keep the independent normal and real-provider-
failure controls; do not suppress genuine main-operation errors.

Review the `mainFailure` signature and the genuine-provider-failure oracle for
your app's visible wording and locale. The default recognizes MAL's measured
injected Error and explicit `Translation/OCR failed` or `unsuccessful` notices.
It cannot infer the meaning of arbitrary notifications. The denial-time snapshot
and visible-notice log capture MAL's synchronous notification before its 3-second
hide timer; another app may need a different completion/observation boundary.

The scope is one optional localStorage key in the current document, synthetic
quota rejection and stubbed responses. It does not establish real quota capacity,
iOS eviction behavior, in-memory history rollback, IndexedDB or server-storage
correctness. It does not require the existing author to have Playwright installed.

Measured on 2026-10-18 with Playwright 1.64.0/Chromium on macOS, Node 22.16.0.
The operator used six matching runtime files from the pinned revision; it did
not perform a full checkout or run an upstream test suite. Only our test and
metadata are distributed here; the upstream application is not bundled.
