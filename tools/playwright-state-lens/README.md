# Playwright State Lens 0.6.1-experimental.1

Put explicitly selected application storage beside your normal UI steps.
The local HTML shows the viewport, selected localStorage/sessionStorage/IndexedDB values and
field differences at each checkpoint, including failed actions.

This is an observation helper, not an automatic correctness checker. Standard
Playwright Trace and `storageState({ indexedDB: true })` already capture valuable
evidence; this experiment tests whether selecting and aligning it reduces work.

[Replay the measured example](https://aichance.github.io/business-ai-recipes/state-lens.html)
or [read the comparison and limits](../../docs/state-lens-results.md).

## Record your own app without writing a test

With Node20.19+ and Playwright/Chromium already installed, use the same package's
`capture.mjs` entry. Open your own app, perform its normal actions, and name the
checkpoints in your terminal. It records selected values and screenshots into a
new local HTML; it does not click Save, mutate storage, or assert correctness.
[Download and run the manual entry](../../docs/state-lens-manual.md).

## Add it to your existing Playwright test

From your app's project directory, with Node20.19+ and Playwright already installed:

Download the [versioned MIT file](https://aichance.github.io/business-ai-recipes/state-lens-v0.6.1-experimental.1.mjs) and its [SHA256](https://aichance.github.io/business-ai-recipes/state-lens-v0.6.1-experimental.1.mjs.sha256), review it, and place it beside your existing test without overwriting an older file. No additional npm dependency, account, model or API key is needed.
In your existing test, after opening your app, choose a storage key you know:

```js
import { createStateLens } from './state-lens-v0.6.1-experimental.1.mjs';

const lens = createStateLens(page, {
  probes: [{ name: 'draft', source: 'localStorage', key: 'app-draft', json: true }],
});
try {
  await lens.step('Save draft', async () => {
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Saved', { exact: true }).waitFor();
  });
  await lens.step('Reload', async () => {
    await page.reload();
    await page.getByText('Ready', { exact: true }).waitFor();
  });
  // Keep your existing Playwright assertions here.
} finally {
  const path = testInfo.outputPath('state-lens.html');
  await lens.writeHTML(path);
  await testInfo.attach('selected-state', { path, contentType: 'text/html' });
}
```

Use your app's existing labels and readiness waits in both callbacks.
Keep your normal Playwright assertions. The `finally` block attaches the report
when those assertions fail too. Write the report once per test. The complete runnable
[consumer example](examples/consumer.spec.mjs) shows the `try`/`finally` placement.

For plain Playwright or `node:test`, [use a fresh report directory on every run](../../docs/state-lens-install.md#rerun-without-replacing-a-report).
`writeHTML` does not replace an existing file: a reused path fails with `EEXIST`.
Keep prior reports; no deletion or library change is needed.

For IndexedDB, select a known database/store/key:

```js
{ name: 'draft', source: 'indexedDB', database: 'notes', store: 'drafts', key: 'current' }
```

## Fields inside large saved records

Version0.5.0 adds an optional RFC6901 `pointer` to one probe. For a JSON Web
Storage value, also use `json: true`. For example, `pointer: '/nodes/0/data/value'`
observes that value without exporting the rest of the saved document. The
64KiB output limit is unchanged. This is a partial observation, not evidence
that every field was retained. Keep your native assertions and Trace.

Schema4 keeps `exists` for the storage key and adds `selection.exists` for the
pointer. An absent path uses a null placeholder; a saved null has
`selection.exists: true`. Existing undefined/Date type paths are relative to
the selected value. Probes without a pointer keep their whole-value behavior.
[Configuration, bounds and the measured synthetic case](../../docs/state-lens-selected-fields.md).

## Tab-specific sessionStorage

Version0.3.0 adds `{ name: 'draft', source: 'sessionStorage', key: 'draft-key', json: true }`.
Omit `json: true` for raw text. Use a separate lens for each existing Playwright
`Page`, even when those pages share a BrowserContext and HTTP origin. The helper
observes the supplied page; it does not copy, restore or synchronize tab storage.
Keep your own reload/readiness/assertion steps. Missing values, saved JSON null,
and refused reads remain different observations. The existing size/depth limits
apply. [Usage and measured browser checks](https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-session-storage.md).

## Date values: report schema3

Version0.4.0 accepts valid Date values in a selected IndexedDB record. The JSON
projection stores their UTC ISO text and lists their RFC6901 pointers in
`datePaths`. A Date and a stored string with identical text stay distinct in
per-step differences. Records containing Date use
`valueEncoding: "json-with-type-paths-v1"`; mixed undefined values keep their
`undefinedPaths` annotations. An invalid Date remains INCONCLUSIVE. The observer
does not rewrite stored values or revive strings into Date.
[Native comparison, representation and limits](../../docs/state-lens-dates.md).
Earlier0.3 files remain available unchanged.

## Undefined fields: report schema2

Version0.2.0-experimental.1 records `quantity: undefined` without dropping the
field or changing stored data. The report is an **annotated JSON projection**:
`value.quantity` is a null placeholder, while `undefinedPaths: ["/quantity"]`
and `valueEncoding: "json-with-undefined-paths-v1"` identify its actual type.
A stored null has no undefined annotation; a missing field is absent in `value`.
Pointers use RFC6901 escaping (`~` becomes `~0`, `/` becomes `~1`); `""` means
the entire selected value. The HTML explains the projection beside its values.
This encoding was introduced in schema2. Current `report()` emits `schema: 4`
and `libraryVersion`; JSON consumers must handle the schema explicitly. The exported API is unchanged.
[Representation, synthetic checks and limitations](../../docs/state-lens-undefined.md).
The older0.1.0 files and recorded example reports remain available unchanged.

For npm environments allowing remote URL dependencies, the optional
[versioned tgz](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.6.1-experimental.1.tgz)
contains the same library, tests and examples. It changes package metadata if
installed. npm12 may reject remote dependencies; the one-file route needs no
npm setting change. When using the package, import from `@aichance/playwright-state-lens`.
Use this source README for current setup steps; published archives retain their
release-time documentation.

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
Requires Node20.19+, an existing Playwright browser,
and Chromium for the measured IndexedDB behavior. Operator checks include Node20.19.0/Playwright1.62.1 and Node22.23.4/Playwright1.64.0 on macOS. See [exact runtime checks and limits](../../docs/state-lens-runtime.md). An author [reports 0.2.0 use with Playwright1.63.0](https://bsky.app/profile/tomu963.bsky.social/post/3myzc4bivbw2c) on one own-app workflow; broader version/browser compatibility is unverified. The library does not import Playwright
or require an API key; the caller provides its existing `page`.

## Limits

- Up to16 selected probes. localStorage/sessionStorage may be raw text or parsed JSON; IndexedDB
  keys are string/finite number. Selected values may be plain JSON plus explicit
  `undefined` fields or dense-array slots and valid Date values, depth<=12,
  <=64KiB of UTF8 JSON including path metadata. Optional pointer selection
  has at most32 segments/2048 UTF8 bytes; JSON Web Storage input is capped at4MiB.
  IndexedDB still reads the named record inside the browser before selecting. Invalid Date, Map/Set/BigInt,
  cycles and sparse arrays remain unsupported.
- Probes and the screenshot are sequential observations, not one atomic snapshot,
  commit timestamps, cause proof or a guarantee of persistence.
- Missing databases/stores, unsupported values and failed reads are
  `INCONCLUSIVE`. A successfully observed missing key is different.
- The IndexedDB existence check requires `indexedDB.databases()`. If the selected
  database disappears during open, creation is aborted. No write transaction is
  used by the observer. App actions may write their own data as usual.
- Do not run overlapping lens steps. Navigation/action failures are recorded and
  rethrown. Await application readiness within your action when needed.
- For a deliberately held IndexedDB write, release the gate and await its commit
  before a checkpoint on that store. `lens.step` observes before its action,
  so wrapping the release can delay it until the read times out.
  [Measured placement example](../../docs/state-lens-held-writes.md).
- A lens binds to its first HTTP(S) origin. Other origins are not probed or
  screenshotted and are marked INCONCLUSIVE; comparisons reset across origins.
  Use a separate lens for another application. Origin and scope are visible.
- The report includes selected app data and viewport screenshots. It is local,
  has no upload or telemetry, and must be reviewed before sharing. Synthetic
  comparisons are separate from independent users running their own apps.
- Experimental development package. Tomu [reports own-app use and an
  updated-version rerun](https://bsky.app/profile/tomu963.bsky.social/post/3myzc4bivbw2c).
  A second author [reports 0.4.1 use on Sethera v2.0.0 under Windows](../../docs/state-lens-sethera-ownapp.md),
  including a qualitative Trace comparison and output/size limitations.
  These are author self-reports, not general compatibility tests; developer
  time saving has not been measured.
  The immutable 0.2.0 tarball README predates that later report; its library is
  unchanged. This source README contains the subsequent documentation update.

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

## TypeScript checks

Version0.4.1 adds explicit input JSDoc and optional matching declarations. Strict projects with `allowJs: false` can place `state-lens-v0.6.1-experimental.1.d.mts` beside the downloaded `.mjs`; package imports resolve `lens.d.mts` through the types export. [Measured blocker, setup and limits](../../docs/state-lens-typescript.md). Run `npm run test:types` for both declaration modes and the JSDoc-only consumer. These are development checks; the runtime has no additional dependency.
