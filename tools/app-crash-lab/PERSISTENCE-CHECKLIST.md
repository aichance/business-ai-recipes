# Eight persistence and save-outcome checks to keep in your test suite

Use these eight observed boundaries to choose an assertion for your own app.
Each row links to an actual test or contract, a pinned app version and its
reproduction steps. The tests use synthetic data on disposable local copies.
These are our AI-assisted operator experiments; the cited maintainer fix is
separate from an independent run of App Crash Lab.

Already using Playwright? Start with [an earlier tab's save](#6-protect-another-tabs-committed-edit),
[a mandatory save that fails](#7-make-a-rejected-save-visible), or
[optional history that fails after successful work](#8-keep-optional-history-failure-separate-from-the-main-result).
Each has a native file you can adapt in your existing suite, with no App Crash Lab runtime.

| What your test already checks | What can still break | Add this assertion | Copy a measured example |
| --- | --- | --- | --- |
| An export downloads; an ordinary import works | The app rejects an edge-case record its own UI allowed and exported | Restore the actual download for both an ordinary record and a valid edge case | [DevTasks: custom categories](examples/devtasks/README.md#adapt-the-test-to-your-own-app) |
| Restore returns success; message count and bodies match | A reply loses its parent relationship | Compare the source's complete message DTO, including the relation, with an independently empty target | [WA-archiver: reply relationship](examples/wa-archiver/README.md#reproduce-the-real-backup-diagnostic) |
| All selected stored records survive backup and reload | The saved record cannot be found in its normal screen | Assert the user's expected view as well as the complete saved record | [Repwise: completed History entry](examples/repwise/README.md#run-against-a-disposable-local-copy) |
| A previously saved note survives reload | The last keyboard edit disappears when its editor closes | Type a new value, close immediately, reopen and compare that new value | [Chalky: final note edit](examples/chalky-notes-close/README.md#run-the-two-condition-diagnostic) |
| Delete removes a saved record | A previously scheduled autosave writes the deleted ID back | Prove the delete committed, then keep that ID absent through the timer window and reload | [Perma Design Kit: native deletion regression](examples/perma-native-delete/README.md) |
| A save and reload work in one tab | An earlier tab re-saves stale fields while changing an unrelated setting | Confirm the peer's actual separate commit, preserve the complete primary record and reload; keep same-tab and fresh-peer controls | [LivePage: saved tree](examples/livepage-native/README.md), [Naidan: system prompt](examples/naidan-native/README.md) |
| The previous saved record survives a rejected write | The user receives no visible notice that the new save failed | Deny the exact real write, prove the UI attempted it, and check both complete-record preservation and a specific visible failure notice | [Kinetic Curator: write denial](examples/storage-write-denied-native/README.md) |
| The main operation succeeds before its optional history write fails | A generic Error incorrectly labels the successful operation as failed | Keep the distinct new business result usable, preserve old history, accept a truthful history-only warning, and retain a genuine main-failure control | [MAL: optional translation history](examples/optional-history-native/README.md) |

**Start with one row.** Follow its linked app setup and test instructions to
reproduce the control and failure, then adapt that test's selectors and saved
values to your own disposable app. The examples do not discover another app's
controls automatically. You can keep the ordinary Playwright tests in an
existing suite; no App Crash Lab runtime is required by the standalone specs.

## 1. Restore what the app really exported

On [DevTasks `d59dc107`](examples/devtasks/README.md), the UI created a valid
task with the custom category `DOCS`. Its actual JSON download was rejected by
the same app in a fresh browser context. A built-in `FEATURE` category restored.
The normal reload and invalid-file preservation checks had passed.

Keep two valid source cases, capture the real download from each, and upload
those same bytes to a target you have proved is empty. Compare every selected
record field after import and reload, then open the screen that uses it.
Building a new JSON fixture from the expected fields can bypass the export
defect you intended to test.

- **Copy:** [the standalone roundtrip spec](examples/devtasks/backup-roundtrip.spec.mjs).
- **Adapt:** [four edit areas, full setup and expected exit codes](examples/devtasks/README.md#adapt-the-test-to-your-own-app).
- **Existing runner:** [FEATURE control](examples/devtasks/roundtrip-feature.json) and [DOCS regression](examples/devtasks/roundtrip-docs.json), App Crash Lab0.6.2+.

On that pin, the valid `DOCS` restoration assertion should fail. A passing
invalid-import rejection test would establish a different property.

## 2. Compare relationships against the source

On [WA-archiver `7983cd4e`](examples/wa-archiver/README.md), a server-mode backup
restored all three message bodies and returned HTTP200 with
`messagesImported: 3`. A reply's `replyTo` became `null` and its quote disappeared.
The ordinary reload and malformed-import preservation checks both passed.

Include at least one parent/child or referenced record in the source fixture.
Compare its normal source API representation with the restored representation,
including the reference and the visible quote. Comparing only two exports can
miss a field omitted from both files.

- **Copy/run:** [the server-mode diagnostic](examples/wa-archiver/native-backup.mjs) and [its complete setup and dependency requirements](examples/wa-archiver/README.md#reproduce-the-real-backup-diagnostic).
- **Inspect without running:** [synthetic backup](examples/wa-archiver/sample-backup.json), [measured summary](examples/wa-archiver/results-summary.json) and [before/after screenshots](examples/wa-archiver/README.md).

The diagnostic uses **two separate disposable SQLite databases**. A fresh
browser context alone does not clear a shared server database. This case uses
separate Playwright code; it does not establish built-in CLI backup support for
server SQLite. It was measured on macOS; other platform limits are in the guide.

## 3. Read the saved record through its real screen

On [Repwise `40321419`](examples/repwise/README.md), a completed workout and all
six selected business stores survived the real backup roundtrip. History still
showed no completed workout, even before export. The History contract returned
**INCONCLUSIVE at baseline**, because the expected starting view was absent.

Add a view assertion for the record users will need: a completed workout in
History, a saved note in search, or an imported task in its list. Establish that
view before testing reload, and check it again afterward. Keep the full saved
record comparison as well.

- **Copy:** [History reload contract](examples/repwise/history-reload.json) and [backup contract](examples/repwise/roundtrip.json).
- **Replay:** [pinned setup, both outcomes and the later fix](examples/repwise/README.md).

The maintainer later reported a 1.2.1 fix. Our retest of the unchanged source at
`6ee82061` passed the existing History contract without weakening its expected
value. These operator retests do not establish maintainer execution of the tool;
the [independent tool-use reports](../../README.md#independent-author-reports)
describe other authors' executions.

## 4. Keep the last edit when closing the editor

On [Chalky `4bf2b174`](examples/chalky-notes-close/README.md), a real keyboard
edit displayed `x`. Closing the editor 42ms after that edit reopened the old
`Synthetic baseline`; the old value also survived reload. A separate 350ms-delay
control measured 377ms and retained `x`. Those two timings do not establish a
universal threshold or a reliable save-completion signal.

Start from a saved baseline, type a distinguishable new value with real
keyboard events, close promptly, reopen and reload. Assert the **new value** at
both points. Record the actual edit-to-close interval so a slow test does not
quietly miss the window. A fixed sleep belongs in the explicit diagnostic
control; it does not demonstrate that an immediate close is correct.

- **Copy/run:** [the small diagnostic ZIP and its instructions](examples/chalky-notes-close/README.md#run-the-two-condition-diagnostic).
- **Inspect the assertions:** [the two-condition keyboard spec](examples/chalky-notes-close/notes-close.spec.mjs).

The initial App Crash Lab setup could not establish a saved note and correctly
returned baseline INCONCLUSIVE. The keyboard comparison is a separate
Playwright diagnostic. This does not claim machine-crash durability or a
confirmed upstream repair.

## 5. Keep a deleted record deleted

On [Perma Design Kit `426ebb6`](examples/perma-native-delete/README.md), moving
a plant and deleting its plan before the 500ms autosave made the deleted ID
reappear in IndexedDB. The test first observed a completed deletion; the
restored record then survived reload. Waiting for the moved plant to save
before deleting passed, through both the editor and the list.

Check absence by **the deleted ID**, not just total count or a success toast.
Protect the complete retained records, establish the actual edit-to-delete
timing and latch any sampled resurrection even if a later step repairs it.
Check orphaned per-record UI settings separately: the editor deletion retained
a view key even when the plan itself stayed deleted.

- **Copy:** [one native file for the existing Playwright suite](examples/perma-native-delete/delayed-delete.e2e.ts).
- **Replay:** [six scoped cases, timings, actual images and setup](examples/perma-native-delete/README.md).

The measurement covers the unchanged public static build on Chromium, not
the installed iOS PWA, private Team build or separate backup-import hang.

## 6. Protect another tab's committed edit

On [LivePage `915f828f`](examples/livepage-native/README.md), same-tab and freshly
opened-tab controls preserve the saved title and row. An earlier tab's toolbar
click loses both, even though its separate `false → true` toolbar preference
really commits. On [Naidan `78f207e7`](examples/naidan-native/README.md), an
earlier Connection settings form disables auto-title and restores an old system
prompt saved before another tab's newer prompt. The original primary document
still sees the old prompt after reload. Both Naidan controls pass.

Open the peer before making the primary edit. Establish the actual new primary
commit, change only a different persisted field through the peer's ordinary UI,
and prove the peer's own change committed. Compare every protected record field
afterward and after primary reload. A correct synchronization fix may refresh
the peer; do not inject stale storage or require the form to remain old.

- **Copy/adapt:** [one native two-tab spec and its four marked adaptation areas](examples/livepage-native/README.md#adapt-it-to-your-own-app).
- **No model setup:** [the Naidan standalone-HTML test and small ZIP](examples/naidan-native/README.md).
- **Different storage:** [OSW Studio's IndexedDB thumbnail-only save](examples/osw-native/README.md) protects full project metadata and file records.

Keep both controls. A failed startup, unhydrated peer or absent real commit is a
precondition failure, not proof of a lost edit. Decide how your app represents a
legitimate conflict refusal: it must preserve the complete previously committed
record and tell the user that the attempted edit did not save. The Naidan adapter permits that
specific visible refusal; the LivePage adapter instead requires the actual
toolbar commit and treats unsupported native dialogs as a precondition failure.
These ordered cases do not establish simultaneous-write correctness.

## 7. Make a rejected save visible

On [Kinetic Curator `b086c9b0`](examples/storage-write-denied-native/README.md),
the normal control saves two complete keep records and survives reload. Denying
the exact ledger write with a synthetic `QuotaExceededError` leaves the previous
ledger unchanged, but produces no matching visible save-error notice. Its
regression fails at **FEEDBACK**, not at data preservation.

Save the baseline through normal UI before installing a narrowly targeted
fault. Confirm a real attempted write reached that fault; otherwise there was
no failed-save experiment. Assert the complete previous record remains intact
and require a new, specific visible notice for the failed save. A console error
or an unrelated pre-existing toast is not that notice.

- **Copy/adapt:** [the 109-line native write-denial spec](examples/storage-write-denied-native/write-denied.spec.mjs).
- **Run:** [normal control, full setup, expected FEEDBACK failure and ZIP](examples/storage-write-denied-native/README.md).

Restore the original storage descriptor in `finally`. This example denies one
localStorage key in one document, samples for 1000 ms and does not test actual
disk exhaustion, IndexedDB or server-write errors. Adapt the fault and completion
boundary to the storage your app really uses.

## 8. Keep optional history failure separate from the main result

On [MAL `216005fa`](examples/optional-history-native/README.md), a locally
fulfilled translation succeeds and its new result stays visible. Only the
optional history write is denied; the previous durable history remains intact.
The app nevertheless displays an unqualified Error. The regression fails at
**OUTCOME**. This is misleading failure feedback, not vanished translation output.

Establish a distinguishable new business result before judging the storage
fault. Keep separate normal-success and genuine-provider-failure controls.
Accept a truthful "translation completed; history not saved" warning without
suppressing real translation failures. Use a signature for your app's actual
visible wording and locale; arbitrary Error text, a hidden stale error, or a
previous result left on screen cannot establish the same failure.

- **Copy/adapt:** [the native optional-history spec](examples/optional-history-native/optional-history.spec.mjs).
- **Run:** [local provider responses, controls, exact history key and standalone ZIP](examples/optional-history-native/README.md).

The measured pin has two passing controls and one OUTCOME failure. The provider
responses are stubs; the test does not establish real model availability or
translation quality. Hypothetical corrected-copy controls described in the
guide validate the oracle and are not upstream fixes or author adoption.

## Before keeping a green test

- [ ] The baseline really contains the complete expected saved value.
- [ ] A valid edge case created through the UI is included.
- [ ] Restore uses the original download and an independently empty target.
- [ ] IDs, references, timestamps and optional fields you rely on are compared.
- [ ] The record is usable in its normal screen after restoration and reload.
- [ ] Another tab's real disjoint save preserves the complete committed edit.
- [ ] A mandatory save failure is visible even when the old record stays safe.
- [ ] An optional history failure does not mislabel successful work or hide a real main-operation failure.
- [ ] A known broken version fails the intended assertion; setup errors and
      missing baselines remain distinguishable from preservation failures.

For your own app, [copy the agent setup prompt](https://aichance.github.io/business-ai-recipes/app-crash-lab.html#agent)
or the [real JSON backup prompt](https://aichance.github.io/business-ai-recipes/app-crash-lab.html#backup-agent).
The prompt asks your existing coding agent to inspect the actual workflow,
choose observations, run the check and leave a repeatable test. Review what it
asserts; this checklist does not certify an app's entire database or behavior.

If you want to find these regression patterns before a later release,
[star the repository](https://github.com/aichance/business-ai-recipes).
Starring is optional. [Report an own-app result or setup blocker](README.md#contribute-a-real-use-case)
if you try a check; include the tested app and runner version and remove private
data from anything you share.
