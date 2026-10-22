# Records survived. Did their relationships survive too?

Copy [relations.mjs](relations.mjs) into an existing Node or Vitest suite to
check directed, typed relationships after a restore or migration, even when
record IDs change. No package install, App Crash Lab runner or JSON contract
is required. Use Node22+ for this repository's examples.

From `tools/app-crash-lab`, try the offline synthetic controls:

```sh
node examples/relationship-native/demo.mjs
```

The three JSON lines report **PASS** for new IDs with the same relationship,
**FAIL** for the same nodes without the reply edge, and **INCONCLUSIVE** for an
unresolvable target ID. Exit0 means those expected comparator results matched;
it does not mean an app passed. These are authored data-layer controls, not a
measured game migration, browser reload or backup restore.

## Use the normal API, and keep the expectation independent

1. Capture a known-good fixture through normal app actions. Review its values
   and relationships through the normal API/UI. Save explicit stable semantic
   keys and expected relationships in your test fixture, once.
2. Run your actual restore or migration, then query the normal current API.
   Adapt **all records and relationships within the declared test scope** to
   `actual.nodes` and `actual.edges`. Do not silently drop dangling references.
3. Compare against the reviewed fixture. Keep your complete record/value
   assertions separately: this helper checks only node identities and edges.

For example, after loading a parent and reply through your app's normal API:

```js
import assert from 'node:assert/strict'; // Or your existing Vitest expect.
import { compareRelations } from './relations.mjs';

// Reviewed and stored before testing the exporter/migration under test.
const expected = {
  nodes: ['parent', 'reply'],
  edges: [{ type: 'replyTo', from: 'reply', to: 'parent' }],
};
// Adapt your actual API response. Do not hard-code observed IDs in a real test.
const actual = {
  nodes: [{ id: 'new-41', key: 'parent' }, { id: 'new-72', key: 'reply' }],
  edges: [{ type: 'replyTo', fromId: 'new-72', toId: 'new-41' }],
};
const result = compareRelations(expected, actual);
assert.equal(result.status, 'PASS', JSON.stringify(result));
```

The literal `actual` above is only a schema example. Your adapter must extract
current IDs, stable keys and edges from the real response. Choose a persistent
semantic identity or explicit fixture label, not a mutable title or array index.
Keys and IDs must be unique, nonblank strings; nothing is coerced or trimmed.
If an app has no way to resolve unique semantic identities, review that mapping
before making a preservation claim.

## Verdicts and limits

- **PASS**: exactly the expected semantic nodes and directed typed edges,
  including duplicate-edge counts. Node/edge order and current IDs can differ.
- **FAIL**: valid observed graph has missing/extra nodes or edges, a changed
  relationship type/direction/target, or changed edge multiplicity. An empty
  actual graph is valid input and fails a nonempty baseline.
- **INCONCLUSIVE**: malformed input, duplicate keys/IDs or unknown endpoints.
  The helper refuses to guess which node was intended or discard that edge.
  Resolve the setup or inspect the underlying data; this is never PASS.

The expected baseline must contain at least one reviewed relationship. Building
it from the same exporter being tested can copy the exporter's omission and
produce a false pass. A correct node count also cannot establish intact edges.
This helper does not check record field values, ordering, timestamps, permissions,
acyclicity, browser rendering, save durability or whether the fixture was really
produced through normal play. Keep the original real-play fixture unchanged in
your end-to-end test; these synthetic controls test the comparator separately.

The [measured WA-archiver diagnostic](../wa-archiver/README.md) is the motivating
failure: three messages and ordinary fields survive while `replyTo` is lost.
That existing measurement preserves IDs and compares full DTOs/UI; it is
**not** evidence that this helper ran a real migration or fixed that app.
MIT licensed as part of App Crash Lab. Nothing is uploaded by this helper.
