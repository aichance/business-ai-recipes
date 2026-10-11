# Multi-Counter: names, counts and history survive reload

This reload-only contract targets [mjeld’s Multi-Counter](https://mjeld.com/multi-counter/),
introduced in the [author’s Qiita article](https://qiita.com/mjeld/items/f77621c7c7c04fb5a899).
It adds two synthetic counters through the UI, sets A to 2 and B to 1, opens
the change history, reloads, then checks the stored state and rendered values.

## Run against your local development copy

This repository supplies **our test configuration only**. It does not bundle
or license the app. App authors can use their own disposable development copy.
Do not point the test at a real shared counter or reuse a browser profile.

Start your local app on `http://127.0.0.1:54192`, with the counter page at `/`.
For a static development copy, serve its root with:

```sh
python3 -m http.server 54192 --bind 127.0.0.1
```

In a second terminal, from this repository’s `tools/app-crash-lab`, with Node 22+:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node cli.mjs run examples/multi-counter.json --out .crash-lab/multi-first
npx playwright test --config .crash-lab/multi-first/playwright.config.mjs
```

Use a new output directory for each run. Keep it under this tool directory so
the generated test resolves `@playwright/test`. Open the output’s `index.html`
or `report.json`. If your local app uses another port, append
`--base-url http://127.0.0.1:YOUR_PORT` to the `node` command.

## What the test observes

- Exactly two counters: `ACL synthetic A = 2`, `ACL synthetic B = 1`, total `3`.
- Exactly three visible history entries, with unchanged text after reopening
  the history dialog. Naming a counter is not counted as a numeric history event.
- The complete `multi-counter-local-v1` stored object, including the counters,
  history, daily totals, groups and settings. IDs and timestamps must remain
  equal within each run; they are not fixed across independent runs.

Expected nonempty values are checked before the comparison. An empty store
cannot pass merely by staying empty. Both the localStorage object and displayed
fields are compared, so checking stored values alone cannot hide a lost label.

On 2026-10-11 our local compatibility run passed, and the exported standalone
Playwright test also passed, using Node 22.16.0 / Playwright 1.64.0 / Chromium.
The source was retrieved from the public app that day and left unchanged;
its HTML referenced `assets/js/app.js?v=1784194049`. The tested JS SHA-256 was
`ba924cdf0c36d01f9e1f7e160ac97694c790e6d8fac749e0f2ceda360db807ca`.
There is no pinned upstream release; a changed UI or storage format may require
a contract update. This is our run, not the author’s use or endorsement.

## Limits

Only ordinary local mode is covered, with no shared URL or sharing action.
No rejected-update check is configured: this flow supplies no invalid-import
operation with an explicit rejection signal. CSV, shared synchronization,
passcodes, daily reset, ordering, browser restart, quota and concurrent tabs
are outside coverage. Groups and several settings remain at their defaults.

The public page includes advertising and analytics scripts. App Crash Lab
blocks requests outside the configured loopback origin in this local test;
this result does **not** show that the public website makes no external requests.
No third-party app source, private data or shared-state identifiers are included.
