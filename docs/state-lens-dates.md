# State Lens0.4: selected IndexedDB Date values

Source-read motivation: [Ollama GUI models](https://github.com/HelgeSverre/ollama-gui/blob/main/src/domain/types.ts) include Date fields, and [AMC WebUI test fixtures](https://github.com/yeahhe365/AMC-WebUI/blob/main/e2e/sidebar-session-reorder.spec.ts) put Date-valued message timestamps in IndexedDB. Compatibility measurements here use authored local fixtures; those applications were not executed.

With a synthetic dated note, native Playwright `page.evaluate` read the Date,
epoch1790850030456 and ISO2026-10-01T10:20:30.456Z. The0.3 helper instead returned
INCONCLUSIVE because it only accepted JSON and undefined. Version0.4 adds an
explicit Date projection without changing the stored record. Native reads
already support these values; the helper adds their selected history beside
screenshots and UI steps. Developer time saving has not been measured.

## Read the typed projection

A selected record with `createdAt: new Date(0)`, `optional: undefined` and
`note: null` is represented as:

```json
{
  "status": "OBSERVED",
  "exists": true,
  "value": {
    "createdAt": "1970-01-01T00:00:00.000Z",
    "optional": null,
    "note": null
  },
  "valueEncoding": "json-with-type-paths-v1",
  "datePaths": ["/createdAt"],
  "undefinedPaths": ["/optional"]
}
```

Only the datePaths pointer denotes a Date. An ordinary stored ISO string has
no Date annotation. Only the undefinedPaths pointer denotes undefined; note is
a stored null. If a Date is replaced by the identical ISO string, its projected
text is unchanged but removing datePaths appears in the differences. No strings
are automatically revived and no values are written back.

Pointers use the same sorted RFC6901 encoding as undefinedPaths: `/a~1b~0c`
means key `a/b~c`, `/items/0` is an array slot, `/` is an empty property name,
and the empty pointer is the entire selected value. Date metadata lives outside
value, so identically named application fields are ordinary data.

The report header is schema3 with libraryVersion0.4.0-experimental.1. JSON
consumers must explicitly handle this version and its type annotations. An
undefined-only record retains json-with-undefined-paths-v1. The current HTML
explains both projections and can render preserved schema1/schema2 reports.
The earlier0.1/0.2/0.3 files and archives remain unchanged.

## Reproduce the checks

From tools/playwright-state-lens with the existing pinned browser installed:

```sh
node --test --test-concurrency=1 tests/date-values.test.mjs
npm test
npm run test:consumer
```

The Date tests compare native type/epoch readings before and after observation,
retain Date and undefined through reload, check nested/array/root pointers,
distinguish a Date change from an identical-text type change, check valid range
endpoints and invalid Date, count path metadata toward the byte limit, and
open old report formats. The fixture and test source are common package files.
These are operator checks, separate from external own-project use.

## Limits

The same API and Node22+/existing Playwright prerequisites apply. Only selected
valid Date values are added; IndexedDB keys remain strings or finite numbers.
Invalid Date, Map, Set, BigInt, cycles, sparse/extended arrays and unsupported
values remain INCONCLUSIVE. A refused observation is not a missing record.
The64KiB UTF8 budget covers the projected value and path arrays, at depth<=12,
with up to16 probes. The enclosing report, status/encoding labels and screenshots
are outside that selected-value budget. Date normalization is UTC ISO text; it
does not retain a display timezone or infer an application's date semantics.

Reads and screenshots are sequential and can affect timing. Preserve the
original app assertions, readiness conditions and Trace, and retain an
uninstrumented run when comparing a timing-sensitive regression. The helper
does not establish atomicity, persistence correctness or a race fix.

[Copy the common versioned file](state-lens-install.md) and select one known
record in your existing test. A short version/workflow/first-blocker report is
enough; private application data or raw reports are not needed.
