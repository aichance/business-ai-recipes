# Keep the current reduced-motion choice when persistence fails

One original [Vitest spec](reduce-motion.persistence.test.ts) for [keroway/astro-blog #907](https://github.com/keroway/astro-blog/issues/907). Copy the **single test file** next to `src/scripts/reduce-motion.ts` in a disposable checkout. It imports the actual local module and Vitest only; no App Crash Lab package, API, account, app server or browser is required.

```sh
pnpm test:unit src/scripts/reduce-motion.persistence.test.ts
```

Use the repository's existing locked dependencies. The measured versions were Node 22.16.0, Vitest 4.1.11 and happy-dom 20.11.2. Its existing Vitest include pattern discovers this filename and its `test:unit` script sets `NODE_OPTIONS=--no-experimental-webstorage`. We verified a minimal isolated copy using the unchanged upstream Vitest config and only these two test dependencies; we did not install/build the whole Astro application or execute its complete pnpm suite.

## Measured outcome

Against unchanged [`f5f6e148`](https://github.com/keroway/astro-blog/tree/f5f6e1489df411496225b979c248beb85468cbca) on 2026-10-20:

| Check | Result |
| --- | --- |
| Existing `reduce-motion.test.ts` | 15 PASS |
| New spec, successful writes | 6 PASS |
| New spec, injected failed writes | 6 FAIL: the most recent manual choice is replaced by the stale persisted choice |
| New spec against a temporary memory-retention sensitivity control | 12 PASS |

The 12 combinations are unset→ON, saved ON→OFF and saved OFF→ON, each with OS reduced motion on/off and writes succeeding/failing. The check compares the manual choice, effective reduced-motion state, `kw-anim`, persisted value and attempted write. A second same-document sync must preserve the choice too. Current failures occur at the immediate state assertion; they do not separately prove a later navigation failure.

A failed run is intentional evidence of the existing issue, **not an expected-failure annotation**: assertions keep the desired healthy behavior and can be rerun unchanged after a fix. The existing suite currently asserts that the failed ON write removes the setting; it will need a deliberate expectation update when the bug is fixed. The temporary control demonstrates test sensitivity and is not a proposed or reviewed production patch.

The new spec took 0.725s wall time after dependencies were installed in the isolated check; setup/installation time is excluded. [Exact source/spec hashes, individual outcomes and limitations](RESULTS.json).

`QuotaExceededError` is injected at the Storage interface and OS settings are stubbed. This does not establish real-browser quota exhaustion, storage persistence across reloads, Astro navigation, visual animation, accessibility conformance or third-party adoption. No user data is involved.

AI-assisted original test under a human owner's responsibility. MIT under the [repository license](../../../../LICENSE). No upstream implementation is redistributed. [More standalone failure tests](../../README.md).
