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

You need **Node 22+** and npm. In an empty folder, run these two commands.
The second downloads the pinned 0.3.0 package from this project's GitHub release;
you do not need to clone or extract the repository:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab demo
```

Open the **absolute `index.html` path printed by the command**. Reports are
written under `.crash-lab/` in your current folder, not inside npm's cache.
The first run downloads dependencies and Chromium. On Linux, browser system
libraries may also be required; replace the first command with
`npx --yes --package=@playwright/test@1.64.0 playwright install --with-deps chromium`.
Installing system libraries may require administrator access on your machine.

Prefer a source checkout? From this directory in the checkout or
[0.3.0 source ZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/app-crash-lab-0.3.0.zip):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run demo
```

Both routes start a disposable demo server, run both checks against three
versions, write the actual reports, and stop the server. These are synthetic
fixtures; running the demo does not test your own app.

## Check your app

1. Start a **disposable local development instance** of your app.
2. Save [`examples/notes.json`](examples/notes.json) as `my-app.json` in your working folder (use **Raw → Save As** on GitHub, or copy it from the source ZIP).
3. Set both `baseURL` (the local origin) and `path` (your app's route). The copied `/?mode=fixed` path belongs only to the demo. Set save steps (`save: true` on the save trigger), saved values and invalid input/rejection signal.
4. Run:

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run my-app.json
```

From a source checkout, `node cli.mjs run my-app.json` also works. Each run
prints its report path and creates a new output directory by default. If
you set `--out`, choose a new directory for each run. Nothing is uploaded. Test actions
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
If an error message appears only after invalid input, use the
[conditional-message example](CONTRACT.md#error-elements-that-appear-only-after-invalid-input).
[`examples/inventory.json`](examples/inventory.json) combines UI actions,
HTTP 422 and server JSON. [`examples/glypha.json`](examples/glypha.json) is a
real-app adapter for [Glypha](https://github.com/kuny/glypha), with setup
instructions in [`examples/GLYPHA.md`](examples/GLYPHA.md).
For a browser-only JSON importer, [`examples/tunoron.json`](examples/tunoron.json)
uploads a synthetic song and observes its saved record through a dynamic
localStorage key. See [`examples/TUNORON.md`](examples/TUNORON.md) for the two
checks, local setup and verification limits. Requires runner 0.2 or later.
For native `alert()` rejection, the [Sethera example](examples/SETHERA.md)
checks a synthetic piece across reload and malformed JSON import. Requires
runner 0.3 or later. The [annotate.js example](examples/ANNOTATE.md) checks a
synthetic review comment and its malformed-import toast.

### Ask your coding agent to configure it

[Copy a self-contained setup prompt](https://aichance.github.io/business-ai-recipes/app-crash-lab.html#agent)
from the project page. It includes pinned format/example links and the current
no-clone commands. Paste it inside your disposable app project in your existing
coding agent. Review the generated contract and actual results.

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

### Already use Playwright?

You can add these checks directly to an existing suite. Choose App Crash Lab
when you want the same contract-driven checks, phase/status, saved-state
differences and generated reproduction together. Playwright also provides
reports, traces, screenshots and assertion diffs.

[Run the direct-Playwright comparison and choose your route](https://github.com/aichance/business-ai-recipes/tree/main/tools/app-crash-lab/examples/direct-playwright).
Both paths passed the same two normal-case Glypha checks. This does not prove
faster setup or better bug detection. The comparison is available in the
current checkout; the original v0.1.0 source ZIP predates these extra examples.

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

If you used the no-clone route, change into the **printed report directory**,
then install the test runner there before rerunning. Use the directory name
from your run, not the illustrative `.crash-lab/my-first-run` above:

```sh
npm install --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
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
