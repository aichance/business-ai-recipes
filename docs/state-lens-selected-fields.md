# Inspect selected fields in a large saved record

State Lens0.5.0-experimental.1 adds one optional pointer per probe using the
[RFC6901 JSON pointer syntax](https://www.rfc-editor.org/rfc/rfc6901).
Unresolved paths are represented explicitly by `selection.exists: false`.
This addresses a concrete limit reported by the [Sethera author](state-lens-sethera-ownapp.md):
a normal saved document can exceed64KiB even without images, making the whole
probe inconclusive. The initial author report used0.4.1. The measurements below
remain a separate authored operator fixture; a [later own-app0.5 reuse report](#later-own-app-reuse-report)
is described separately below.

## Use your known path

Use the [common MIT file](state-lens-v0.5.0-experimental.1.mjs) and its
[checksum](state-lens-v0.5.0-experimental.1.mjs.sha256) in an existing Node22+
Playwright project. [TypeScript declarations and complete setup](state-lens-install.md).

```js
const lens = createStateLens(page, {
  probes: [
    { name: 'number', source: 'localStorage', key: 'app-document', json: true,
      pointer: '/nodes/0/data/value' },
    { name: 'digits', source: 'localStorage', key: 'app-document', json: true,
      pointer: '/nodes/0/data/digits' },
  ],
});
```

`app-document` and these paths illustrate a known saved shape. Use your app's
key and paths, and keep assertions that identify the intended item when using
an array position. There are no wildcards, predicates or automatic field discovery.
Wrap the same existing actions with `lens.step`, keep readiness waits inside
the callback, and retain assertions and ordinary Trace. Write one local HTML
to a fresh path.

For IndexedDB, add `pointer` to the existing database/store/key probe. For
sessionStorage, use `source: 'sessionStorage'` and `json: true`. A pointer on raw
Web Storage text is rejected before browser work. Omit `pointer` to keep the
whole-value behavior; an empty string explicitly selects the root. IndexedDB
strings remain strings; pointer selection does not parse JSON text inside them.

## Measured scope

The [reproducer](../experiments/state-lens/selected-fields-case.mjs) seeds an
authored browser fixture with numeric data and large synthetic padding. It
commits two format fields through the fixture helper, then reloads. These are
fixture actions; this is not a new operator run of Sethera or a third-party user.

| Observation | Measured result |
| --- | --- |
| Saved JSON after the format change | 162,130 UTF8 bytes |
| Whole-document probe | `INCONCLUSIVE`, unchanged64KiB limit |
| Three pointers: numeric value, digits, rounding | 15`OBSERVED` values over5checkpoints |
| Independent full-value before/after comparison | Only digits and rounding added; numeric value and padding retained |
| Selected changes after reload | 0 |
| Serialized selected observations over5checkpoints | 1,840 bytes including selection/type metadata |
| Report JSON with screenshots removed | 4,323 bytes |

[Saved environment and measurements](state-lens-fields-measurements.json):
macOS operator, Node22.23.4, Playwright1.64.0, Chromium156.0.8078.4.
The unselected padding is absent from the report JSON. The HTML still includes
viewport screenshots, whose contents depend on what the app displays.
These numbers do not measure diagnosis time, CPU overhead or superiority over
Trace. Standard Playwright can inspect the same storage; this helper aligns
the configured paths with the test's steps.

From a source checkout with the tool's existing dependencies/browser installed:

```sh
node experiments/state-lens/selected-fields-case.mjs
```

It prints a fresh local output directory containing HTML, report JSON and
measurements. An optional directory argument must not already exist.
The regression suite also covers these semantics:

```sh
cd tools/playwright-state-lens
node --test tests/selected-fields.test.mjs
```

## Later own-app reuse report

On2026-10-31, the Sethera author [reported using common0.5 on their own app](state-lens-sethera-ownapp.md#updated-version-reuse-05-on-a-larger-document)
with a document of approximately132,000bytes on Windows, Node22.23.4 and
Playwright1.64.1. The full probe remained `INCONCLUSIVE`, while3 selected fields
were `OBSERVED`; selected changes after reload were0. They asserted that the
selected array position still referred to the intended piece and confirmed
that a fresh output directory allowed another run.

That is the author's updated-version self-report, separate from the162,130byte
macOS fixture and its measurements above. It does not report an independent
whole-document comparison or a run of the0.6 manual entry, and it establishes
no measured time saving or broad platform guarantee. The linked report includes
the source comment and the conditions for interpreting the result.

## Schema4: storage key and selected path

`report()` now emits `schema: 4`. JSON consumers must handle that schema
explicitly. `exists` describes the original storage key; an optional
`selection: { pointer, exists }` describes the configured path.

- Key absent: `exists: false`, `selection.exists: false`.
- Key present, path absent: `exists: true`, `selection.exists: false`, `value: null`
  as a placeholder.
- Saved null at the path: both existence values true, `value: null`.
- Saved undefined: both true, a null placeholder and `undefinedPaths: [""]`.
- A valid Date: both true, ISO text and `datePaths: [""]`.

Type paths are relative to the selected value. A nested selected object can
have its own relative undefined/Date paths. `~0` escapes`~`, `~1` escapes`/`,
and`/` alone selects a property named the empty string. Array indices are
literal canonical nonnegative integers; inherited properties are not selected.
The HTML explains partial coverage and the missing-path placeholder.
Earlier report HTML and immutable0.4.1 downloads remain available.

## Bounds and interpretation

- One pointer per probe, at most16probes,32pointer segments and2,048UTF8 bytes
  per pointer. The selected output still fits64KiB including selection/type
  metadata and depth12.
- Pointer selection from JSON Web Storage accepts at most4MiB of input text.
  Malformed JSON, unsupported selected values and oversized output are
  `INCONCLUSIVE`.
- IndexedDB reads the named record inside the browser before selecting. This
  feature does not bound the database's record-read cost. Web Storage likewise
  reads/parses its named JSON text. Only the selected representation crosses
  into the returned value; viewport screenshots remain separate observations.
- Values outside a pointer are neither validated nor included in its value
  projection. Successful observation says nothing about those fields. In
  particular, unchanged selected values do not prove a whole document survived.
- Observations remain sequential and do not establish commit timestamps or
  correctness. Keep the app's saving/commit waits and assertions.

The common module performs no storage writes. The existing refusal to replace
an HTML report is unchanged. This operator fixture alone establishes no external use or broad browser/runtime
compatibility; the later author-reported0.5 reuse is linked separately above.
