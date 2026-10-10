# Augur: saved feedback survives reload

This is a one-check adapter for the unchanged [Augur](https://github.com/kaezee/Augur)
demo at commit `fc7e863d478c6877e47a74d105812556cc7253da`.
It sends one synthetic feedback note through the real UI, then compares the
persisted body, category and answered outcome before and after reload.

**Observed result on 2026-10-10:** reload PASS with App Crash Lab 0.3.0.
This is a maintainer compatibility run, not evidence that Augur's author uses
App Crash Lab. It does not validate a production database or a host integration.

## Start an unchanged local copy

Node 22+ and npm are required. In a new disposable working directory:

```sh
git clone https://github.com/kaezee/Augur.git augur-crash-trial
cd augur-crash-trial
git checkout fc7e863d478c6877e47a74d105812556cc7253da
npm ci --ignore-scripts --no-audit --no-fund
npm run demo -- --host 127.0.0.1 --port 5178 --strictPort
```

Keep that terminal running. The source is MIT-licensed; no Augur code needs
to be edited. The exact port matters because browser storage belongs to an origin.

## Run the saved-state check

In another terminal and a separate empty directory, save
[`augur.json`](augur.json) as `augur.json` (GitHub **Raw → Save As**), then run:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run augur.json
```

Open the printed absolute `index.html` path. The browser starts with a new
context, so the first stored note is our synthetic record. Expected values:

| Saved observation | Before reload | After reload |
| --- | --- | --- |
| Note body | `Crash Lab synthetic feedback 2212` | Same |
| Category | `broke` | Same |
| Outcome | `answered` | Same |

The contract observes `localStorage["augur.local"]`, not the live event feed.
In a separate manual UI check, the demo's **What Augur saved** feed returned
to **Nothing yet** after reload, while **Admin** still displayed the note.
That empty feed was not data loss. Renaming it to indicate the current visit
could make the demo's persistence easier to understand.

Only `reload` is selected. Empty feedback disables Send; it does not expose
the explicit rejection acknowledgment required by the rejected-update check.
No rejection result is claimed, and no application fault is injected.

## Rerun the exported Playwright test

Leave Augur running. Change into the printed report directory, then:

```sh
npm install --no-save --package-lock=false --ignore-scripts @playwright/test@1.64.0
npx playwright test --config playwright.config.mjs
```

The generated spec needs only Playwright. Stop the demo server with Ctrl+C
when finished. Reports and browser storage in this trial contain synthetic data.
