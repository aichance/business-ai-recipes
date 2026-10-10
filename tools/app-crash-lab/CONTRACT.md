# State preservation contract, version 1

Start with the complete `examples/notes.json`. The JSON is data; the runner
does not evaluate JavaScript supplied by the app or contract.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `pack` | `state-preservation@1`; pinned semantics |
| `name` | Name for reports |
| `baseURL` | A loopback HTTP(S) origin, e.g. `http://127.0.0.1:3000` |
| `path` | App route including optional query, e.g. `/notes?mode=test` |
| `timeoutMs` | Wait for an action/expected state, default 3000, 100–30000 |
| `stabilityMs` | After first matching final state, keep observing for this long; default 250, 0–5000 |
| `reset` | Steps before each check; required, may be `[]` for browser-only state |
| `setup` | A successful save flow; mark its triggering step `save: true`, then wait for completion |
| `observe` | Named saved/domain values that must remain the same |
| `expected` | At least one known-good observed baseline value |
| `afterReload` | Optional readiness steps after reloading |
| `rejectedUpdate` | Invalid steps and an explicit rejection signal |
| `checks` | Default `["reload", "rejected-update"]`; can select either |

Mark exactly one save-triggering step in `setup` with `save: true`. It may
be a click, autosaving fill or a successful HTTP mutation, never a read-only
GET. This is your declared save operation; the runner does not infer app
semantics from a button label.

Unknown fields, empty observations, missing baseline/rejection conditions
and unsupported patterns are rejected before starting a browser.

## Targets and actions

Use exactly one of `{"testId":"saved"}`, `{"label":"Note"}`,
`{"role":"button","name":"Save"}`, or `{"css":"#note"}`.
Label and role name matching are exact. Actions and single-element observations
must resolve unambiguously; a `count` observation counts all matches.

| Action | Other fields |
| --- | --- |
| `fill`, `press`, `select` | `target`, string `value` |
| `click`, `check`, `uncheck`, `expectVisible` | `target` |
| `setFile` (runner 0.2+) | `target`, `file: {"name":"synthetic.json","mimeType":"application/json","text":"{}"}` |
| `expectText`, `expectValue` | `target`, exact string `value` |
| `goto` | Origin-relative `path` |
| `request` | `method`, `path`, `expectStatus`, optional `data`, `headers` |

Requests use Playwright's API context. Supported methods: GET/POST/PUT/PATCH/DELETE.
Objects in `data` send JSON; a string sends the raw body. Set its content type
explicitly for raw form/multipart data. Paths cannot change origin. Redirects
are not followed by API requests. Do not put credentials in shareable contracts.

`setFile` supplies one file to an HTML file input, including a hidden input.
Its contents are literal UTF-8 `text` (at most 65,536 bytes), not a local path.
`name` is a filename of 1–128 characters without slashes or control characters;
`mimeType` uses a type/subtype pair. Binary files, multiple files, directories
and reading files from disk are not supported. Use synthetic contents; the
contract and reproduction spec retain that text. Mark it `save: true` if
importing triggers persistence in your app.

## Observations

Every entry under `observe` has one source:

| `source` | Additional fields | Value |
| --- | --- | --- |
| `text` | `target` | Exact `textContent`, no trimming |
| `value` | `target` | Form input value |
| `attribute` | `target`, `attribute` | Attribute string, or `null` if absent |
| `count` | `target` | Number of matching elements |
| `localStorage`, `sessionStorage` | Exactly one of `key` or `keyFrom`; optional `keyPrefix` with `keyFrom` | String or `null` |
| `response` | `url`, `field` | Same-origin GET result |

Response fields are `json`, `text`, `status`, or `header` (add `header`).
Except for `status`, a non-2xx response makes the observation inconclusive.
`parse: "json"` parses a string value; `jsonPath: ["items", 0, "title"]`
selects a nested value. A missing JSON path is retried during an expected-state
wait, then inconclusive if still missing at the deadline. A missing storage
key/attribute is explicitly `null`, so deletion can appear in a diff.

For an API returning a JSON object, use `field: "json"` and omit `parse`:

```json
{ "source": "response", "url": "/api/notes", "field": "json", "jsonPath": ["title"] }
```

