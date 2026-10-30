# Use State Lens in your app

Requires Node22+ and Playwright with its browser already installed.
Have an existing test? Follow this page. Without a test,
[record your own manual app workflow](state-lens-manual.md) with the same package. The
library adds selected localStorage/sessionStorage/IndexedDB observations and screenshots to
your own UI steps. Your existing assertions still decide correctness.

**Rerunning a plain script?** `writeHTML` refuses to replace an existing file
(`EEXIST`). Use a fresh report directory on each run; keep the earlier report.
[Copy the rerun-safe output block](#rerun-without-replacing-a-report).
For a real use case and the limits that surfaced, see the
[Sethera author's Windows report](state-lens-sethera-ownapp.md).

## TypeScript projects

The current0.5.0 file includes explicit input JSDoc. If your project does not infer imported JavaScript, place the matching [state-lens-v0.6.0-experimental.1.d.mts](state-lens-v0.6.0-experimental.1.d.mts) ([SHA256](state-lens-v0.6.0-experimental.1.d.mts.sha256)) next to the `.mjs`, retaining both filenames. Package users get the type export automatically. Run your existing typecheck as well as the test. [The reproduced blocker and measured settings](state-lens-typescript.md).

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
   test and record its command/exit result. Also run the existing typecheck
   command when present. If prerequisites or a suitable
   browser-persisted workflow are missing, report that blocker and stop;
   do not upgrade dependencies or substitute the library's demo.

2. Use the common MIT 0.6.0-experimental.1 module:
   https://aichance.github.io/business-ai-recipes/state-lens-v0.6.0-experimental.1.mjs
   Expected SHA256:
   7947dfeded08d7ff05b75fea0f6ec6d35659ed0ab463aa17cc00c90b0c2cb669
   Review it and verify the bytes before importing it in the Node-side test.
   Save it beside the test without overwriting an existing file. Do not
   change npm settings, package metadata, app code or the existing test data.
   For a TypeScript project needing declarations, download the matching
   state-lens-v0.6.0-experimental.1.d.mts beside that file (SHA256
   42a12b3982e675d1b0033153186eef1adfdde34cde05ce03c674b08e2376a281).
   Keep the caller compiler settings unchanged.

3. Select ONE known localStorage/sessionStorage key or IndexedDB database,
   store and key already exercised by that test, using its synthetic data.
   Raw storage text is allowed; use json:true only for known JSON text.
   IndexedDB records may contain plain JSON, explicit undefined and valid Date values, depth<=12,
   <=64KiB including metadata. If unsupported, report the limit and stop.

   For a large record, optionally add a known RFC6901 `pointer` such as
   `/nodes/0/data/value` to the probe (Web Storage also needs `json: true`).
   This observes that path only, not the entire record. Keep assertions that
   identify the intended object when selecting an array position.
   JSON Web Storage input must fit4MiB; the selected representation including
   metadata must still fit64KiB/depth12. Schema4 distinguishes the storage
   key's `exists` from `selection.exists`; missing paths are not saved nulls.

4. Create one lens for the existing Page. Wrap its existing UI actions in
   lens.step, keeping all readiness waits INSIDE each step callback and
   preserving the original assertions. If the test deliberately holds an
   IndexedDB write, release the gate and await commit before a checkpoint;
   do not wrap that release in a step probing the held store. In finally,
   write HTML once before the existing browser cleanup; attach it with testInfo when available,
   otherwise write to a new output directory. Keep the ordinary Trace.
   Reference: https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-install.md

5. Rerun that same test and its existing typecheck when present. Report the
   library/Node/Playwright versions, command,
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

1. [Download state-lens-v0.6.0-experimental.1.mjs](https://aichance.github.io/business-ai-recipes/state-lens-v0.6.0-experimental.1.mjs) and its [SHA256](https://aichance.github.io/business-ai-recipes/state-lens-v0.6.0-experimental.1.mjs.sha256).
2. Read the file, then place it next to an existing Playwright test. Keep an
   existing file instead of overwriting it. The file contains its MIT license
   and the same implementation as the common 0.6.0-experimental.1 package.
3. Import it **in the Node-side test**, not in your app's browser bundle:

```js
import { createStateLens } from './state-lens-v0.6.0-experimental.1.mjs';
```

There is no additional npm installation, account, model or API key. Your
existing Playwright installation remains necessary.

## Observe a field in a large record

Add `pointer: '/nodes/0/data/value'` to a probe for that known path.
Web Storage needs `json: true`; an IndexedDB probe works on its named record.
Use one explicit pointer per probe, up to the existing16-probe limit. Array
positions are literal: keep your own assertion that it is the intended item.
[Bounds, missing paths and schema4](state-lens-selected-fields.md).

## Wrap existing actions and keep assertions

After your existing test has opened its app and awaited its normal ready state:

For tests with a deliberately held IndexedDB write, keep the gate release
unobserved, await the existing commit assertion, then add a checkpoint.
[Measured placement and executable fixture](state-lens-held-writes.md).

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

[The Bloggr recovery case](state-lens-bloggr-native.md) shows one existing
TypeScript test with the shared module and matching declaration. The original
app/assertions and compiler settings were retained; the fixture uses synthetic
route responses. This is operator verification, separate from adoption.

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

### Rerun without replacing a report

Use the `mkdtemp` block above on **each invocation**, not a fixed
`report.html` path. `writeHTML(path)` writes with exclusive creation (`wx`),
so a second write to the same path fails with `EEXIST`. It does not replace the
earlier report or mean the application's save/reload assertion failed.

The block creates a fresh temporary directory, prints the exact HTML path and
leaves earlier reports intact. This recipe uses a new directory and file;
it does not require deleting the previous output. Keep report creation
inside your existing `finally`, before browser cleanup. With Playwright Test,
use its existing `testInfo.outputPath` and attach once per test as shown above;
use a fresh filename if your test deliberately writes more than one report.

The [Sethera own-app report](state-lens-sethera-ownapp.md) surfaced this plain-script
rerun issue. The output recipe works with the unchanged 0.4.1 library; no app,
test assertion, package setting or library option needs to change.

## Common package alternative

The [current common tgz](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.6.0-experimental.1.tgz)
and [checksum](https://aichance.github.io/business-ai-recipes/aichance-playwright-state-lens-0.6.0-experimental.1.tgz.sha256)
contain the current common library, manual-capture entry, tests, demo and examples. npm setups that permit
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
list so `undefined`, stored null and absent fields remain distinct. This was
introduced in schema2; the current `report()` emits schema3 and `libraryVersion`.
Handle the schema explicitly if parsing the report programmatically. [Exact representation, synthetic checks and limitations](state-lens-undefined.md).
The64KiB limit counts UTF8 JSON bytes including path metadata. Map/Set, BigInt,
cycles, sparse/extended arrays, invalid Date and depth>12 remain INCONCLUSIVE.

## Date values in IndexedDB

Version0.4.0 records valid Date values as UTC ISO text plus `datePaths`, so a
Date and an ordinary string containing the same text remain different. This is
an annotated JSON projection; it does not rewrite or revive application values.
A record containing Date uses `valueEncoding: "json-with-type-paths-v1"`; any
undefined annotations remain in `undefinedPaths`. [Representation, direct-read
comparison and limits](state-lens-dates.md). Pinned0.3 files remain unchanged.

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
