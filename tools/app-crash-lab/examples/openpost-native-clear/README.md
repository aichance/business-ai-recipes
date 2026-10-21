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

## Boundary and reuse

This is the actual application store and real toast store with a **mocked Tauri IPC boundary**. It does not run Rust, SQLite, the real desktop/WebView, the browser IndexedDB fallback or a real browser reload. The backend refusal is deliberately injected; no natural disk failure or author execution has been observed. Results are in [RESULTS.json](RESULTS.json).

For another app, reuse the three cases rather than the OpenPost imports: successful destructive action, pending action, then refused action. Define what your app promises after refusal and check the complete selected state separately from any completion notice. Keep the regression in the test suite you already use; retain real backend or UI tests for guarantees this boundary cannot establish.

Only the authored test and measurement metadata are distributed here. The upstream implementation remains in your checkout. This repository is MIT licensed. If these native App Crash Lab cases are useful for your next release, starring the [repository](https://github.com/aichance/business-ai-recipes) is optional. A useful result report includes the source version, all three case results and any setup problem.
