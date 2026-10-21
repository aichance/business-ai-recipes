# Does “History Cleared” mean the clear succeeded?

Copy one [Vitest file](historyClearFailure.test.ts) into [OpenPost](https://github.com/azlanabdulla/OpenPost)'s existing suite. It calls the real history and toast stores, then refuses the Tauri `clear_history` IPC call. No App Crash Lab runner or new test dependency is needed.

On the [unmodified source pin](https://github.com/azlanabdulla/OpenPost/tree/4060be5f29384fe2a68a128dc8353db6f1429cbe), the rejected operation leaves the history store empty and still creates a **“History Cleared”** notice. Calling the original `loadHistory` path brings the full two-record fixture back from the unchanged mock backend. This is a false completion/state-consistency check, **not a claim of actual SQLite data loss**.

## Run it in your OpenPost checkout

Review [the test](historyClearFailure.test.ts), save it as `tests/historyClearFailure.test.ts` in your app checkout, and use its existing installed dependencies:

```sh
npm test -- tests/historyClearFailure.test.ts
```

We measured Node 22.16.0, locked Vitest 5.0.5 and the project's jsdom setup. Use a runtime supported by your installed dependencies; no desktop binary or Rust build is required for this store-level test. All request URLs and records are synthetic. The test sends no HTTP requests.

## Measured outcome

| Case | Original result |
| --- | --- |
| Successful clear, then original `loadHistory` | PASS; history remains empty |
| Clear request still pending | PASS; no completion notice yet |
| Clear request rejected | **FAIL**; visible store becomes empty and emits “History Cleared”; rehydration restores both complete records |

Expected on that pin: exit 1, **2 PASS / 1 FAIL / 0 skipped**. Both the full-history assertion and the false-notice assertion fail in the rejected case. The test continues to re-read the mock backend through the original load mapper; counts alone are not used as the preservation check.

The existing `historyStore` and `historyPanel` tests separately passed **12/12**, and `npm run typecheck` passed with the new file. The regression uses ordinary failing assertions, without `.fails`, skips or a weakened expected result.

A separate local diagnostic restored the previous entries and returned from the `clearHistory` catch block. The **same test file** then passed **3/3**. We restored the upstream source byte for byte afterward. That diagnostic is not a production fix: concurrent history updates, Undo and actual desktop persistence were not validated.

## Author adoption and fixed version

[OpenPost’s author incorporated this test and reports 3/3 passing](https://github.com/azlanabdulla/OpenPost/blob/447408e31e57377a48f52bd28d174e8d57ef2ee0/docs/ISSUE_10_RESPONSE.md) in fix [`447408e3`](https://github.com/azlanabdulla/OpenPost/commit/447408e31e57377a48f52bd28d174e8d57ef2ee0). The [upstream copy](https://github.com/azlanabdulla/OpenPost/blob/447408e31e57377a48f52bd28d174e8d57ef2ee0/tests/historyClearFailure.test.ts) changes only the attribution comment; all three cases and their assertions remain intact. This is a public author execution report, separate from our local reproduction.

We then ran the original file, unchanged, against the author’s fixed source using the same Node 22.16.0, locked dependencies and command above:

| Source | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| Affected `4060be5f` | 2 | 1 | 0 |
| Author fix `447408e3` | 3 | 0 | 0 |

The fixed store waits for successful backend completion before removing the selected history, and preserves it when the injected IPC clear is refused. The same three checks cover successful clear/re-read, no premature completion while pending, and full history preservation without a false completion notice after rejection. Use the pinned fix in a disposable checkout to compare this result with your installed version; the test is already included there.

The [CI run for the same fix](https://github.com/azlanabdulla/OpenPost/actions/runs/39571558327) completed successfully, including its Vitest step. Its job status is separate evidence from our three-case result. The author also describes Windows desktop and SQLite checks; we have not independently reproduced those checks and do not include them in our measurement.

## Boundary and reuse

This is the actual application store and real toast store with a **mocked Tauri IPC boundary**. It does not run Rust, SQLite, the real desktop/WebView, the browser IndexedDB fallback or a real browser reload. The backend refusal is deliberately injected; no natural disk failure is demonstrated by our test. The author’s independent execution report is linked above. Results are in [RESULTS.json](RESULTS.json).

For another app, reuse the three cases rather than the OpenPost imports: successful destructive action, pending action, then refused action. Define what your app promises after refusal and check the complete selected state separately from any completion notice. Keep the regression in the test suite you already use; retain real backend or UI tests for guarantees this boundary cannot establish.

Only the authored test and measurement metadata are distributed here. The upstream implementation remains in your checkout. This repository is MIT licensed. If these native App Crash Lab cases are useful for your next release, starring the [repository](https://github.com/aichance/business-ai-recipes) is optional. A useful result report includes the source version, all three case results and any setup problem.
