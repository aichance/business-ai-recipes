# State Lens: selected values beside the UI steps

Current download: **0.4.0-experimental.1**. The authored control below began in0.1;
its preserved recordings remain linked on the replay page. The current0.4
synthetic rerun retains both native-agreement outcomes. [Date values and type
annotations](state-lens-dates.md). [Recorded report and trial entry](https://aichance.github.io/business-ai-recipes/state-lens.html).

The use case is an existing Playwright test whose UI says Saved, but a later
operation changes a draft. Select known localStorage/IndexedDB values and wrap
the existing actions. One local HTML aligns screenshots and field differences.
Keep the test's normal assertions. This is an observation helper.

**Held IndexedDB writes:** a selected read can wait behind an unfinished write.
In an authored fixture, wrapping the gate release delayed that callback793ms
with the default750ms read timeout. Release and await commit before observing
that store. [Four placement controls and runnable example](state-lens-held-writes.md).

## Measured broken and normal controls

These are operator-authored, synthetic Draft Desk apps on loopback. They are
not a production app, an external user's result or a new vulnerability.

| Same save/reload flow | After save | After reload | Standard snapshot agrees |
| --- | --- | --- | --- |
| Authored reload-loss control | body `Keep this launch draft`, revision1 | body empty, revision2 | Yes |
| Normal control | body `Keep this launch draft`, revision1 | unchanged | Yes |

Both flows record four checkpoints. The broken report selects the body and
revision changes in both chosen stores. The normal report has no post-reload
field difference. [Machine-readable comparison](state-lens-measurements.json).

**Explicit native `storageState({ indexedDB: true })` snapshots captured the
same selected values in these controls.** State Lens adds explicitly selected per-step field differences
and the captured viewport in one HTML. It does not discover hidden database
events, infer commit timestamps or guarantee a root cause. Developer time savings
and independent adoption have not been measured.

### Inspect the native Trace values

The current demo's native baseline explicitly calls
`context.storageState({ indexedDB: true })` four times. Those return values
also appear in the saved Trace's `after.result` records. Trace recording alone
was not tested as an automatic IndexedDB history recorder: the baseline adds
those four capture calls. State Lens and the baseline are separate fresh-context
runs of the same authored fixture, not simultaneous observations of one run.

From a newly generated demo output directory, this standard-library Python
example reads only the known synthetic `drafts / notes / current` record from
the native archive. It does not require State Lens or open an application:

```sh
python3 - reload-loss-standard-trace.zip <<'PY'
import json, sys, zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    events = [json.loads(line)
              for name in archive.namelist() if name.endswith('.trace')
              for line in archive.read(name).decode().splitlines() if line]
calls = {event['callId'] for event in events
         if event.get('type') == 'before'
         and event.get('method') == 'storageState'
         and event.get('params', {}).get('indexedDB') is True}
for event in events:
    if event.get('type') != 'after' or event.get('callId') not in calls:
        continue
    records = [record['value']
               for origin in event.get('result', {}).get('origins', [])
               for database in origin.get('indexedDB', []) if database['name'] == 'drafts'
               for store in database['stores'] if store['name'] == 'notes'
               for record in store.get('records', []) if record['key'] == 'current']
    print(json.dumps(records[0] if records else None))
PY
```

For this authored control the four lines are `null`,
`{"body":"Keep this launch draft","revision":1}`, that same saved value,
then `{"body":"","revision":2}` (JSON whitespace can differ).
Running the example with `good-standard-trace.zip` ends with the unchanged
saved value. All four native values agree with the corresponding State Lens
checkpoints in each control. The broken State Lens report additionally lists
the selected `body` and `revision` differences beside its screenshots; the
normal report lists no post-reload difference.

If explicit native snapshots or your existing logs/attachments already answer
the question, they are a sufficient alternative. The proposed State Lens
benefit here is selected-field organization in one HTML, not unique data
capture, demonstrated time saving or a claim that Trace cannot show the values.
The command reads a Playwright1.64 trace layout observed in this demo; other
trace formats are unverified. Reproducing it is an operator experiment, not
an external own-project trial.

## Existing plain-Playwright consumer

[The nvim-edu native integration](state-lens-nvim-native.md) retains the existing
assertions: 43 PASS normally and the same four failures in an authored overwrite
control. Both 16-checkpoint HTML reports and the executed harness bodies are
available. Its eight explicit native storage snapshots agree with the selected
values. This is an operator integration experiment, separate from adoption.

## Reproduce

From `tools/playwright-state-lens` in the source checkout:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run test:consumer
npm run demo -- /a/new/output/directory
```

Use a new output directory. The demo prints its location and writes both HTML
reports, their JSON, standard storage snapshots, standard traces and the
comparison. Opening the static public page replays those recorded observations;
it does not run against your browser's storage or another app.

The local checks used Node22.23.4 and Playwright1.64.0 with actual Chromium:
The original0.1 verification passed14 behavior tests and one ordinary
Playwright-runner consumer test. Current0.4 includes additional Date, undefined
and sessionStorage regressions; the bundled source tests reproduce them.
An extracted npm tarball omits package-lock by npm design; use
`npm install --ignore-scripts` there. An existing app can
[install the same common package directly](../tools/playwright-state-lens/README.md#add-it-to-your-existing-playwright-test).

## Limits and useful trial feedback

- Select known keys. There is no general store enumeration. Unsupported values,
  inaccessible stores and out-of-origin pages remain INCONCLUSIVE.
- Reads and screenshots are sequential. Action completion is not a PASS result.
  App assertions establish expected behavior separately.
- The local HTML contains selected data and screenshots. Review it before sharing.
  No account, telemetry, model call or API key is required by the library.
- The same library is used in all examples. Other browsers and Playwright
  versions have not been verified.

For an own-app trial, report the version, workflow, whether the result helped
compared with your normal trace, and any setup blocker. A sanitized summary is
enough; no private app data or source is needed. Demo runs and our own tests are
not counted as independent adoption.

[Report a result or blocker](https://github.com/aichance/business-ai-recipes/issues/new?title=%5BState%20Lens%5D%20Own-app%20trial).

## TypeScript integration, 0.4.1

The runtime test alone was insufficient: adding common0.4 to a pinned Bloggr test passed the browser run but failed its unchanged TypeScript check with TS2353. Common0.4.1 passed both after explicit input JSDoc and matching declarations. [Exact settings and type checks](state-lens-typescript.md) · [Native case, original assertions and recorded timeline](state-lens-bloggr-native.md). This is operator verification with synthetic routes, not a new upstream bug or an external user.
