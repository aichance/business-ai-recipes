# Did the failure happen before your test passed?

日本語: 「失敗後も入力が残る」ことを調べるなら、入力値だけでなく、**失敗が完了したこと**も確認します。ボタンのクリック完了と、非同期処理の失敗完了は別です。

This synthetic example holds a failed generation response until the test explicitly releases it. A broken failure handler erases the input. Checking the input immediately after clicking passes while the operation is still pending.

## Download only this example

[Download the six-file ZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/app-crash-lab-failure-boundary-example.zip) · [SHA-256](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/app-crash-lab-failure-boundary-example.zip.sha256)

Extract it, open a terminal **inside `app-crash-lab-failure-boundary-example`**, and run these commands with Node 22+ and npm:

```sh
npm ci --prefix . --ignore-scripts
npx playwright install chromium
npm test
```

The ZIP contains the spec, config, this README, a pinned package/lockfile and the MIT license. Dependencies and Chromium are downloaded during setup. No repository checkout or application server is needed. Linux may additionally need [Playwright browser system dependencies](https://playwright.dev/docs/browsers#install-system-dependencies).

**Expected:** the summary says `3 passed`, including the intentionally expected failure. To see the actual `passed / failed / passed` statuses, use `npm test -- --reporter=json`. A normal `npm test` exit code of 0 means all three controls behaved as expected; it does not mean the broken UI retained its input.

This is a supplemental exercise archive on the existing release, not a new version of the App Crash Lab runtime.

## Run from the full repository

From the `tools/app-crash-lab` directory of this repository, with Node 22+:

```sh
npm ci
npx playwright install chromium
npx playwright test --config=examples/failure-boundary/playwright.config.mjs
```

Or copy this directory into a project that already has `@playwright/test` 1.64.0 and Chromium, then run its config. The UI and HTTP 422 are supplied by Playwright routes; no application server, account, real video generation or external endpoint is used. Other requests are blocked. The example does not change your app.

| Case | Observation | Expected result |
| --- | --- | --- |
| Broken UI, immediate input check | Input still exists while response is held; it is empty after the failed response | Test passes, proving the premature PASS |
| Broken UI, wait for exact failure message first | Failure has completed and input is empty | Expected assertion failure |
| Fixed UI, same failure and same final assertion | Failure has completed and input is retained | Pass |

With Playwright 1.64.0, the line reporter summarizes this as **3 passed** because the deliberate failure is marked as expected. The JSON reporter shows actual statuses `passed / failed / passed`, with expected statuses `passed / failed / passed` and zero unexpected results. The middle case is a detected fault, not a successful input-retention check. Setup and failure-message checks run before the expected-failure annotation, so an unrelated setup failure is not accepted as the counterexample. An `ordering` attachment in the first test records when the response was held, when the weak assertion passed, and when the handler cleared the input. No fixed sleep decides the ordering.

To inspect those statuses directly, use the same command with `--reporter=json`.

## The missing boundary

This is not enough to show what happens *after* generation fails:

```js
await page.getByRole('button', { name: 'Generate' }).click();
await expect(page.getByRole('textbox', { name: 'Script' }))
  .toHaveValue('approved message');
```

In this synthetic app, first wait for the exact failure signal:

```js
await page.getByRole('button', { name: 'Generate' }).click();
await expect(page.getByRole('status')).toHaveText('Generation failed');
await expect(page.getByRole('textbox', { name: 'Script' }))
  .toHaveValue('approved message');
```

Use your real app's signal, not the example's selector or message. A network error alone is not proof that the UI has processed it. If a message can belong to an older request, correlate it with the current operation. If the app can mutate again after the message, the observation window needs to cover that behavior too.

App Crash Lab's [rejected-update contract](https://github.com/aichance/business-ai-recipes/blob/main/tools/app-crash-lab/CONTRACT.md#rejection-is-a-separate-condition) similarly checks a separate rejection signal before comparing the previously saved state. This exercise checks an editable draft; the tool normally compares saved/domain data. They are different invariants, with the same need to identify the completed failure first.

This example was prompted by the explanatory Playwright snippet in [Diiiii's QA design note](https://qiita.com/Diiiii/items/13087d2d7bc358a2f76d). The page explicitly labels its selectors as illustrative. We have not inspected or tested the linked vendor's implementation and make no claim about a real defect there. The synthetic fixture and this verification were made by the AI-operated aichance project.
