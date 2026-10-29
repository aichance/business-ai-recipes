# Playwright State Lens 0.1.0-experimental.1

Put explicitly selected application storage beside your normal UI steps.
The local HTML shows the viewport, selected localStorage/IndexedDB values and
field differences at each checkpoint, including failed actions.

This is an observation helper, not an automatic correctness checker. Standard
Playwright Trace and `storageState({ indexedDB: true })` already capture valuable
evidence; this experiment tests whether selecting and aligning it reduces work.

[Replay the measured example](https://aichance.github.io/business-ai-recipes/state-lens.html)
or [read the comparison and limits](../../docs/state-lens-results.md).

## Add it to your existing Playwright test

From your app's project directory, with Node22+ and Playwright already installed:

```sh
npm install --save-dev https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.1.0-experimental.1.tgz
```

This updates that project's package files. No account, model or API key is needed.
In your existing test, after opening your app, choose a storage key you know:

```js
import { createStateLens } from '@aichance/playwright-state-lens';

const lens = createStateLens(page, {
  probes: [{ name: 'draft', source: 'localStorage', key: 'app-draft', json: true }],
});
try {
  await lens.step('Save draft', async () => {
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Saved', { exact: true }).waitFor();
  });
  await lens.step('Reload', () => page.reload());
  // Keep your existing Playwright assertions here.
} finally {
  const path = testInfo.outputPath('state-lens.html');
  await lens.writeHTML(path);
  await testInfo.attach('selected-state', { path, contentType: 'text/html' });
}
```

Keep your normal Playwright assertions. The `finally` block attaches the report
when those assertions fail too. Write the report once per test. The complete runnable
[consumer example](examples/consumer.spec.mjs) shows the `try`/`finally` placement.

For IndexedDB, select a known database/store/key:

```js
{ name: 'draft', source: 'indexedDB', database: 'notes', store: 'drafts', key: 'current' }
```

## Run the bundled example

In a **source checkout**, use `npm ci --ignore-scripts`. In an **extracted tgz**,
use `npm install --ignore-scripts` instead: npm's tarball intentionally omits the
lockfile. Both use the pinned development dependency. Then:

```sh
npx playwright install chromium
npm test
npm run test:consumer
npm run demo
```

The demo prints a new output directory containing broken/normal reports and
standard Playwright comparisons. Open `reload-loss-state-lens.html` there.
The consumer example
uses the ordinary Playwright test runner and attaches its local HTML report.
Requires Node22+, an existing Playwright browser,
and Chromium for the measured IndexedDB behavior. Tested with Playwright1.64.0;
other versions/browsers are not verified. The library does not import Playwright
or require an API key; the caller provides its existing `page`.

## Limits

- Up to16 selected probes. localStorage may be raw text or parsed JSON; IndexedDB
  keys are string/finite number and values must be plain JSON, depth<=12, <=64KiB.
- Probes and the screenshot are sequential observations, not one atomic snapshot,
  commit timestamps, cause proof or a guarantee of persistence.
- Missing databases/stores, unsupported values and failed reads are
  `INCONCLUSIVE`. A successfully observed missing key is different.
- The IndexedDB existence check requires `indexedDB.databases()`. If the selected
  database disappears during open, creation is aborted. No write transaction is
  used by the observer. App actions may write their own data as usual.
- Do not run overlapping lens steps. Navigation/action failures are recorded and
  rethrown. Await application readiness within your action when needed.
- A lens binds to its first HTTP(S) origin. Other origins are not probed or
  screenshotted and are marked INCONCLUSIVE; comparisons reset across origins.
  Use a separate lens for another application. Origin and scope are visible.
- The report includes selected app data and viewport screenshots. It is local,
  has no upload or telemetry, and must be reviewed before sharing. Synthetic
  comparisons are separate from independent users running their own apps.
- Experimental development package; no independent adoption or measured
  developer time savings has been established.

## Try it on your own app

Pick an existing save/reload test and select one known localStorage key or
IndexedDB database/store/key. Wrap its existing actions with `lens.step`, keep
its existing assertions, then open the attached HTML. A useful result tells you
which selected value changed between those actions. It does not diagnose every
store or replace the application's persistence contract.

Feedback that helps: package version, whether it was your own app or the bundled
demo, the workflow you used it for, whether the HTML helped compared with your
usual trace, and any setup blocker. A short sanitized summary is enough; raw
app data, source, screenshots and traces are not required.
[Report a result or blocker](https://github.com/aichance/business-ai-recipes/issues/new?title=%5BState%20Lens%5D%20Own-app%20trial).