`field: "json"` already decodes the response. `parse: "json"` is for an
observed **string containing JSON**, such as a localStorage record, not an
already decoded object. Trying to parse the object again is inconclusive.

For dynamically named records, runner 0.2+ can read a pointer from the **same**
storage. For example, `{"source":"localStorage","keyFrom":"currentId",
"keyPrefix":"doc.","parse":"json"}` reads `currentId`, then parses the value
at `doc.` plus that ID. The pointer is resolved on every observation. A missing
pointer or record returns `null`; there is no cached last value. Observe
`{"source":"localStorage","key":"currentId"}` separately when changing the
selected record must also count as a failure, even if its contents are equal.
Adding a `jsonPath` to a missing record makes it an unavailable observation
(inconclusive), rather than a `null` value diff.

Object key order is ignored; value types, array ordering, IDs and timestamps
are retained. To ignore an irrelevant field, select the actual invariant
fields explicitly with `jsonPath`; there is no silent normalization.

The baseline must match every key in `expected`; all selected observations
then form the preservation snapshot, including dynamic values such as ETags.
An empty expected object cannot accidentally pass.

## Rejection is a separate condition

```json
{
  "rejectedUpdate": {
    "steps": [
      { "action": "fill", "target": { "label": "Note" }, "value": "" },
      { "action": "click", "target": { "role": "button", "name": "Save" } }
    ],
    "observe": { "message": { "source": "text", "target": { "testId": "status" } } },
    "expected": { "message": "Rejected: note is empty" }
  }
}
```

The rejection observation must already be readable after the successful save,
and must not already equal the rejection value. For a `text` observation, a
persistent status container is useful. Missing elements for `text`, `value`
or `attribute`, and missing JSON paths, are inconclusive, never a pass.

### Error elements that appear only after invalid input

If the app adds an error element only after rejection, use `count` with a
selector that identifies the specific rejection message. No match is a readable
`0`; the expected rejection below is one visible, exact-text match:

```json
{
  "observe": {
    "message": {
      "source": "count",
      "target": { "css": "[role=\"alert\"]:visible:text-is(\"Note required\")" }
    }
  },
  "expected": { "message": 1 }
}
```

Use this fragment for `rejectedUpdate.observe` and `rejectedUpdate.expected`,
keeping the invalid `steps` and saved-data observations. Replace the selector
and message with the app's actual validation signal. The successful save must
leave zero matches; an already matching error is inconclusive. If the expected
message never appears after the invalid operation, the check fails. A matching
rejection followed by changed saved data also fails. A generic count of all
alerts is not enough to identify the intended rejection.

The selector uses [Playwright's CSS text and visibility matching](https://playwright.dev/docs/other-locators#css-matching-by-text).
`:text-is()` is case-sensitive and normalizes whitespace; `source: text`
instead reads exact `textContent` without trimming.

Alternatively, an invalid API mutation with an explicit 400–499 `expectStatus`
is a rejection signal, e.g. `PUT /api/stock`, `data: {"quantity":-1}`,
`expectStatus: 422`. A 2xx response alone does not count as rejection. Apps
that return HTTP 200 for a business validation error must provide the separate
`observe`/`expected` rejection signal above; it must change from not matching
after the successful save to matching after the invalid update.

After rejection, the original saved values must still match. The editable
input and error display are normally excluded from the preserved state.

## Isolation and timing

Each pattern has a fresh, nonpersistent browser context. First navigate to
the app, run `reset`, reload if reset was nonempty, run `setup`, confirm the
baseline, apply the extra operation, and compare the saved snapshot.
The runner executes patterns sequentially. Server data is not cleared by
browser isolation: provide reset steps, use a complete replacement fixture,
or run against a freshly isolated server. Only use your own test data.

Expected state is polled within `timeoutMs` to allow ordinary asynchronous
rendering. After the first match, selected values are sampled for `stabilityMs`
(default 250 ms); a mismatch during that window fails. A restoration before
the first match can pass, and changes after the observation window are outside
coverage. This is not continuous monitoring or a machine-crash durability proof. Use explicit save-completion/readiness steps. Parallel requests,
real-time clocks and multiple tabs are outside this first pack.
