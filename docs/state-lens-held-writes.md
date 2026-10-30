# Place observations after a held IndexedDB write commits

If a regression test deliberately keeps an IndexedDB write transaction open,
release that gate and await the existing commit/readiness assertion before
adding a State Lens checkpoint on the same store.

`lens.step` observes **before** calling its action. Wrapping the gate release
therefore waits for a read that cannot finish until that action releases the
writer. The common helper times out its own read and records `INCONCLUSIVE`;
the action can then run. A longer timeout extends this intervention.

## Reproduced with the published common file

On2026-10-30, an authored loopback fixture held a write on `drafts/notes` and
changed one synthetic record from revision1 to revision2. Four fresh Chromium
contexts used the unchanged common0.4.0-experimental.1 file, with screenshots
disabled to isolate the selected IndexedDB read.

| Placement | Delay before calling release | Browser gate held | Selected observations |
| --- | ---: | ---: | --- |
| Unobserved release | 0.08ms | 215.80ms | None |
| Release, await commit, then checkpoint | 0.04ms | 235.20ms | OBSERVED revision2 |
| `lens.step` around release, timeout100ms | 120.92ms | 147.30ms | INCONCLUSIVE, then OBSERVED revision2 |
| `lens.step` around release, default750ms | 793.48ms | 814.80ms | INCONCLUSIVE, then OBSERVED revision2 |

The application writer committed revision2 and was not aborted in all four
cases. The observer aborts its own timed-out read transaction. These are
single-run operator observations, not a general timing guarantee, a third-party
app result, a developer-time comparison or adoption evidence. Other probes,
screenshots and scheduling can add time.

The browser gate column also includes fixture-ready polling and protocol
transport before the measured callback starts. Its rows must not be subtracted
to estimate overhead; the unobserved browser hold was longer than the100ms case
in this run. The callback-delay column starts immediately before the Node-side
release sequence. The queued read and its timeout are the verified behavior.

Node22.23.4; Chromium156.0.8078.4; report schema3. Executed example SHA256:
`95e3e10f23481a4acfc451a8b4c27bdc26383da54aadf66b2925b476d244de11`.
Common file SHA256:
`9714c7c2bc11a591a4a90e3b20bb9e51d61fa65e325473da0e118644d760d604`.

## Keep the original gate unobserved

Illustrative order, using the test's own gate and readiness functions:

```js
await releaseApplicationGate();
await expect.poll(readPersistedFixture).toEqual(expectedFixture);
await lens.checkpoint('Writer committed');
```

Keep the original unobserved regression run as the baseline. Do not move its
assertions into an observer or remove a failing assertion to obtain a report.
Even an observation after commit is extra work and can affect later timing.

This is consistent with the [IndexedDB transaction scheduling Editor's
Draft](https://w3c.github.io/IndexedDB/#transaction-scheduling): a later read
waits for an unfinished earlier write with an overlapping store scope.
Ordinary IndexedDB reads have this scheduling constraint too; the helper is
not a way to inspect uncommitted data.

## Run the optional repository fixture

With the repository's existing Playwright development dependencies and Chromium
installed, run from the repository root:

```sh
node tools/playwright-state-lens/examples/held-write.mjs
```

[Executable example](../tools/playwright-state-lens/examples/held-write.mjs).
It creates fresh synthetic contexts, asserts the writer outcome and observation
statuses, and writes JSON into a new ignored `.state-lens-output/held-write-*`
directory. It performs no model call or upstream application execution. The
[one-file integration](state-lens-install.md) remains the normal starting point.
