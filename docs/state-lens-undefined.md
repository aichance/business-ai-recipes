# State Lens0.2.0: optional undefined fields

An external developer [reported](https://bsky.app/profile/tomu963.bsky.social/post/3myz3cehsmv2g)
trying State Lens in an existing Playwright transaction edit/reload/delete flow.
Test-seeded records could be read, but app-saved records with eight optional
undefined fields were INCONCLUSIVE. The report prompted this compatibility fix.
Their exact installed version/runtime and successful rerun are not yet confirmed.
This page describes our synthetic reproduction, not execution of their app.

## Read the annotated values

For a selected IndexedDB record `{ quantity: undefined, note: null }`, schema2
represents the observation as:

```json
{
  "status": "OBSERVED",
  "exists": true,
  "value": { "quantity": null, "note": null },
  "valueEncoding": "json-with-undefined-paths-v1",
  "undefinedPaths": ["/quantity"]
}
```

Only the annotated quantity is an observed undefined; note is a stored null.
If quantity is absent, it is absent from `value`. If the selected record is
missing, `exists` is false. Null placeholders alone must never be interpreted
without the accompanying metadata. User payload keys cannot collide with a
sentinel: metadata lives outside `value`. Paths are sorted RFC6901 JSON pointers:
`/a~1b~0c` addresses key `a/b~c`, `/items/0` addresses an explicit array slot,
`/` addresses an empty property name, and the empty string addresses a whole
selected undefined value. Field/type transitions are included in per-step diffs.

The report header has `schema: 2` and `libraryVersion: "0.2.0-experimental.1"`.
The HTML identifies annotated placeholders even when viewing a later null/absent
checkpoint. Existing JS exports and step/read-only behavior remain unchanged.
The observer does not rewrite stored values or omit undefined fields.

## Verification and limits

The prior library rejected a real Chromium IndexedDB record containing undefined.
After the change,19 behavior tests pass, including undefined/null/absent/missing,
nested/dense-array/root values, escaped/prototype-like keys, stable ordering,
HTML explanation and native type/presence checks before and after observation.
Oversized UTF8 content and metadata are refused. Date/Map/Set/BigInt/cycles,
sparse/extended arrays and excessive depth remain INCONCLUSIVE. The bound is now
actual UTF8 JSON bytes (including undefined metadata), rather than JS character
count; non-ASCII records may reach64KiB sooner than in0.1.0.

Known limits remain: Node22+, an existing Playwright page, Chromium with Playwright1.64.0 measured,
16probes, selected string/finite-number keys, depth12 and64KiB. Sequential
observations/screenshots can affect timing; COMPLETED is not a data assertion.
Keep normal app readiness and assertions. Reports contain selected data and
screenshots and stay local unless shared. No measured developer time saving
or external successful rerun is established by these operator checks.

[Copy the common file](state-lens-install.md) or inspect the
[implementation and tests](../tools/playwright-state-lens/). Earlier0.1.0 modules,
tarball, native-case reports and videos are preserved unchanged.
