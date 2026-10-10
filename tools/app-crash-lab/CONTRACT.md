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
Label and role name matching are exact. A locator must resolve unambiguously.

| Action | Other fields |
| --- | --- |
| `fill`, `press`, `select` | `target`, string `value` |
| `click`, `check`, `uncheck`, `expectVisible` | `target` |
| `expectText`, `expectValue` | `target`, exact string `value` |
| `goto` | Origin-relative `path` |
| `request` | `method`, `path`, `expectStatus`, optional `data`, `headers` |

Requests use Playwright's API context. Supported methods: GET/POST/PUT/PATCH/DELETE.
Objects in `data` send JSON; a string sends the raw body. Set its content type
explicitly for raw form/multipart data. Paths cannot change origin. Redirects
are not followed by API requests. Do not put credentials in shareable contracts.

## Observations

Every entry under `observe` has one source:

| `source` | Additional fields | Value |
| --- | --- | --- |
| `text` | `target` | Exact `textContent`, no trimming |
| `value` | `target` | Form input value |
| `attribute` | `target`, `attribute` | Attribute string, or `null` if absent |
| `count` | `target` | Number of matching elements |
| `localStorage`, `sessionStorage` | `key` | String or `null` |
| `response` | `url`, `field` | Same-origin GET result |

Response fields are `json`, `text`, `status`, or `header` (add `header`).
Except for `status`, a non-2xx response makes the observation inconclusive.
`parse: "json"` parses a string value; `jsonPath: ["items", 0, "title"]`
selects a nested value. A missing JSON path is inconclusive. A missing storage
key/attribute is explicitly `null`, so deletion can appear in a diff.

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
and must not already equal the rejection value. A persistent status container
is useful. A missing element/JSON path is inconclusive, never a pass.

Alternatively, an invalid API mutation with an explicit 400–499 `expectStatus`
is a rejection signal, e.g. `PUT /api/stock`, `data: {"quantity":-1}`,
`expectStatus: 422`. A normal 2xx response does not count as rejection.

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
