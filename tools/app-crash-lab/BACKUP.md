# Does the app restore its own backup? (runner 0.6+)

A malformed file can be safely rejected while a valid, self-exported backup
cannot be restored. This optional check runs the real export/import flow.

For your own app, [copy the backup-specific coding-agent prompt](https://aichance.github.io/business-ai-recipes/app-crash-lab.html#backup-agent).
It links the pinned 0.9.0 format and asks the agent to inspect your real import,
configure complete selected records and execute the test. Supply one workflow
to check. Review the generated contract and actual result; unsupported steps
must be reported without bypassing them or changing the app to pass.

Use a **disposable browser-local app with synthetic records**, running on a
loopback origin. Start with the complete [FEATURE contract](examples/devtasks/roundtrip-feature.json)
or [DOCS contract](examples/devtasks/roundtrip-docs.json). They create records
through the normal UI. The DOCS case should fail on the pinned unchanged
DevTasks source; do not change it to expect rejection or mark it skipped.

```sh
node cli.mjs run examples/devtasks/roundtrip-feature.json
node cli.mjs run examples/devtasks/roundtrip-docs.json
```

See [the example](examples/devtasks/README.md) for the pinned local app setup.
For your own app, edit the source save flow and these fields:

```json
{
  "checks": ["backup-roundtrip"],
  "backupRoundtrip": {
    "isolation": "browser-local",
    "export": {
      "steps": [{ "action": "click", "target": { "testId": "export" } }],
      "maxBytes": 65536,
      "statePaths": { "saved": ["records"] }
    },
    "restore": {
      "path": "/notes",
      "ready": [{ "action": "expectVisible", "target": { "testId": "upload" } }],
      "empty": { "saved": null, "visibleCount": 0 },
      "target": { "testId": "upload" },
      "mimeType": "application/json",
      "success": {
        "observe": { "status": { "source": "text", "target": { "testId": "status" } } },
        "expected": { "status": "Restored" }
      }
    }
  }
}
```

This is a fragment. In a full [contract](CONTRACT.md), `observe.saved` reads
the complete saved browser-storage value, `observe.visibleCount` counts
rendered records, and `expected` proves the source save worked. Select complete
records, not only IDs/counts: omitted values are outside coverage.

The success observation must also be readable **before** import. The text
example assumes an existing status node whose text changes to `Restored`.
For a toast that is absent until success, use a `count` observation selecting
its exact success text, with expected `1`; it reads `0` before import. A `text`
probe on an absent node times out and is INCONCLUSIVE.

## Open the restore UI in a fresh context (0.9+)

If the real import control requires opening Settings or completing normal
onboarding, declare `restore.prepare` before the read-only `restore.ready`:

```json
"prepare": [
  {"action":"click","target":{"role":"button","name":"Settings"}},
  {"action":"expectVisible","target":{"label":"Import backup"}}
]
```

At most 32 normal UI actions/expectations are allowed. There is no API request,
programmatic navigation, file injection, native-dialog acceptance or post-import
repair in this stage. It runs only on the fresh target, once, before the full
initial-state stability check. Declare any preferences initialized through the
normal UI in `restore.empty`. Do not create the source's business records in
preparation. Missing/default/unstable initial values are INCONCLUSIVE, rather
than permission to change or normalize them. No preparation preserves the
earlier behavior. `restore.ready` and `afterReload` remain read-only.

The [Cadence Journal example](examples/bujo/README.md) uses this first-run
preparation for a real localStorage journal. It creates six domains through
the normal UI and compares each complete selected array, including IDs and
collection references, through export, fresh import and reload. Starter habits,
settings, photos and sync are explicitly outside that contract.

## Backups containing generated IndexedDB IDs (0.9+)

Use [`field: "records"`](CONTRACT.md#complete-inline-key-record-sets-runner-09)
with an explicit single-property inline `keyPath` and entry/UTF-8-byte bounds.
Map its complete plain record array in `export.statePaths`; do not choose a
known ID, count, preference or partial field as a substitute. The reader checks
primary-key/record-ID equality and all selected stores in one database share a
readonly transaction. Full record identity/value sets are compared independent
of the outer export array order. Nested arrays, every field and all IDs remain
significant. This mode does not verify business-specific export ordering.

Out-of-line/compound keys, unsupported structured-clone values, own undefined
properties, negative zero, missing stores and exceeded limits remain
INCONCLUSIVE. It does not rewrite IDs or make non-JSON storage JSON-compatible.
Fresh preferences saved with undefined values may also be unsupported; record
that boundary and use only explicitly declared normal UI initialization.

## Import buttons that open a file chooser (0.6.1+)

If the app creates its file input only when Import is clicked, replace
`restore.target` with `restore.fileChooser`, for example
`{ "role": "button", "name": "Import" }`. Exactly one is required. The runner
registers for the **real** file chooser before clicking that trigger, then gives
it the unchanged download. It does not create or append an input to the app.
A missing trigger or chooser is INCONCLUSIVE; it is not proof of an app defect.
The original `target` input path remains supported.

The [Price Table example](examples/price-table/README.md) includes a complete
Japanese setup, UI-created product and price, full saved-record comparisons,
and an import that reloads automatically. CLI and generated Playwright both
passed on its pinned unchanged source.

## Native restore confirmation (0.7+)

If delivering the file opens a native `confirm()`, declare its **exact** text:

```json
"confirm": {
  "message": "Replace all current data with this backup?",
  "accept": true
}
```

Put this optional object inside `backupRoundtrip.restore`, alongside `target`
or `fileChooser`. It accepts at most one matching native confirmation on the
fresh target, only from actual file delivery until `timeoutMs`. Dialogs observed during source setup, target readiness or the file-chooser
trigger click are not accepted. Those operations do not grant permission.
Wrong type/text, repeated or later dialogs are dismissed and INCONCLUSIVE.
A declared confirmation that never appears is also INCONCLUSIVE
(`IMPORT_CONFIRMATION_NOT_OBSERVED`), not proof of lost data. Contracts without
this field keep their existing behavior; they never auto-accept dialogs.

Confirmation alone is not a pass. The new completion signal, full selected
saved values, and reload comparisons must still match. The
[Paisa contract and measured scope](examples/paisa/README.md) are a complete
example. Reports add only `required`, `observed` and `acceptedCount`; captured
message text is omitted. The declared contract message remains in shared
configuration, so use synthetic inputs. The browser identifies dialog type
and text, not its causal operation: an unrelated identical confirm inside the
window cannot be distinguished, including a delayed dialog scheduled by target
readiness or the chooser trigger. Dialogs after the check ends remain outside
coverage. Preview/commit screens, multiple confirmations and non-JSON formats
are not added by this option.

## In-app import preview and confirmation (0.8+)

For an HTML preview followed by one explicit confirmation button, use
`restore.commit` instead of native `restore.confirm`:

```json
"commit": {
  "frame": { "role": "dialog", "name": "Import backup" },
  "target": { "role": "button", "name": "Restore backup" },
  "ready": [{
    "action": "expectText",
    "target": { "role": "heading", "name": "Import backup" },
    "value": "Import backup"
  }]
}
```

The preview frame must be absent or hidden before file delivery. Select one
frame, and one visible/enabled button **inside that frame**. Every `ready`
selector is also relative to the frame. Readiness permits only `expectText`,
`expectValue` and `expectVisible`, with at least one nonblank exact text/value assertion.
The readiness nodes and commit button must be descendants of that frame; a selector
that resolves outside it cannot satisfy the checks or receive the click.
Here `frame` means a DOM container, not an iframe document; selecting the container
itself or controls inside a separate iframe is unsupported.
It cannot click, navigate, upload, send a request or repair saved data. Native
`confirm` and DOM `commit` cannot be combined in one contract.

After delivering the original bytes, the runner waits for that preview and its
exact readiness checks. Before its one click it requires the new success signal
to remain absent, and compares every selected saved-storage value with the
fresh target's declared `empty` value. Preview UI may change; selected saved
records must still be empty at that checkpoint. A stale visible preview,
ambiguous/disabled control, missing/wrong preview, early success or early saved
write is INCONCLUSIVE. The runner attempts one click and never retries it.

After the click, new completion, complete selected saved records, the
pre-navigation comparison and reload are still required. With missing
completion, unchanged fresh storage or a complete matching restoration is
INCONCLUSIVE (`IMPORT_COMMIT_COMPLETION_NOT_OBSERVED`); a changed, nonmatching
saved record is FAIL. A toast or record count cannot conceal a lost field.

Reports add only `importCommit` readiness/attempt/click metadata and
`comparisons.beforeCommit`, not captured preview text, filenames or values.
Declared selectors and exact expected text still appear in the contract/spec.
These checks establish UI ordering and sampled saved-state comparisons, not
the app's internal causal function. Review that the selected control is the
app's actual import commit. Unrelated delayed UI with identical selectors/text,
or writes entirely between observation points, cannot be causally ruled out.
More than one commit, pre-commit selected-storage writes, ID rewriting and
mixed native/DOM confirmations remain unsupported.

## Before the first run

Start the disposable app and open the target route once so its first build is ready.
Choose a bounded `timeoutMs` appropriate to that app (for example, `15000` for
a development build that needs more than the default 3 seconds). A setup timeout
is INCONCLUSIVE, not evidence that the app lost data; retain it when correcting
the startup or contract. Do not add delays that conceal an actual save defect.

[The TOEIC Tracker example](examples/toeic-tracker/README.md) creates a review,
vocabulary and a score, and keeps all ten exported domains in the comparisons.
It includes a pinned-app startup and a complete DOM-commit configuration.

## What is actually checked

1. Save through the source UI in a fresh context, confirm the known baseline,
   then sample the complete selected state through `stabilityMs`. At least one
   stored value must differ from the declared empty target.
2. Run `export.steps`, capture exactly one real download, and retain its
   **unchanged bytes**. After export steps finish, listen for `timeoutMs`, then
   continue listening through restoration. Downloads after the check ends are
   outside coverage. Missing, failed, multiple or oversized downloads are
   INCONCLUSIVE. `maxBytes` is required, 1..1048576. Invalid UTF-8 or a payload
   that is not a JSON object/array fails.
3. Compare the downloaded JSON with the source. `statePaths` must map **every**
   selected storage observation to an array of JSON keys/indexes; `[]` means
   the whole payload. Missing paths, different data, or source storage changed
   by export fail. UI observations do not need a payload mapping.
4. Open a **separate context**, go to `restore.path`, run nonempty `ready`
   steps, and verify `restore.empty` for **every** selected observation.
   Existing target data or an already-true success signal is INCONCLUSIVE.
5. Upload the same Buffer, without parsing and reserializing it. Use the actual
   suggested download filename, or optional declared `restore.fileName`.
   `restore.mimeType` explicitly declares the upload type; download MIME
   sniffing is not provided. Filenames cannot be paths/control characters.
6. If `restore.commit` is declared, verify its new preview, unchanged selected
   empty storage and absent success signal, then click its declared button once.
7. Require a new `success` signal. If `restore.after` navigates to a record
   view, first compare **all selected saved storage values** with the source;
   a missing or changed value fails before navigation. Then run the optional
   view/observation steps and compare **all** selected storage and UI values.
   Reload, run optional top-level
   `afterReload`, and compare again through bounded stability windows. A toast
   or unchanged record count cannot hide a lost field. Changed state and failed
   restoration are FAIL. Missing completion follows the DOM rule above when
   `commit` is selected; the existing direct/native path remains FAIL.

Readiness hooks `restore.ready` and `afterReload` permit only `expectText`,
`expectValue` and `expectVisible`. In0.6.2+, `restore.after` may also contain
**one** `goto`, after all selected saved storage values have been checked.
A later view cannot hide fields already lost during import. Multiple view
navigations are rejected so one route cannot repair another route’s loss.
Hooks cannot click a repair button or upload replacement data.

Version0.6.1 rejected `goto` in every backup hook, including its shipped
DevTasks contracts. Use0.6.2+ for those contracts; their configuration error
in0.6.1 is separate from the app’s measured restore failure.

Existing contracts still default to the original reload/rejected-update pair.
Backup settings require explicitly selecting `backup-roundtrip`. This does
not turn ordinary preservation checks into backup checks silently.

## Scope and artifacts

This first mode supports **browser-local JSON data only**. It requires
localStorage/sessionStorage/IndexedDB state and rejects `response` state or
explicit `request` steps. Declaring `browser-local` does not audit the app or
isolate a shared backend. Do not use accounts or valuable data. Shared server
records, multi-step or mixed native/DOM commit flows, encrypted/ZIP/binary backups and
intentional nondeterministic ID rewrites need another contract. A single exact
restore confirmation is opt-in as described above. Unexpected
native dialogs are dismissed and make the check INCONCLUSIVE.

For this check, observed state, download bytes, dialog messages and suggested
filenames are omitted from reports. Reports contain phase, verdict, byte
length/hash and comparison results. No runner screenshot/trace is recorded;
the generated standalone spec closes app contexts before asserting. **Declared
contract/setup inputs are still saved verbatim.** Other selected checks retain
their existing state/screenshots/traces. Browser download temp files can exist
during execution; this is not secure erasure or a promise about OS caches.
Use synthetic inputs and review all artifacts before sharing.

CLI exit codes: 0 PASS, 1 FAIL, 2 INCONCLUSIVE. Standalone Playwright preserves
the result status/phase in its JSON attachment and assertion, but native
Playwright exits 1 for both FAIL and INCONCLUSIVE. Inspect `status`; a red test
does not always mean a confirmed app bug. Nothing is skipped or changed to PASS
to make a suite green.
