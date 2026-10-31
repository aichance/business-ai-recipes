# Own-app report: display formatting versus saved numeric value

Sethera's author, cuculhart, [publicly reported this run on 2026-10-30 at 23:18 JST](https://qiita.com/cuculhart/items/f020080b2ef1331222d0#comment-bebf70de821763f86f51).
The report describes the **common State Lens 0.4.1-experimental.1 file** in the
author's own app. It is separate from earlier App Crash Lab runs. The summary
below is attributed to the author; the operator did not access their machine,
source changes, app data or generated report.

## Reported environment and setup

- Windows, Node 22.23.4, Playwright 1.64.1.
- Unchanged [Sethera v2.0.0 source](https://github.com/cuculhart/sethera-piece/tree/d74d47e18fd03543a178355589c3e2a70422d4c3), newly cloned and started in development mode.
- Common State Lens 0.4.1 `.mjs`, with its SHA256 checked against the public value.
- A small Playwright script written by the author: the app had no existing
  Playwright tests. The author added `createStateLens` to its own `page` and
  selected only the JSON localStorage key `sethera-doc`.
- Synthetic numeric data; the script retained its save/debounce waits and assertions.

## What the author checked

The scenario entered 1234.567 in a numeric piece, changed its display settings to
two digits with `floor` rounding, waited for autosave, then reloaded the app.

The author reported:

- The formatting step changed `nodes.0.data.digits` from absent to 2 and
  `nodes.0.data.dispRound` from absent to `"floor"`; the numeric `data.value`
  did not appear among the changed fields.
- Reload introduced no further selected-field differences. Both the number
  and its formatting were retained; the displayed number became 1234.56.
- The script's assertions passed, with saving/readiness still controlled by
  the caller rather than by State Lens.

This checks a specific distinction: a display-format operation can change
format fields while leaving the underlying numeric value unchanged. It does
not prove all application calculations or persistence paths correct.

## What helped compared with Trace

The author found the per-step field differences beside screenshots in one HTML
easier to inspect than opening Trace snapshots for this question. The relevant
question was which fields changed and which stayed unchanged after a UI step.

This is one qualitative comparison. Standard Trace remains useful and should
be kept; no measured time reduction or additional data-capture capability is
established by this report.

## Limits found in actual use

**A fixed output path fails on rerun.** `writeHTML` uses exclusive creation
(`wx`). An existing HTML path produces `EEXIST`, preserving the prior report.
Use a new directory for each invocation instead of deleting or replacing that
report: [copy the plain Playwright output recipe](state-lens-install.md#rerun-without-replacing-a-report).
The common 0.4.1 module is unchanged.

**The selected value must fit the limit.** The author found that a normal
`sethera-doc` can exceed 64KiB even without images. Such a probe is
`INCONCLUSIVE`; the successful scenario used a small synthetic document.
This example does not make the full real document observable, add a projection
API, or remove the size/depth limits.

The author also reviewed the single-file source before running it and reported
that the selected key and viewport screenshots remained in a local report.
Do not send application data or the HTML to reproduce this use case.

## Updated-version reuse: 0.5 on a larger document

In a [follow-up on 2026-10-31 at 08:59 JST](https://qiita.com/cuculhart/items/f020080b2ef1331222d0#comment-96ff5eafacaf7ad7c461),
the author reported checking the common **0.5.0-experimental.1** module's SHA256
and running it on the same unmodified v2.0.0 in a fresh clone:
Windows, Node 22.23.4 and Playwright 1.64.1.

The author imported 300 CSV rows by two columns, about 600 pieces, making
`sethera-doc` approximately **132,000 bytes**. The report describes:

- The whole-document probe remaining `INCONCLUSIVE`, while three selected
  pointers remained `OBSERVED` in the same HTML.
- Formatting changing `n0.digits` from absent to 2 and `n0.dispRound` to
  `"floor"`; the numeric value did not appear in the differences.
- Zero selected-field differences after reload; display changing from
  1234.567 to 1234.56.
- Missing-path metadata distinguishing a placeholder `null` from a saved
  null value, and the `mkdtemp` output recipe allowing another run.

The author used an assertion to keep `nodes[0]` tied to the intended piece;
the CSV import appended without reordering it. Operations that reorder an
array need their own identity checks. The report recommends combining selected
step differences with independent full-document assertions; it does not
establish an executed whole-document comparison. This is the same developer's
updated-version reuse, separate from the first 0.4.1 run.

## Try the same kind of question in your own app

Choose a small synthetic workflow you already understand: one UI operation
that should change a known setting while preserving a saved value, followed
by reload. Keep your existing readiness waits, assertions and ordinary Trace.
Add the [same common library](state-lens-install.md) to the caller's Playwright
page, selecting one known key. A useful report can be a concrete difference,
a setup blocker, or confirmation that Trace already answers your question.

The Windows outcome above remains the author's report for this environment
and workflow. It is not an operator-run Windows verification or a broad
browser/platform support guarantee.

## Field-selection evidence and limits

The 0.5 release adds explicit JSON-pointer observations while retaining the 64KiB
selected-output limit. [Configuration and synthetic operator evidence](state-lens-selected-fields.md)
are separate from the author's updated-version reuse described above.
The original 0.4.1 report covers the small-document run; the later 0.5 follow-up
covers three selected pointers in the larger document. Neither report establishes
whole-document comparison coverage or a measured improvement in diagnosis time.
