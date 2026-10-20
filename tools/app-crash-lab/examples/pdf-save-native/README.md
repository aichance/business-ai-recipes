# Cancelling a PDF save must not report a saved file

[**Run the real-app example in your browser**](https://aichance.github.io/business-ai-recipes/pdf-save-lab.html) or copy **one [Playwright spec](pdf-save.spec.mjs)** into your test suite. The spec embeds its synthetic two-page PDF. No App Crash Lab runner, contract, API key or PDF service is needed.

This is a bounded save-completion example using unchanged [`yoshiki2024/PDF_Studio@87160462`](https://github.com/yoshiki2024/PDF_Studio/tree/87160462e342c039235531be49883113b1265e49). Its original frontend loads the PDF and rotates both pages by 90 degrees. Only the browser's output interfaces are controlled; the application writer and UI run normally.

## Author run and upstream fix

On 2026-10-20, [PDF_Studio’s author publicly reported](https://qiita.com/yoyoyo2024/items/f4f08276c835cab80b53#comment-23d925ca8772b4a0cb9a) running the supplied `pdf-save.spec.mjs` locally after fixing cancellation: **normal save, denied write and SAVE_COMPLETION/retry all PASS**. The report identifies the test and outcomes; OS, runtime versions and a raw execution log are unspecified.

We separately reran the unchanged test on upstream fix [`12849c4c`](https://github.com/yoshiki2024/PDF_Studio/commit/12849c4c8960ab74e1dc78dbf93589d98dfa9280): **3 PASS / 0 FAIL / 0 skipped**, in 6.524s (Node 22.16.0, Chromium, Playwright 1.64.0). The same synthetic two-page PDF, complete text/order/rotation comparisons, fallback and cancellation/retry assertions were retained. All 18 upstream Git blobs were verified before and after; this direct child of the affected pin changes only `js/app.js`. Test SHA-256: `4746912fcdc4b3f44778e27be436aa5f4397e346d3ecce9f23df4c0584b84613`.

The hosted example and original measurement below keep the affected `87160462` pin so the false success remains reproducible. The author’s execution report and our fixed-source rerun are separate evidence. Save APIs remain simulated; neither result establishes real OS dialogs or physical disk writes.

## Measured behavior

Operator measurement on 2026-10-20 JST, Node 24.19.0, Chromium and Playwright 1.64.0:

| Check | Affected pin |
| --- | --- |
| Normal write: no success before `close()` completes; whole rotated output is correct | PASS |
| `write()` rejects with `NotAllowedError`; the real browser fallback downloads the whole output | PASS |
| Picker rejects with `AbortError`; no file is written, but the app displays “保存されました” | FAIL at `SAVE_COMPLETION` |

The cancellation test verifies **one picker call, an actual `AbortError`, zero write calls and zero downloads**. It records toast mutations through the next message-channel task after the rejection's microtasks have drained. No fixed sleep or immediate negative visibility assertion determines the result. The original document and both 90-degree settings remain available; the same test successfully retries and checks the entire resulting PDF before asserting the false success.

For every normal, fallback and retry output, PDF.js independently reads the PDF-lib writer's output. Both page positions, all ten original text fields, page boxes and both rotations must match the synthetic gold. An additional operator check with pypdf validated all six outputs across the affected and hypothetical fixed copies; the rotated pages were also rendered and visually reviewed.

The affected app produces **2 pass / 1 fail / 0 skipped** and exit 1. A setup error or timeout is not the regression. A separate hypothetical local copy that returns a cancellation outcome and suppresses the caller's success toast passes all three checks. That copy was a sensitivity control at the original measurement; the later upstream fix and author execution are recorded above. All 18 original source blobs remained unchanged.

## Run in an existing Playwright suite

1. Download or check out the pinned app into a disposable directory. It has bundled browser libraries and needs no app dependency installation. Serve its existing files:

   ```sh
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

2. Copy `pdf-save.spec.mjs` into the test directory of your existing Playwright suite. Run against that local server, using your suite's configured test pattern:

   ```sh
   PDF_STUDIO_BASE_URL=http://127.0.0.1:8000 \
     npx playwright test pdf-save.spec.mjs --workers=1 --reporter=list
   ```

   If the app has no Playwright dependency, keep its source unchanged and run the spec from a separate App Crash Lab checkout instead:

   ```sh
   git clone https://github.com/aichance/business-ai-recipes.git app-crash-lab-examples
   cd app-crash-lab-examples/tools/app-crash-lab
   npm ci --ignore-scripts
   # Only if Chromium is not already installed for this Playwright version:
   npx playwright install chromium
   PDF_STUDIO_BASE_URL=http://127.0.0.1:8000 \
     npx playwright test examples/pdf-save-native/pdf-save.spec.mjs --workers=1 --reporter=list
   ```

3. Keep the test's diagnostics, PDFs, parsed page data and cancellation screenshot in your Playwright reporter. It records the actual API sequence, toast text, output state, browser errors and downloads. The spec blocks browser requests outside the explicit local app origin. A JSON reporter may embed attachment bodies as base64.

## Browser-only example and limits

The browser example retrieves eight original source files from the fixed public GitHub commit and verifies their byte lengths and Git blob hashes before running them. Each case uses a new opaque sandbox iframe, the embedded synthetic PDF and simulated save APIs. Real file input and real downloads are disabled. The fallback Blob is parsed directly; the native Playwright case additionally verifies an actual browser download.

Source mismatch, missing source or a failed application checkpoint yields **INCONCLUSIVE**, never PASS. The app cannot read this site's parent DOM or storage. No uploaded documents, authentication, telemetry or result upload are involved. The source request to GitHub is a network request; this is not an offline test until the original files have loaded.

The hosted sandbox disables workers and outbound requests, using the original bundled PDF.js main-thread handler. Attempts to load optional PDF font resources are blocked by its policy; system-font rendering is used. This is separate from the native browser test and is not a check of arbitrary document font fidelity.

These checks cover this rotation flow and the measured cancellation checkpoint. They do not verify real OS dialogs, actual disk writes, all PDF formats, merge/split/edit/export flows, redaction, or all future asynchronous behavior. Only synthetic inputs are used. An operator's reproduction is separate from an author's independent execution.

The test and fixture are original App Crash Lab material under the repository's [MIT license](../../../../LICENSE). No upstream application source is vendored or redistributed here. The original application's README declares MIT; its original attribution remains in the source fetched from GitHub.
