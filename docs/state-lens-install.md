# Use State Lens in your existing Playwright test

Requires Node22+, an existing Playwright test project and its browser. The
library adds selected localStorage/sessionStorage/IndexedDB observations and screenshots to
your own UI steps. Your existing assertions still decide correctness.

## Try with your coding agent

Paste the request below into an agent already authorized to work on your app.
It asks for one existing test, the same public library and a local report.
Review the resulting test diff before keeping it. This is an optional setup
recipe, not an autonomous installer or a promise of compatibility/time saving.
For manual setup, [copy the versioned file](#copy-one-versioned-file).

```text
Add State Lens to ONE existing Playwright save/reload test in this project.
Follow the project's instructions and preserve its current test runner.

1. Inspect the relevant test and storage implementation. Do not read secrets,
   browser profiles, user databases or unrelated projects. Confirm Node22+
   and an existing Playwright installation/browser. Run the selected original
   test and record its command/exit result. If prerequisites or a suitable
   browser-persisted workflow are missing, report that blocker and stop;
   do not upgrade dependencies or substitute the library's demo.

2. Use the common MIT 0.3.0-experimental.1 module:
   https://aichance.github.io/business-ai-recipes/state-lens-v0.3.0-experimental.1.mjs
   Expected SHA256:
   31c563caf9a7cac9ce7dc5aae7b9906ba1d7888ae01f14867b283243884f1025
   Review it and verify the bytes before importing it in the Node-side test.
   Save it beside the test without overwriting an existing file. Do not
   change npm settings, package metadata, app code or the existing test data.

3. Select ONE known localStorage/sessionStorage key or IndexedDB database,
   store and key already exercised by that test, using its synthetic data.
   Raw storage text is allowed; use json:true only for known JSON text.
   IndexedDB records must be plain JSON plus explicit undefined, depth<=12,
   <=64KiB including metadata. If unsupported, report the limit and stop.

4. Create one lens for the existing Page. Wrap its existing UI actions in
   lens.step, keeping all readiness waits INSIDE each step callback and
   preserving the original assertions. In finally, write HTML once before
   the existing browser cleanup; attach it with testInfo when available,
   otherwise write to a new output directory. Keep the ordinary Trace.
   Reference: https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-install.md

5. Rerun that same test. Report the library/Node/Playwright versions, command,
   original and instrumented exit results, changed files, local HTML path,
   and whether the selected differences add anything to the normal Trace.
   A failed original assertion must stay a failure; INCONCLUSIVE is not PASS.
   Do not publish source, app data, screenshots or the report. Do not count
   a demo, --help or an operator-run fixture as use in my real project.
```

This request deliberately leaves your app's labels, keys and test command to
its existing code. It does not generate a replacement app or a per-user fork
of the helper. If your normal Trace is already sufficient, that is a useful
result too. The manual sections below cover both Playwright Test and plain
Playwright/`node:test`.

## Copy one versioned file

1. [Download state-lens-v0.3.0-experimental.1.mjs](https://aichance.github.io/business-ai-recipes/state-lens-v0.3.0-experimental.1.mjs) and its [SHA256](https://aichance.github.io/business-ai-recipes/state-lens-v0.3.0-experimental.1.mjs.sha256).
2. Read the file, then place it next to an existing Playwright test. Keep an
   existing file instead of overwriting it. The file contains its MIT license
   and the same implementation as the common 0.3.0-experimental.1 package.
3. Import it **in the Node-side test**, not in your app's browser bundle:

```js
import { createStateLens } from './state-lens-v0.3.0-experimental.1.mjs';
```

There is no additional npm installation, account, model or API key. Your
existing Playwright installation remains necessary.

## Wrap existing actions and keep assertions

After your existing test has opened its app and awaited its normal ready state:

```js
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
  // Keep your existing final assertions here.
} finally {
  const path = testInfo.outputPath('state-lens.html');
  await lens.writeHTML(path);
  await testInfo.attach('selected-state', { path, contentType: 'text/html' });
}
```

`Saved` and `Ready` illustrate the authored example's labels. Use your app's
known key, UI labels and existing readiness conditions. Keep the readiness wait
**inside the step callback**: the after-observation happens when that callback
returns. Waiting only after `lens.step` can leave a pre-ready state in the report.
`page` and `testInfo` come from your existing Playwright test. Write the report once.
For IndexedDB, a probe selects a known record:

```js
{ name: 'draft', source: 'indexedDB', database: 'notes', store: 'drafts', key: 'current' }
```

[The complete consumer example](../tools/playwright-state-lens/examples/consumer.spec.mjs)
uses the same implementation with an authored local fixture. The example's
fixture import is for its demo app; it is not required in your own test.

### Plain Playwright or `node:test`

Keep your existing test runner. The library accepts the same Playwright `page`
and does not require `testInfo`. Use the same probes and steps above; in your
existing `finally`, write the HTML before the test's normal browser cleanup.
Reuse or add these Node built-in imports at the top of that test file:

```js
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
```

Replace the `testInfo.outputPath` / `testInfo.attach` lines in the `finally`
block with:

```js
const reportDir = await mkdtemp(join(tmpdir(), 'state-lens-'));
const reportPath = join(reportDir, 'selected-state.html');
await lens.writeHTML(reportPath);
console.log('State Lens report:', reportPath);
```

This creates a fresh output directory instead of overwriting an earlier
report. Your existing assertions and browser lifecycle stay in the test.

## Common package alternative

The [current common tgz](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.3.0-experimental.1.tgz)
and [checksum](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.3.0-experimental.1.tgz.sha256)
contain the same0.3.0 library, tests, demo and examples. npm setups that permit
URL dependencies can install it as a development dependency, changing their
package metadata. npm12 may refuse remote URL dependencies; the one-file route
avoids changing that setting. It is the same common library for each app.
The [previous0.1.0 file](state-lens-v0.1.0-experimental.1.mjs) and its recorded
native-case reports remain unchanged.

## Tab-specific sessionStorage

Version0.3.0 also accepts `source: 'sessionStorage'` with a string key. Add
`json: true` for JSON text and omit it for a raw string. Create one lens per
existing Playwright Page; it does not synchronize or restore tabs.
[Example, browser checks and limits](state-lens-session-storage.md).

## Optional fields in IndexedDB

Version0.2.0 accepts plain records/dense arrays with explicit `undefined` values.
The JSON report uses annotated null placeholders and a separate `undefinedPaths`
list so `undefined`, stored null and absent fields remain distinct. `report()`
now emits schema2 and `libraryVersion`; account for that if parsing the report
programmatically. [Exact representation, synthetic checks and limitations](state-lens-undefined.md).
The64KiB limit counts UTF8 JSON bytes including undefined metadata; Date/Map/Set,
BigInt, cycles, sparse/extended arrays and depth>12 remain INCONCLUSIVE.

## Read the result

`COMPLETED` is action completion, not PASS. Inaccessible/unsupported data stays
INCONCLUSIVE. Snapshots are sequential observations, not commit timestamps or
proof of cause. The report includes selected data and screenshots and remains
local unless shared. Reads and screenshots add work and can change timing,
including app timers and races. [An existing plain-Playwright integration and
its recorded conditions](state-lens-nvim-native.md). [Scope and measured controls](state-lens-results.md).

If you try it, report the version, your workflow, whether it was your own app,
how you found it, and whether the report helped compared with your normal trace.
No private source or raw app data is needed. [Result or setup blocker](https://github.com/aichance/business-ai-recipes/issues/new?title=%5BState%20Lens%5D%20Own-app%20trial).
