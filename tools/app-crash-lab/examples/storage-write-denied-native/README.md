# Does a failed save tell the user?

**One normal-save control, one deliberately rejected write.** This
[109-line native Playwright test](write-denied.spec.mjs) checks that a save
failure leaves the previous complete ledger intact and shows a specific visible
error. It uses `@playwright/test` and Node built-ins, without App Crash Lab's
runner, JSON contract or generated protocol.

The measured app is [Kinetic Curator](https://github.com/NeuralIO444/Kinetic_Curator)
at [`b086c9b0`](https://github.com/NeuralIO444/Kinetic_Curator/tree/b086c9b02835c3413fa5f65eccde286bf678c9e0),
version 0.9.0. Its normal control saves two complete keep records and preserves
them after reload. Under an injected exact-key `QuotaExceededError`, the previous
ledger stays intact, but the test fails because no matching visible save-error
notice appears. This is a synthetic write failure, not a claim that a user's
device ran out of storage. See [RESULTS.json](RESULTS.json).

## Copy into an existing Playwright suite

Review and save `write-denied.spec.mjs` as, for example,
`tests/e2e/save-failure.spec.mjs`. Start a disposable local app and run it with
the suite's installed Chromium project:

```sh
STORAGE_APP_URL='http://127.0.0.1:54195/Kinetic_Curator/?boot=factory' npx --no-install playwright test tests/e2e/save-failure.spec.mjs
```

Your suite must include `.spec.mjs` in its `testMatch`. The verified environment
is Node 22.16.0, Playwright 1.64.0 and Chromium on macOS; other environments and
the app's own older Playwright version have not been verified.

Before using another app, change these app-specific parts together:

| Part | Adaptation |
| --- | --- |
| Entry and storage | Local URL and exact localStorage key; this example stores newline-separated JSON keeps |
| Normal actions | The actual UI steps that create a first saved record and attempt a second save |
| Baseline/control | Replace the fixed seed, recipe and timestamp checks with your complete record's validity checks |
| Failure feedback | A locator and text for your app's visible save-error notice, not a console warning or generic toast |

The first record must really persist before injection. The normal control must
still save two valid records and survive reload. The denied case must prove the
ordinary UI actually attempted the targeted write; otherwise it fails with
`PRECONDITION`, rather than reporting missing feedback as a product bug.

## Run the measured pin separately

In a disposable checkout of the pinned Kinetic Curator source, inside `app/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run preview -- --host 127.0.0.1 --port 54195 --strictPort
```

Use the production preview. This check does not need the development-only unit
endpoint, a provider API, an account or real user data. In a second terminal,
use the [standalone ZIP](https://aichance.github.io/business-ai-recipes/app-crash-lab-storage-write-denied-native-v0.1.0.zip)
and [SHA-256 checksum](https://aichance.github.io/business-ai-recipes/app-crash-lab-storage-write-denied-native-v0.1.0.zip.sha256).
Inside its extracted example folder:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm test
npm run controls
```

On this pin, `npm test` exits **1**: the normal control passes and the denied-save
test fails with `FEEDBACK`. `npm run controls` exits **0**. These are our
AI-assisted operator tests, separate from maintainer execution or a verified
upstream fix.

## Scope of the injection

- A fresh empty browser context is used for each test, even if the surrounding
  suite defines a saved storage state. Only an HTTP loopback app origin without
  URL credentials is accepted; other HTTP origins and service workers are blocked.
- Only `Storage.prototype.setItem` for **this exact localStorage key in the
  current document** is denied. Other keys delegate to the original method;
  retry attempts on the target key stay denied. The original descriptor is
  restored in `finally`, then the disposable context closes.
- The full previously stored raw ledger is checked over a 1000 ms window at
  roughly 75 ms intervals. Observed corruption stays a failure even if later
  repaired. Unobserved instants and later writes are outside this measurement.
- A visible matching DOM error is required during that window. A correct app
  may roll back its optimistic UI. Native dialogs fail as an unsupported
  precondition; IndexedDB, server writes, real disk exhaustion and navigation
  during the fault are outside this example.

If you adapt it, report the app/version, protected saved record, changed actions
and notice, and the result or first setup blocker. An operator's execution on
your behalf is recorded separately from your own execution.
