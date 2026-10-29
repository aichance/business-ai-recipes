# Use State Lens in your existing Playwright test

Requires Node22+, an existing Playwright test project and its browser. The
library adds selected localStorage/IndexedDB observations and screenshots to
your own UI steps. Your existing assertions still decide correctness.

## Copy one versioned file

1. [Download state-lens-v0.1.0-experimental.1.mjs](https://aichance.github.io/business-ai-recipes/state-lens-v0.1.0-experimental.1.mjs) and its [SHA256](https://aichance.github.io/business-ai-recipes/state-lens-v0.1.0-experimental.1.mjs.sha256).
2. Read the file, then place it next to an existing Playwright test. Keep an
   existing file instead of overwriting it. The file contains its MIT license
   and the same implementation as the common 0.1.0-experimental.1 package.
3. Import it **in the Node-side test**, not in your app's browser bundle:

```js
import { createStateLens } from './state-lens-v0.1.0-experimental.1.mjs';
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

The [original common tgz](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.1.0-experimental.1.tgz)
and [checksum](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.1.0-experimental.1.tgz.sha256)
are unchanged. Its source belongs to release commit
`735d00c71af54e3aa6c0ead70c81bdcec726825f`. It includes tests, the demo app and
the library. npm setups that permit URL dependencies can use its README's
package install command. [npm12 defaults to refusing remote URL dependencies](https://docs.npmjs.com/cli/using-npm/config/#allow-remote).
The one-file route avoids changing that setting. It preserves the complete
library behavior; it is not a separate checker for each app.

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
