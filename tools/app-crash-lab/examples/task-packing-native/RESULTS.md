# JSON restore, persistence and manual recovery

Operator measurement on 2026-10-20 UTC, using Node 22.16.0,
Playwright 1.64.0 and Chromium. Each case uses a fresh desktop context
(1440 × 2000, `en-US`), empty storage, synthetic data and the unchanged local
Task Packing `ca4b13b145a1636a2ba375bc139906e1225b98f3` HTML.

Source SHA-256:
`370b181375c78dd081824b14188869af09257590f0f1e6c5938d0ef1c9ea4158`
(166,995 bytes). The original source remains unchanged after execution.

## Two passing controls

1. The real task form creates A and persists the complete record. A reload
   retains it byte-for-byte and renders the synthetic task.
2. A valid backup B changes the synthetic task's title and note, the board's row
   count, and completion history. The real JSON import persists the entire B
   state; reload retains that whole state and renders B.

B is derived from a real downloaded A backup, using the same schema and all
original task fields. The comparison includes every task/history item, ID,
ordering, flag, note, placement and timestamp; counts alone do not decide PASS.

## One failed save-completion check

The test first successfully reimports A to learn the app's ordinary restore
message, `Backup restored`. Only the exact localStorage state-key write is then
made to throw a synthetic `QuotaExceededError`. Other keys delegate to the
original method. The same real file input imports the same valid B.

Observed on the original:

- One real denied write, carrying the complete B record.
- New `Backup restored` toast after that attempt; B appears in the task list,
  along with the incoming board setting and history.
- No new matching persistence/temporary-state warning at the declared feedback
  checkpoint. The old successful control toast cannot satisfy this observation.
- Durable A is still byte-identical.
- Before reload, the actual browser JSON download contains **the complete B**.
- The controller is removed; reload shows A again, and the full stored A remains
  byte-identical. B is absent from the task list.
- No unexpected native dialogs or application page errors.

The test finishes recovery observations before asserting the retained failure
at `SAVE_COMPLETION`. A later export or reload cannot turn the earlier misleading
success into PASS. The source has existing invalid-backup and stale-import
protections; this example does not claim those protections are missing.

## Sensitivity control

The **same unchanged spec** was also run against a separate local hypothetical
copy. That copy returns write success/failure from `writeStorage` and `saveState`;
the JSON-restore path restores its previous in-memory state and displays a
specific warning when the required save fails, before clearing transient UI.

All three checks pass on that copy. The failed import keeps A, displays the
failure warning, and its manual export contains A. This is an operator-created
control, not an upstream release, a general fix for every save path, or author
execution. No original or modified application HTML is redistributed here.

## Boundary

These results cover a pinned local source and an exact-key synthetic write
rejection. They do not establish a real user's lost data, physical quota
exhaustion, a deployed-service defect, all task/Undo flows or independent
adoption. The previous saved record survived; the incoming restored state was
temporary until manually exported. The useful regression is to make that
outcome explicit and preserve the whole existing record.
