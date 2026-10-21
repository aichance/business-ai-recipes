# A refused DELETE should preserve the complete inventory

**One native Playwright file; all three checks pass on the measured Stockroom source.** Copy [delete-completion.spec.js](delete-completion.spec.js) into the app's existing `tests/e2e/` directory. It checks the real browser, Spring Boot API and disposable in-memory H2 database. No App Crash Lab runner or additional test dependency is required.

This is a working failure-handling example, not a reported product defect. The app already has eight Chromium tests, including a refused POST and a successful deletion. This file adds a paused DELETE, a refused DELETE and retry, with complete record comparisons rather than counts alone.

| Added case | Measured result |
| --- | --- |
| Successful DELETE | PASS: only the selected record disappears; every other field survives reload |
| DELETE held at the browser boundary | PASS: all records remain, the dialog stays busy and no deletion-success notice appears; releasing the request completes the real deletion |
| Browser returns HTTP 503 for that DELETE | PASS: all records remain, the dialog explains failure and no success is announced; cancel, reload and a real retry delete only the selected record |

## Run it in Stockroom's existing suite

The measured app is [mikoto2000/spring-boot-jquery-playwright-demo](https://github.com/mikoto2000/spring-boot-jquery-playwright-demo), pinned to [`4d0f7613`](https://github.com/mikoto2000/spring-boot-jquery-playwright-demo/tree/4d0f76130fcd5d97ca38956ca2a5e4fca8ac2a41). Use a disposable checkout of that pin. We used macOS, Temurin JDK 21.0.7, Node 22.16.0, Maven Wrapper 3.9.11 and locked Playwright 1.64.1.

Review the linked test and save it as `tests/e2e/delete-completion.spec.js`. In that app directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run test:e2e -- tests/e2e/delete-completion.spec.js
```

Expected result: **3 passed, 0 skipped, exit 0**. Then run the existing and added tests together:

```sh
npm run test:e2e
```

Expected result: **11 passed, 0 skipped, exit 0** on the measured pin. The actual combined run took **10.58 seconds**, including application startup with already-cached Maven dependencies. First-time dependency downloads and compilation are additional work; the separate original eight-test baseline took 51.58 seconds. These are individual runs, not a speed comparison. [Exact results and hashes](RESULTS.json).

Keep the app's original `playwright.config.js`: one worker, `reuseExistingServer: false` and `http://127.0.0.1:18765`. It starts the `e2e` Spring profile and resets **synthetic demo records** before each test. Leave that port free. Do not repoint the reset call at a normal server or a database containing your data.

## What is observed independently

- Before each case, the real API must contain the three known demo records. IDs must be unique positive integers; name, category, quantity and status must match the expected fixtures.
- The DOM's four displayed fields must match those records. API comparisons include all five fields, including IDs. After success, every field of every non-target record must survive reload.
- While the exact DELETE is paused, a separate real GET must still return the entire baseline. The browser must show a busy, disabled dialog without a success notice. Releasing the request exercises the real backend DELETE.
- For refusal, only that browser DELETE receives a synthetic HTTP 503. A real API read and reload must preserve every baseline record. Removing the interception allows the application's ordinary retry to reach Spring Boot and H2.

All **30 original tracked files match the pinned Git blobs**; only this test was added. The archive's `mvnw.cmd` uses CRLF as required by upstream `.gitattributes`; only its declared line endings were normalized for Git-blob comparison. The original eight tests passed before the addition, the new three passed separately, and the combined eleven passed with no failures, skips or flaky retries.

The injected delay and HTTP 503 happen at the **browser request boundary**. They do not establish H2 rollback, disk durability, a server-originated 503 or recovery after process termination. The H2 database is real but disposable and in memory. Firefox, WebKit and other operating systems were not measured.

## Adapt the boundary to another app

Keep the three cases and full-record assertions. Replace the exact endpoint, fixture schema, UI actions, failure feedback and isolated reset setup together. A passing count with changed record contents is not preservation, and a dismissed dialog alone is not proof that deletion committed.

This file is authored under the repository's MIT license. The upstream application is not redistributed here. These are operator measurements; independent author execution, adoption and stars remain separate outcomes.
