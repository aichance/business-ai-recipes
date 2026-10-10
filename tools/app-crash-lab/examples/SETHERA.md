# Sethera: preserve a saved piece after a rejected JSON import

This example runs both App Crash Lab checks against **unmodified Sethera
v0.4.0**, commit `f2548ae96ecc2ae5c979e9c408ba036b48de3f90`.
[Sethera](https://github.com/cuculhart/sethera-piece) is an MIT-licensed visual
board. The fixture is one synthetic piece, not a user's document.

**Requires App Crash Lab 0.3.0 or later.** The 0.2.1 ZIP cannot read the
`rejectedUpdate.dialog` field. Use the current source checkout or 0.3.0 release.

## Start the pinned app

Use a disposable checkout with Node 22+:

```sh
git clone https://github.com/cuculhart/sethera-piece.git
cd sethera-piece
git checkout f2548ae96ecc2ae5c979e9c408ba036b48de3f90
npm ci --ignore-scripts --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 54189 --strictPort
```

Leave that terminal running. Its route is
`http://127.0.0.1:54189/sethera-piece/`. If you choose another port, update
`baseURL` in a copy of `sethera.json`; keep the `/sethera-piece/` path.

## Run the checks

In a second terminal, from the App Crash Lab directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node cli.mjs run examples/sethera.json --out .crash-lab/sethera-first
npx playwright test --config .crash-lab/sethera-first/playwright.config.mjs
```

Use a new output directory when rerunning. Open
`.crash-lab/sethera-first/index.html` for the verdict, and `report.json` for
the captured alert and full selected before/after state. Stop the development
server with Ctrl+C when finished.

## What was verified

On 2026-10-10, Chromium with Playwright 1.64.0 and App Crash Lab 0.3.0:

| Check | Operation | Result |
| --- | --- | --- |
| Reload | Import one synthetic piece, confirm saved state, reload | PASS |
| Rejected update | Fresh import, upload malformed JSON, capture exact native alert, compare saved state | PASS |

The rejection message was `Sethera の JSON ファイルとして読み込めませんでした`.
The runner dismissed the alert normally. It compared stored nodes, piece
data, edges and paper settings, plus the rendered label, value and piece count.
The two generated standalone Playwright tests also passed.

Our local verification does not cover every Sethera feature or prove
browser/process-crash recovery. Native alert handling is a
runner feature; Sethera source and expected values were not changed to pass.
Export/download, calculations, IndexedDB and concurrent edits are outside this
fixture. The separate checks each begin in a new browser context.

If you adapt this to your app, observe the saved/domain record rather than
the editable draft. Declare the real rejection message and use synthetic data.

## Independent author report

On 2026-10-10 at 21:04 JST, [Sethera's author reported](https://qiita.com/cuculhart/items/4425ab63e6b1dd497ae1#comment-4dfcb4ac9ecead546607)
running the two App Crash Lab checks on Windows with Node v22.16.0 and
Playwright 1.64.0: reload PASS, rejected-update PASS, and both generated
standalone Playwright tests PASS. They also reported matching the ZIP's
published SHA-256.

The same comment reports reusing the contract on Sethera **v0.5.0
(`5c81c5d`)**, with both checks passing. The author plans to use it before
future releases; that intention is not evidence of future runs.

This is one independent user's public report, not test logs replayed by us
or a general Windows compatibility guarantee. Our pinned v0.4.0 instructions
and local verification above remain separate from the author's v0.5.0 run.
