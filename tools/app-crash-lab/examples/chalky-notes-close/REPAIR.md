# A local repair candidate for Chalky's last-edit loss

The original [two-condition reproduction](README.md) still targets unchanged
Chalky `4bf2b174243b3c20e44ef3e7d612de410f44b4b1`. This supplement tests an
explicit commit boundary: read the current editor document, preserve untouched
Markdown bytes, and finish the local write before the panel disappears.

This is an **AI-assisted local repair candidate**, not an upstream release or
an author-confirmed fix. The public Chalky site was not modified or tested.

## What the comparison checks

`commit-paths.spec.mjs` uses a fresh anonymous browser context per test:

- Close button, Escape and blur, with no added delay and with a 350ms control.
- Untouched noncanonical Markdown bytes and all saved task fields remain
  unchanged across close, Escape and blur.
- A second edit after blur; filled text followed by close/Escape and immediate
  reload after the panel has disappeared; a notes-only new task followed by
  **Save and add another**.
- Two additional controls reject exactly one local IndexedDB write, then
  check recovery on the same task and after visiting another task.

On 2026-10-11, macOS / Node 22.16.0 / Playwright 1.64.0 / Chromium:

| Check group | Unchanged source | Local candidate |
| --- | --- | --- |
| Same 13 normal-save / unchanged-note conditions | 6 pass, 7 fail | 13 pass |
| Two one-shot write-rejection recovery controls | Not compared | 2 pass |

The final candidate run is 15/15. `npm run check` reports zero errors and
warnings; `npm run build` succeeds with a large-chunk warning.
See [results-summary.json](results-summary.json) for the tested files' hashes
and measured outcomes. Times are observations on one machine, not thresholds.

The fast close/Escape paths wait for the panel to become hidden, a visible
completion condition. They add no fixed sleep before closing. The 350ms waits
remain in baseline setup, deliberately delayed controls and untouched-note
controls; removing them everywhere would change the experiment.

## Run the extended comparison

Download the [extended test bundle](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/chalky-notes-commit.zip)
or use this folder from the repository. Use the
[pinned-source setup](README.md#run-the-two-condition-diagnostic) first. Keep the
unchanged checkout for the comparison and use a separate disposable checkout
at the same revision for the candidate. In the **candidate app checkout**:

```sh
git apply --check /path/to/chalky-notes-close/repair-candidate.patch
git apply /path/to/chalky-notes-close/repair-candidate.patch
npm run check
npm run build
npm run dev -- --host 127.0.0.1 --port 54197 --strictPort
```

In this **test folder**, after its existing `npm ci --ignore-scripts` and
`npx playwright install chromium` setup:

```sh
# Unchanged app running on 54196: seven failures are expected on the pin.
CHALKY_BASE_URL=http://127.0.0.1:54196 npx playwright test --config commit-playwright.config.mjs --grep-invert 'rejected write'

# Candidate running on 54197: all 15 conditions should pass.
CHALKY_BASE_URL=http://127.0.0.1:54197 npx playwright test --config commit-playwright.config.mjs
```

Preserve each `commit-test-results/` directory before another run. The test
prints the three boundary measurements and attaches synthetic saved records,
screenshots and traces. It refuses a non-loopback origin. HTTP requests
outside that origin and service workers are blocked; no account or PDS is used.
The one-shot rejection is injected only in fresh test browser contexts.

## Why the candidate needs more than `getMarkdown()`

1. Milkdown's debounced listener may not have updated the bound draft when
   close/blur occurs. `flush()` reads the live document at that boundary.
2. Serializing an untouched note can normalize its bytes. A separate
   serialized baseline avoids writing that normalization back merely because
   the user opened and closed the note.
3. A blur can update the in-memory task while its IndexedDB write is still
   pending. Close must await that write even if the draft already matches the
   in-memory record.
4. A rejected write must stay associated with its task and remain retryable.
   Reusing one rejected promise for every later task would prevent closing.

Earlier local candidates failed the untouched-note check or an immediate
reload after editing again. Those failures prompted the separate serialized
baseline and awaited persistence. A further review exposed rejected-promise
reuse; the two failure controls exercise the corrected path. A passing
keyboard-only test was not treated as proof that filled-text reload worked.

## Limits

This is a candidate for the tested close/blur paths, not a complete durability
audit. Safari, Firefox, IME composition, PDS sync, offline startup, multiple
tabs, persistent storage failure and arbitrary rapid task switching have not
been verified. Snooze, move and delete have other terminal paths and are not
covered by this comparison. There is no claim about a reload that interrupts
an in-progress save before the panel closes, or a machine/browser crash.

The patch contains our local changes plus minimal context from
[Chalky's source](https://tangled.org/tyler.fun/chalky.town); it does not bundle
the app. Apply it only to the stated revision and review it before keeping it.
The tests are a separate Playwright diagnostic. App Crash Lab's original CLI
run stopped at `INCONCLUSIVE` baseline establishment; it did not itself report
these seven failures or implement this repair.
