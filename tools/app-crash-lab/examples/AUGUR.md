# Augur: saved feedback survives reload

This is a one-check adapter for the [Augur](https://github.com/kaezee/Augur)
local demo. No Augur source changes are needed.
It sends one synthetic feedback note through the real UI, then compares the
persisted body, category and answered outcome before and after reload.

**Verified on 2026-10-18:** App Crash Lab 0.11.0, Augur commit
`760819e3fa1a067d9aa108e2c217e802e79532e4`: reload PASS; the exported
Playwright test also passed (1/1). The existing JSON contract is unchanged.
This is an operator compatibility run, not evidence that Augur's author uses
App Crash Lab. It does not validate a production database or a host integration.

## Try your local copy

Node 22+ and npm are required. In a disposable Augur checkout, install dependencies
if needed, then leave the demo running in the first terminal:

```sh
npm ci --ignore-scripts --no-audit --no-fund # skip if dependencies are installed
npm run demo -- --host 127.0.0.1 --port 5178 --strictPort
```

The exact port matters because browser storage belongs to an origin. This check
uses a fresh browser context with synthetic data, not your usual browser profile.
No signup, API key or backend is required.

In a second terminal, use a separate new directory:

```sh
mkdir augur-state-trial
cd augur-state-trial
curl --fail --location https://raw.githubusercontent.com/aichance/business-ai-recipes/main/tools/app-crash-lab/examples/augur.json --output augur.json
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.11.0/app-crash-lab-0.11.0.tgz app-crash-lab run augur.json
```

The [JSON contract](augur.json) can also be saved from GitHub's Raw view.
The `npx` release command above was executed against the measured Augur version;
it printed `PASS reload`. If your own revision differs, report the Augur commit
and PASS/FAIL, or the first setup step that stopped you. A setup error is not a
data-loss result.

Open the printed absolute `index.html` path. The browser starts with a new
context, so the first stored note is our synthetic record. Expected values:

| Saved observation | Before reload | After reload |
| --- | --- | --- |
| Note body | `Crash Lab synthetic feedback 2212` | Same |
| Category | `broke` | Same |
| Outcome | `answered` | Same |

The contract observes `localStorage["augur.local"]`, not the live event feed.
The current demo labels that feed **Saved this visit** and directs earlier
records to **Admin**. An empty current-visit feed does not establish data loss.
The earlier 2026-10-10 run used Augur `fc7e863` and CLI 0.3.0, and also passed.

Only `reload` is selected. Empty feedback disables Send; it does not expose
the explicit rejection acknowledgment required by the rejected-update check.
No rejection result is claimed, and no application fault is injected.

## Reproduce the measured Augur revision

Use a separate new checkout; do not change your normal working tree:

```sh
git clone https://github.com/kaezee/Augur.git augur-crash-trial
cd augur-crash-trial
git checkout 760819e3fa1a067d9aa108e2c217e802e79532e4
npm ci --ignore-scripts --no-audit --no-fund
npm run demo -- --host 127.0.0.1 --port 5178 --strictPort
```

The source is MIT-licensed. The operator run used 22 selected runtime files
matching that revision and reused installed dependencies with an unchanged
package lock. A full checkout, fresh `npm ci` and Augur's full upstream test
suite were not executed in that run.

## Optional: rerun the exported Playwright test

Leave Augur running. Change into the printed report directory, then:

```sh
npm install --prefix . --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

The generated spec needs only Playwright. Stop the demo server with Ctrl+C
when finished. Reports and browser storage in this trial contain synthetic data.
