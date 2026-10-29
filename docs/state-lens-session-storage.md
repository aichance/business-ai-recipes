# Observe a selected sessionStorage value in an existing test

State Lens0.3.0-experimental.1 adds a third source alongside localStorage and
IndexedDB. This is the same common one-file MIT helper, with Node22+ and your
existing Playwright installation. [Download and attach it](state-lens-install.md).

```js
const lens = createStateLens(page, {
  probes: [{ name: 'draft', source: 'sessionStorage', key: 'draft-key', json: true }],
});
```

Use `json: true` only for JSON text; omit it for a raw string. Keep the real key
from your own app and its normal readiness checks and assertions. Use a separate
lens per `Page`, including two pages in the same BrowserContext. Titles such as
`Tab A` and `Tab B` help distinguish their separate local HTML files. There is no
combined atomic view, copying, restoration, tab synchronization or pass verdict.

## What this adds to the baseline

Direct `page.evaluate(() => sessionStorage.getItem(...))` remains a valid way to
read an app's state. Playwright's [official session-storage guide](https://playwright.dev/docs/auth#session-storage)
shows explicit page evaluation; this helper does not invent an otherwise
impossible browser capability. It aligns a declared value with your own steps,
differences, observed failures and screenshots in one local report. Standard
Trace and ordinary assertions should remain part of the test.

Two authored local Chromium tests cover a same-context two-page draft scenario
and value/error boundaries. They compare the helper's output with native browser
reads and storageState: a same-named localStorage key stays separate from the
two tab-specific values. A reload retains the first page's observed value; a
new independent `context.newPage()` starts without that session key in this
fixture. This does not promise that every possible way of opening a tab starts
empty, or prove another app correct. It is operator verification, not adoption.

Raw text, malformed selected JSON, saved JSON null, a missing key, a value over
64KiB, refused access and a non-string key are exercised. The observer leaves
the stored entries unchanged. The common16-probe,64KiB/depth12, first HTTP(S)
origin and JSON-plus-undefined limits remain. A failed read is INCONCLUSIVE,
not missing or PASS. This change does not decode binary values, export whole stores or restore
authentication state.

Reports contain selected values and viewport screenshots. Keep private app data
local. A version number and whether this helps beyond your existing trace are
enough feedback; no private report or source is required.
