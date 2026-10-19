# Optional watch history must not prevent the first video load

A native Playwright **component reproduction** for [VideoHost issue #94](https://github.com/xpadev-net/video-host/issues/94).
At the measured revision, the new-video effect writes `WatchedHistory` before
initializing HLS. Rejecting only that optional write throws out of the effect;
the local video never reaches its manifest request.

**Normal playback and an unrelated-key rejection control pass. The history-only
regression fails at `OUTCOME`.** This is a component-level result, not a run of
the complete VideoHost application, its production error boundary or its backend.

[Download the standalone ZIP](https://aichance.github.io/business-ai-recipes/app-crash-lab-video-host-history-native-v0.1.0.zip)
· [SHA-256](https://aichance.github.io/business-ai-recipes/app-crash-lab-video-host-history-native-v0.1.0.zip.sha256)
· [Measured results](video-host-history-results.json)
· [Test](video-host-history.spec.mjs)

## Run it

Download and extract the standalone ZIP. It creates a `video-host-history-native/`
folder containing `package.json`, `browser/`, and `upstream/`.
The repository's `docs/` links provide the readable guide, test, and results;
the ZIP contains the complete runnable fixture.
Node **22.12+** and npm are required. No Docker, database, provider key or
VideoHost account is needed.

From the directory containing that extracted folder, run:

```sh
cd video-host-history-native
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run controls
npm test
```

The two controls pass. On the bundled pinned source, `npm test` exits nonzero:
**two pass, one fails**. That failure is intentional evidence of the measured
regression, not an expected-failure annotation. No `test.fail`, retry or skip
turns the failure green. Reports and exact witnesses are written to `results/`.
Port `127.0.0.1:54230` must be free; an existing server is never reused.

The fixture starts and stops its own Vite server. Playwright uses fresh Chromium
contexts with service workers disabled and blocks requests outside that exact
loopback origin. The bundled 12-second blue HLS card was generated locally with
FFmpeg; no external video, real history, profile or account is used.

## What is real, and what is fixture code?

Inside the standalone ZIP, `upstream/` contains **eight byte-identical source/license files** from
[`14630a0a`](https://github.com/xpadev-net/video-host/tree/14630a0abaa8da3badf4525111488d6cb2fd7004),
including the actual `Video.tsx`, `Player.ts` and `WatchedHistory.ts`. `SOURCE.json`
records each Git blob, SHA-256 and source URL; `verify-sources.mjs` checks them
before tests. The original MIT license is retained in `upstream/LICENSE`.

The component uses real React 19.3.0, Jotai 2.20.3, Hls 1.7.3 and TanStack Router
1.170.44, matching the upstream lock. Vite 8.3.4 and React plugin 6.1.2 also match
the frontend. Playwright is pinned to 1.64.0.

`browser/main.tsx` is our fixture UI: it mounts the real component inside a real
Router and Jotai Provider, adds mount/play/seek buttons, and catches effect errors
for observation. Its error text is **not VideoHost's production error UI**.
An actual history-atom observer hydrates an old synthetic record before mounting
Video; that is an explicit fixture precondition. Video itself only uses the
history setter. We do not claim to have verified full-app hydration/subscription.

| Case | Measured result | Independent evidence |
| --- | --- | --- |
| Normal | PASS | Real HLS manifest/segments loaded; duration approximately 12 seconds; playback advances; old record preserved; selected movie and seek position durably saved |
| Unrelated key rejected | PASS | Interceptor calibrated on a different key, then actual history and playback succeed |
| Only `WatchedHistory` rejected before mount | OUTCOME FAIL | Actual component-origin `setItem` attempt throws marked `QuotaExceededError`; caught after denial; HLS never initialized; no manifest or segment requested; old durable bytes unchanged |

The normal control plays briefly and then **seeks** to 10.2 seconds. Its saved
fraction around 0.85 is a saved seek position, not ten seconds of continuous viewing.
The in-memory atom changes even when storage throws; it is never used as proof
of successful persistence. Durable storage is read independently.

## Keep the regression in your release checks

This is a self-contained component fixture, not a single file that automatically
tests any deployed app. For VideoHost, keep the fixture or point its imports and
Vite `@` alias at your local frontend source, preserving the real Router/Jotai/Hls
instances. Deliberately review the source hash gate when switching revisions;
do not silently disable it. Keep both passing controls and the exact-key fault.

For a different app, replace the component, its normal actions and exact history
key together. Require real main-work progress, an actually rejected write and
independent durable readback. Missing media, selectors or hydration are setup
failures; a timeout or error-boundary message alone is not this regression.

On a separate hypothetical corrected copy, catching ancillary history write
errors allowed all three tests to pass. That calibrates the oracle; **no upstream
fix, PR, author adoption or third-party use is claimed**. The correction is not
bundled as a replacement for the original source.

This tests the initial new-content-URL effect under synthetic write rejection.
It does not measure real quota capacity/frequency, later progress-write failures,
real video providers, authentication, backend behavior or whole-app typechecking.
