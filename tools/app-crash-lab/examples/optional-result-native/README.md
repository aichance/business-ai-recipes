# Completed output must survive optional session-storage failure

Copy **one [Playwright spec](optional-result.spec.mjs)** into a test suite. Its synthetic PDF and complete two-table/three-row response are embedded; there is no custom App Crash Lab runner or JSON contract to install.

This is an application-specific example of App Crash Lab's optional-history/output check. It uses the real, unchanged StatementXL frontend at [`story-has-you/bank-statement-converter@18223dcf`](https://github.com/story-has-you/bank-statement-converter/tree/18223dcf572e535cab74551dbec96c616fdc0046), following the author's [issue #33](https://github.com/story-has-you/bank-statement-converter/issues/33). Adapt the actions, result shape, exact storage key and expected output for another app.

## Measured behavior

Operator measurement on 2026-10-20 JST, Node 22.16.0, Playwright 1.64.0 and the app's Next.js 16.3.6 development server:

| Check | Affected pin |
| --- | --- |
| Normal completion: complete saved payload, whole JSON download, actual new-document reload, unchanged saved bytes and second whole JSON download | PASS |
| Synthetic server-error response: error stays visible, no result write or export | PASS |
| Successful response, then only the result's `sessionStorage.setItem` throws `QuotaExceededError` | FAIL at `PRESERVATION` |

The failed case first confirms **one actual result-write attempt, one rejection, the complete expected serialized payload, and no saved result**. The app then reports that conversion did not complete and removes the download entry, although its real stream reader accepted the same synthetic completion as the passing control. This is loss of access to the current output, not proof of corruption of an earlier saved record.

The normal reload accepts the app's existing `beforeunload` prompt and checks a different document marker. Seeing the old page again is insufficient. Both JSON downloads are parsed and compared against every original field, including both tables, all three rows, Unicode values, source coordinates and summary counts.

Keep the rejection test as an ordinary assertion: exit 1 is expected on this affected pin, with **2 pass / 1 fail / 0 skipped**. A setup timeout is not the regression. After a fix, all three tests should pass.

## Run

1. Start a disposable checkout of the pinned app without deployment credentials. Install its own locked dependencies as usual. Our measurement used `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile` and started its existing Next.js binary directly, so no parser, authentication or payment service was needed:

   ```sh
   node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000 --webpack
   ```

   Wait for the existing `/ja` and `/ja/result` routes to be ready. The spec uses the app's Japanese UI; it does not change the locale configuration. Cold compilation must finish before interpreting test results.

2. Put the single spec in an **existing Playwright suite** and run it against that local server. Use its configured test directory/file pattern. For example, with Playwright installed in the current directory and no additional config:

   ```sh
   BANK_STATEMENT_BASE_URL=http://localhost:3000 \
     npx playwright test optional-result.spec.mjs --workers=1 --reporter=list
   ```

   If the app has no Playwright setup, keep its dependencies unchanged and reuse the dependency already packaged in a separate App Crash Lab checkout:

   ```sh
   git clone https://github.com/aichance/business-ai-recipes.git app-crash-lab-examples
   cd app-crash-lab-examples/tools/app-crash-lab
   npm ci --ignore-scripts
   # Only if this Playwright installation has no Chromium yet:
   npx playwright install chromium
   BANK_STATEMENT_BASE_URL=http://localhost:3000 \
     npx playwright test examples/optional-result-native/optional-result.spec.mjs --workers=1 --reporter=list
   ```

   The check still runs as plain Playwright. It needs Playwright and Chromium; it does not run the App Crash Lab CLI or add test dependencies to the target app.

3. Retain the JSON attachments, including final diagnostics. They record the actual write, complete payload, raw storage, UI, browser errors and request counts. Two quota checks are expected: file-selection preflight and submit-time revalidation. Exactly one conversion request is fulfilled; unknown API requests and external browser requests are blocked.

## Scope

The real frontend receives a **mocked quota response and synthetic SSE result**. The one-page PDF contains no financial records, and the synthetic response is not claimed to have been parsed from it. This tests current-page delivery, the real storage boundary, JSON export and normal reload. It does not verify actual PDF parsing, all export formats, production billing, real browser quota exhaustion or recovery after a denied save.

Browser request interception does not sandbox the app server. Use a disposable local app with no real service credentials. An operator's measurement is separate from an app author's independent rerun.

The spec and synthetic fixtures are original App Crash Lab material under the repository's [MIT license](../../../../LICENSE). No upstream application source is redistributed here.
