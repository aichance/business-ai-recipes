# App Crash Lab

**Your app says “Saved.” Does the data survive the next mistake?**

Describe one working save flow and the values worth keeping. App Crash Lab
checks **reload** and **rejected updates**, then gives you the changed values,
a browser trace and ordinary Playwright tests you can rerun after a fix.

Local Node CLI. No account, LLM call or API key during a test run. MIT licensed.
Built for disposable local web apps, including apps made with coding agents.

```text
Synthetic Notes         Save → reload       Reject empty note
Deliberate reload bug   FAIL: "Buy coffee"→"" PASS
Deliberate update bug   PASS                FAIL: "Buy coffee"→""
Fixed version          PASS                PASS
```

These are deliberately seeded defects in the included demo, not claims of
new bugs discovered in someone else's software. The same contract runs on
the broken and fixed versions.

## Try it

You need **Node 22+** and npm. From this directory in the source checkout or source ZIP:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run demo
```

Open the printed `index.html`. The demo starts its own disposable server,
runs both checks against three versions, writes the actual reports, and
stops the server. The first browser download needs internet and disk space;
Linux may also need `npx playwright install --with-deps chromium`.

## Check your app

1. Start a **disposable local development instance** of your app.
2. Copy [`examples/notes.json`](examples/notes.json) to `my-app.json`.
3. Set both `baseURL` (the local origin) and `path` (your app's route). The copied `/?mode=fixed` path belongs only to the demo. Set save steps (`save: true` on the save trigger), saved values and invalid input/rejection signal.
4. Run:

```sh
node cli.mjs run my-app.json --out .crash-lab/my-first-run
```

Each run needs a new output directory. Nothing is uploaded. Test actions
write to your app: use synthetic records, not an app containing real work.
The browser starts with a fresh context for each check; server-side records
need an explicit reset or a setup flow that replaces the complete fixture.

The two essential questions in your contract are:

```json
{
  "observe": {
    "savedNote": { "source": "text", "target": { "testId": "saved" } }
  },
  "expected": { "savedNote": "Buy coffee" }
}
```

This is a fragment, not a complete contract. `observe` selects what must
survive; `expected` proves the normal save reached a known-good result.
For rejected updates, separately describe how rejection is acknowledged.
An error message can change while the saved note must stay unchanged.

Use [`CONTRACT.md`](CONTRACT.md) for the complete format and supported actions.
[`examples/inventory.json`](examples/inventory.json) combines UI actions,
HTTP 422 and server JSON. [`examples/glypha.json`](examples/glypha.json) is a
real-app adapter for [Glypha](https://github.com/kuny/glypha), with setup
instructions in [`examples/GLYPHA.md`](examples/GLYPHA.md).

### Ask your coding agent to configure it

```text
Use App Crash Lab against my disposable local app. Read CONTRACT.md and the
notes.json example. Inspect my app's real save flow, selectors and validation.
Write my-app.json with a known-good saved value and an invalid update that
the app should reject. Observe saved/domain data, not the editable draft or
error message. Add server reset steps if browser isolation is insufficient.
Do not change application code or loosen expected values to make tests pass.
Run both checks and show me the report, differences and reproduction spec.
If a required observation or rejection signal is unavailable, explain it.
```

Using an agent to author the config is optional and uses your existing
agent account. The runner itself does not call a model.

## Keep the evidence; rerun the test

Every run writes:

- `index.html` and `report.json`: verdicts, phases, baseline, final state and diffs.
- `contract.json`: exact normalized input plus a SHA-256 in the report.
- `reload.trace.zip` / `rejected-update.trace.zip` and final screenshots.
- `repro.spec.mjs` and `playwright.config.mjs`: self-contained tests depending
  only on `@playwright/test`, not this CLI or an AI service.

With the target app still running, from this package directory:

```sh
npx playwright test --config .crash-lab/my-first-run/playwright.config.mjs
npx playwright show-trace .crash-lab/my-first-run/reload.trace.zip
```

The generated spec embeds the exact contract. If your app moves to a new
port, update its `baseURL`; record that change when comparing results. To
use the spec in another project, install `@playwright/test@1.64.0` and its
Chromium browser there. Run with one worker so server resets do not race.

### Rerun a generated test from the demo

`npm run demo` stops its temporary server when finished. To try the complete
run-and-rerun workflow with the fixed Notes fixture, keep this running in one terminal:

```sh
npm run demo:serve
```

In another terminal, from this package directory:

```sh
node cli.mjs run examples/notes.json --out .crash-lab/fixed-repro
npx playwright test --config .crash-lab/fixed-repro/playwright.config.mjs
```

Both checks should pass. Use a new output directory for another run.
The server defaults to `http://127.0.0.1:4173`; stop it with Ctrl+C afterward.
To rerun a spec from the earlier three-version demo instead, change `baseURL`
in that output's `repro.spec.mjs` to this server's address, keeping its `path`
and expected values unchanged. Its original temporary port is no longer live.

`PASS` means the selected values matched after the configured check.
`FAIL` means the selected state changed or the expected rejection did not
occur. `INCONCLUSIVE` means setup, selectors, observations or infrastructure
prevented a trustworthy verdict. CLI exit codes are `0`, `1`, `2` respectively
(any inconclusive result takes priority over failure). The demo has its own
exit status: intentionally failing fixture checks are expected demo success.

## What this doesn't infer

You supply the app's intended behavior. A URL alone cannot specify it.
This is a small, versioned `state-preservation@1` check pack, not autonomous
exploration or a proof of app quality. It waits for the expected final state, then samples it for a short stability
window (default 250 ms), not every transient write, power loss or concurrent user.
Values not selected in `observe` are outside the test.

Only the configured loopback HTTP(S) origin is allowed. No browser profile
reuse, cross-origin services or service workers in this first version.
Apps requiring those features need a different test setup. Raw contracts,
screenshots and traces may contain app data; inspect them before sharing.

Playwright can implement these checks directly. This package supplies the
two patterns, a reusable contract and consistent debugging output. It does
not claim a new testing technique or better bug detection than every other tool.

## Contribute a real use case

If you tried it on **your own app**, an issue with the app/framework, which
checks ran, setup friction and a sanitized result helps improve the next
version. A failing selector is useful feedback too. Do not include secrets
or production records. Stars are optional; access and support do not depend
on them.

Development: `npm test` runs actual browser checks, fault controls, HTTP-state
checks and reruns the generated specs. See `tests/`. Maintained by aichance
with AI assistance; report facts and limitations are reviewed against runs.
