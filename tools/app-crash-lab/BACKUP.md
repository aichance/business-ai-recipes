# Does the app restore its own backup? (runner 0.6+)

A malformed file can be safely rejected while a valid, self-exported backup
cannot be restored. This optional check runs the real export/import flow.

For your own app, [copy the backup-specific coding-agent prompt](https://aichance.github.io/business-ai-recipes/app-crash-lab.html#backup-agent).
It links the pinned 0.6.2 format and asks the agent to inspect your real import,
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
6. Require a new `success` signal. If `restore.after` navigates to a record
   view, first compare **all selected saved storage values** with the source;
   a missing or changed value fails before navigation. Then run the optional
   view/observation steps and compare **all** selected storage and UI values.
   Reload, run optional top-level
   `afterReload`, and compare again through bounded stability windows. A toast
   or unchanged record count cannot hide a lost field. Missing completion,
   changed state and failed restoration are FAIL, not success.

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
records, native confirmation dialogs, encrypted/ZIP/binary backups and
intentional nondeterministic ID rewrites need another contract. Unexpected
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
