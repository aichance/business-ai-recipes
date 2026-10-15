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
| `backupRoundtrip` | Real JSON export → fresh restore → reload; [runner 0.6+ fields](BACKUP.md) |
| `checks` | Default `["reload", "rejected-update"]`; select either, or explicitly opt into `"backup-roundtrip"` |

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
| `indexedDB` | `database`, `store`, `key`; optional `field` | `{exists, value}` by default; see below |
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

### IndexedDB (runner 0.5+)

Observe the actual database and object store, rather than unrelated preferences
in Web Storage:

```json
{
  "savedCheckpoint": {
    "source": "indexedDB",
    "database": "loft",
    "store": "checkpoints",
    "key": "current"
  },
  "savedDay": {
    "source": "indexedDB",
    "database": "loft",
    "store": "checkpoints",
    "key": "current",
    "jsonPath": ["value", "day"]
  }
}
```

The default `field: "entry"` returns `{ "exists": true, "value": ... }`.
A missing key returns `{ "exists": false, "value": null }`, so deleting a
record containing JSON `null` still changes the snapshot. `field: "value"`
selects only its value and intentionally omits presence; `field: "exists"`
selects only a boolean, without comparing the stored value. `parse: "json"`
decodes a stored JSON **string** before wrapping/selecting its value.
`jsonPath` traverses the selected result. It cannot be used with `exists`.

Keys can be strings (including an empty string), finite numbers, or arrays
containing those keys, with at most 16 array levels. Date/binary keys are not
representable in this JSON contract. Values must be acyclic plain JSON data;
Date, Map, Blob, binary data, BigInt, undefined and nonfinite numbers are
inconclusive instead of being silently converted. An existence-only probe
can check the presence of an opaque value, but does not prove its preservation.

The reader enumerates existing databases, aborts an unexpected upgrade if
deletion races open, and uses one `readonly` transaction for all configured
stores/keys in each database. It closes its own connections on success,
failure and late open events. It never creates a persistent missing database
or writes records. Missing databases/stores, unavailable enumeration, blocked
or timed-out reads are inconclusive. The enumeration requirement is documented
in [MDN](https://developer.mozilla.org/en-US/docs/Web/API/IDBFactory/databases).

Atomicity applies within one database; separate databases, DOM, Web Storage
and HTTP observations are not a single atomic snapshot. Wait for the app's
real load/save confirmation in `setup` and `afterReload`. Choose your durable
checkpoint as the baseline, rather than unsaved simulation time. Use a full
entry observation when deletion should appear in a diff; a missing nested
`jsonPath` is an unavailable observation, not a passing preservation result.

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

### Native alert rejection (runner 0.3+)

For an app that uses `alert()` instead of a DOM error, declare its exact message:

```json
{
  "rejectedUpdate": {
    "steps": [{
      "action": "setFile",
      "target": { "css": "input[type=\"file\"]" },
      "file": { "name": "invalid.json", "mimeType": "application/json", "text": "{" }
    }],
    "dialog": { "type": "alert", "message": "Could not import JSON" }
  }
}
```

`dialog` is an alternative to rejection `observe`/`expected` or HTTP 4xx;
do not combine these signals. Matching is exact, including whitespace and
case. The runner listens before setup and dismisses alerts so execution can
continue. It does not replace `window.alert` or change your application.

An identical alert during setup is inconclusive. After invalid steps, the first
alert must appear within `timeoutMs` and match exactly. No alert or a different
alert fails. Additional alerts observed through the saved-state comparison and
stability window also fail. `timeoutMs` is a maximum wait for the first alert,
not a full-duration monitor. Alerts after that comparison window are outside
coverage; `stabilityMs: 0` adds no extra monitoring time. Native `confirm`, `prompt`
and `beforeunload` are not rejection signals. Unconfigured confirmations,
prompts and before-unload dialogs are dismissed and make this check inconclusive.

Even after a correct alert, changed saved data fails. `report.json` includes
the observed dialog type/text, and the generated standalone test uses the same
checks. As with DOM signals, this is bounded observation, not proof that an
unrelated delayed event could never produce the same message. See the
[unchanged Sethera example](examples/SETHERA.md).

### Confirmation before invalid input (requires 0.4 or later)

An importer may ask whether to replace the current document *before* parsing
the file. Configure the exact type/text permitted in a single file-import
observation window:

```json
{
  "rejectedUpdate": {
    "steps": [{
      "action": "setFile",
      "target": { "css": "input[type=\"file\"]" },
      "file": { "name": "invalid.json", "mimeType": "application/json", "text": "{" },
      "confirm": { "message": "Replace this synthetic note?", "accept": true }
    }],
    "observe": { "error": { "source": "text", "target": { "css": "#error" } } },
    "expected": { "error": "Invalid note" }
  }
}
```

The runner accepts exactly one matching native `confirm()` during this step,
within `timeoutMs` from the start of the action. The message matches the full
text, including whitespace and case. Missing confirmation fails. A wrong,
repeated, earlier or later confirmation observed by the listener is dismissed
and makes the check inconclusive. This option requires exactly one `setFile`
step in `rejectedUpdate.steps`; multistep updates and all other actions are
unsupported. Setup, navigation and observations cannot accept confirmations.

Acceptance is **not** evidence of rejection. A separate DOM error, HTTP4xx or
configured alert must still confirm the failed update, and the saved state
must remain unchanged. Use a fresh disposable app with synthetic records:
this option really accepts that app's replacement confirmation. It does not
replace `window.confirm` or grant general permission to dialogs. Reports list
observed dialogs and accepted confirmations. The generated standalone spec
uses the same bounded checks. Dialogs after the state comparison and stability
window are outside coverage. The native dialog event identifies its type and
text, not which timer or operation caused it: an unrelated identical message
inside the allowed window cannot be distinguished. Inspect the app's import
flow when choosing the exact message; a PASS is not proof of that causal link.
Versions before 0.4 reject this field.

## Actual backup and restore (runner 0.6+)

Select `checks: ["backup-roundtrip"]` and configure `backupRoundtrip` as shown
in [BACKUP.md](BACKUP.md). This is distinct from supplying a literal invalid
file to `rejectedUpdate.steps`. It downloads the real JSON and imports the
unchanged bytes in an empty browser context.

Runner0.7 adds optional `backupRoundtrip.restore.confirm` with exactly
`{"message":"Exact native restore question","accept":true}`. It applies only
to one native confirm observed while delivering the actual backup to the target.
Dialogs observed during source/setup/readiness or the chooser trigger are not
accepted; a delayed identical target dialog inside the window has no causal
identifier and cannot be distinguished from the intended confirmation. Missing, wrong, duplicate
or out-of-window dialogs are INCONCLUSIVE. New import completion, full selected
saved state and reload checks remain required. See the backup guide for the
bounded window, metadata-only output and causal-attribution limits.

Runner0.8 adds optional `backupRoundtrip.restore.commit` for one in-app HTML
preview/confirmation. Declare a unique `frame`, a frame-relative `target`, and
nonempty frame-relative, observation-only `ready` steps including a nonblank exact
text/value assertion. The frame must be absent/hidden before delivery; selected
saved state must still match `restore.empty` and success must remain absent
before one commit click. This is mutually exclusive with native `confirm`.
New completion, full selected records and reload remain required; see
[the DOM stage and failure classifications](BACKUP.md#in-app-import-preview-and-confirmation-08).

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
