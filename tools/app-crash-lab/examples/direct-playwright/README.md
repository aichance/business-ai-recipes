# App Crash Lab or ordinary Playwright?

**Already maintain a Playwright suite? You can write these two checks directly.**
App Crash Lab is useful when you want a saved contract to produce the same
check pack and evidence bundle on each run. It does not make Playwright
capable of detecting a new class of bug.

| Starting point | Route |
| --- | --- |
| Existing Playwright fixtures, helpers and CI | Add reload and rejected-update assertions to that suite. The example below shows the shape. |
| One save flow; want the two patterns, phase/status, saved-state differences and a portable reproduction together | Describe a contract and run App Crash Lab. |
| App needs service workers or cross-origin login | Use your existing test setup; those are outside this runner's current scope. |

Playwright itself supports HTML reports, traces, screenshots and assertion
diffs. App Crash Lab supplies defaults, the two state-preservation patterns,
a JSON contract and generated tests; those artifacts are not exclusive to it.

## A runnable comparison on Glypha

We ran both paths on macOS with Node 22.16.0, Playwright 1.64.0 and the same
unmodified Glypha build, source commit
`05183171e567ad285d718f08b6ff64620fb9c0c2`. Each path started with a different
empty database. All content is synthetic.

| Selected check | App Crash Lab | Direct Playwright |
| --- | --- | --- |
| Valid scene, then browser reload | PASS | PASS |
| Invalid scene returns HTTP 422; saved scene remains | PASS | PASS |

Both paths verify the known-good caption, full `/display` JSON and ETag.
They confirm the canvas is visible after setup/reload and sample the saved
values for 250 ms after a matching final state. They use fresh browser
contexts, block service workers and confine browser traffic to the local
origin. This checks saved HTTP data and canvas presence, not pixels.

This is a **normal-case compatibility comparison**, not a bug-detection,
speed or onboarding benchmark. No new Glypha bug was found. The author has
not been confirmed to use either example. A passing run does not cover
unobserved values, delayed writes beyond the observation window or crashes.

### Run the direct tests

These comparison files are in the current repository checkout; the original
v0.1.0 source ZIP predates them. Install the runner's existing npm dependencies
and Chromium as described in [the package README](../../README.md).

Build Glypha using [the pinned setup instructions](../GLYPHA.md). From its
repository root, start a **new empty database** on this comparison's port:

```sh
glypha_comparison_dir=$(mktemp -d)
GLYPHA_ADDR=127.0.0.1:4397 GLYPHA_DB_PATH="$glypha_comparison_dir/glypha.db" ./glypha-trial
```

Confirm this is your new process and `/display` initially returns 204.
The tests replace the complete content package. From App Crash Lab's package
directory, in another terminal:

```sh
npx playwright test --config examples/direct-playwright/playwright.config.mjs
```

Both tests should pass. The HTML report, JSON report, screenshots and traces
are under `.crash-lab/direct-playwright/` in the package directory. This suite imports only
Playwright and Node built-ins; it does not call the App Crash Lab runtime.

Stop Glypha with Ctrl+C, then start it again using a **different new empty
database** on the same port. Compare the contract route:

```sh
node cli.mjs run examples/glypha.json --base-url http://127.0.0.1:4397 --out .crash-lab/glypha-comparison
```

Use a new output directory on a later run. Stop the owned trial server when
finished. These commands write synthetic data to that local server.

## What differs

- The direct suite keeps control flow and assertions in JavaScript. Its
  failed assertions are ordinary Playwright failures. It does not separately
  classify setup or infrastructure failures as `INCONCLUSIVE`.
- App Crash Lab validates a declarative contract, records check phases and
  selected-state differences, and emits a standalone Playwright spec. You
  still need to define selectors, intended data and a rejection signal.
- The direct example uses Playwright's multipart helper and a separate
  [fixture file](fixtures.json). The current Glypha contract embeds the raw
  multipart body. That representation is less convenient to edit; this
  comparison does not establish that writing the contract is faster.
- The direct example reads JSON and ETag from one response. The contract
  observes JSON, ETag and caption with separate requests. No concurrent
  writer was present in this trial; the reads are not atomic snapshots.
- Timeout handling, retry/poll schedules, screenshots and error categories
  are not identical. Two normal passes do not prove equivalent behavior for
  every failure mode. The bundled Notes fault controls are separate tests.

Choose based on the workflow you want to maintain. If you use the contract
route, keep the generated test after fixing a failure and rerun it with the
same intended values. If you already have the surrounding Playwright setup,
the direct assertions may be the smaller addition.
