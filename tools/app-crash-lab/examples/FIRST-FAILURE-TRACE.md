# A failed Playwright run without a trace

`trace: 'on-first-retry'` records the first **retry**, not the original attempt.
With no retries configured, a failed local test can leave no `trace.zip`.
Before rerunning the failure, use `--trace on` to capture that next run.
It cannot recover a trace of an earlier, unrecorded attempt.

This is a runnable diagnostic example alongside App Crash Lab. It uses a
deliberately wrong assertion and no application server or real records.

## Reproduce in an empty directory

Node 22+ and npm. Install the pinned test runner and Chromium:

```sh
npm install --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright install chromium
```

Save `playwright.config.mjs`:

```js
export default {
  testDir: '.',
  testMatch: 'trace.spec.mjs',
  workers: 1,
  reporter: 'line',
  use: { trace: 'on-first-retry' },
};
```

Save `trace.spec.mjs`:

```js
import { test, expect } from '@playwright/test';

test('seeded failure after a visible render', async ({ page }) => {
  await page.setContent('<h1>Saved note</h1>');
  await expect(page.getByRole('heading')).toHaveText('Deliberately wrong', {
    timeout: 100,
  });
});
```

Run these separately. Both are **expected to fail with exit code 1**:

```sh
npx playwright test --config playwright.config.mjs --output original-results
```

```sh
npx playwright test --config playwright.config.mjs --trace on --output traced-results
```

| Run | Assertion result | Trace ZIPs |
| --- | --- | --- |
| `on-first-retry`, retries omitted | expected FAIL | 0 |
| Same test with `--trace on` | expected FAIL | 1 |

Observed on 2026-10-11 with macOS arm64, Node 22.16.0 and Playwright 1.64.0.
The retained ZIP contained browser actions and the actual `setContent` call;
we checked its contents, not only the filename. This is not a Windows or
Dev Container execution result.

Open the trace using the exact path printed by the second run:

```sh
npx playwright show-trace traced-results/trace-seeded-failure-after-a-visible-render/trace.zip
```

For a suite that intentionally retries, configure retries and keep
`on-first-retry` if a retry trace is what you need. The first attempt and its
retry may behave differently; a retry trace is not evidence of what happened
in the original attempt. The [official trace guide](https://playwright.dev/docs/trace-viewer-intro)
explains both the retry setting and the `--trace on` override.

## When using App Crash Lab

The [App Crash Lab CLI](../README.md#keep-the-evidence-rerun-the-test) starts tracing for each check and
saves `reload.trace.zip` or `rejected-update.trace.zip` when the check completes.
Those files describe that CLI run. The exported standalone Playwright replay
and its attached state diff are separate outputs; the example above demonstrates
Playwright's trace setting with its ordinary `page` fixture.

The CLI checks whether explicitly selected saved values survive reload or a
rejected update. [Try a browser-only example](https://aichance.github.io/business-ai-recipes/test-the-test.html)
or [run it on your local app](../README.md#check-your-app). A trace helps explain
a failure; choosing the right observations determines which failures a test
can detect.

日本語：`on-first-retry` は初回失敗ではなく「最初の再試行」を記録します。
再試行しないローカル実行では ZIP が残らないため、次の実行を記録したい場合は
`--trace on` を付けます。上の故意に失敗するテストで、ZIP が0件→1件になることを
確認できます。既に終わった実行のトレースを後から復元する機能ではありません。
