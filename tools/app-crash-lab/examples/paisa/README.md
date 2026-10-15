# Paisa: real backup, native confirmation, fresh restore

This contract checks the personal [Paisa app](https://github.com/supratim58/Paisa)
at unchanged commit
[`e5151a6c`](https://github.com/supratim58/Paisa/tree/e5151a6c7144a836b7d4ec2b2d3508d71b94ba40).
It creates two synthetic transactions and opening balances through the normal
UI, downloads Paisa's actual JSON, restores the same bytes in an empty context,
accepts its exact native replacement question once, and compares the complete
`paisa.v1` database plus displayed balances/history again after reload.

This is an operator compatibility check, not a report of author adoption or an
app defect. Upstream source and real financial records are not included here.

## Run it on a disposable local copy

Use Node22+, npm, Python3 and Git. In terminal1:

```sh
git clone https://github.com/supratim58/Paisa.git paisa-local
cd paisa-local
git checkout e5151a6c7144a836b7d4ec2b2d3508d71b94ba40
python3 -m http.server 54551 --bind 127.0.0.1
```

Leave that server running. In terminal2, inside App Crash Lab0.7.0's extracted
[source ZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.7.0/app-crash-lab-0.7.0.zip):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node cli.mjs run examples/paisa/roundtrip.json
```

Expected: `PASS backup-roundtrip`, exit0. Open the absolute report path printed
by the CLI. To rerun its exported test, with the same app server still running:

```sh
npx playwright test --config /absolute/path/to/report/playwright.config.mjs
```

The generated test needs Playwright, not App Crash Lab. If moving it to another
project, install `@playwright/test@1.64.0` locally as described in the
[backup setup prompt](https://aichance.github.io/business-ai-recipes/app-crash-lab.html#backup-agent).
Stop terminal1 with Ctrl-C when finished. No app files need changing.

## What is compared

- Opening bank1000.5 / cash100.25.
- UPI income42.75 on2026-10-14 and cash expense12.5 on2026-10-15.
- Entire saved database: both opening values, transaction IDs, amount, type,
  method, title, date and any other saved fields. IDs are generated normally;
  the comparison uses the baseline from that same run.
- Bank1043.25 / cash87.75 / total1131, displayed spending, both rendered records
  and their text, in addition to the saved database.
- Actual download mapped with `statePaths.db: []`, source unchanged after
  export, empty target, unchanged bytes delivered through the real Restore
  file chooser, new completion signal, complete restoration and another reload.

`restore.confirm` declares `Replace all current data with this backup?` with
`accept: true`. It permits one matching native confirm only while delivering
the downloaded file. A different, missing or repeated dialog cannot pass;
confirmation does not replace full-record or reload comparisons.

## Measurements and limits

Measured2026-10-15 on macOS arm64, Node22.16.0, Playwright1.64.0 Chromium.
The initial independent native-control run exported273bytes, restored all
selected values and retained them after reload. The old0.6.2 runner returned
INCONCLUSIVE/UNEXPECTED_NATIVE_DIALOG on the same unchanged app, because this
backup flow's native confirmation was unsupported. That was a tool limitation,
not a Paisa bug. With0.7.0, the CLI passed in6.6seconds and its generated
Playwright test passed in6.3seconds. The CLI exported273bytes and accepted the
exact restore question once; all four comparison phases matched. Sizes, hashes
and duration vary with generated IDs and environment. See [SOURCE.json](SOURCE.json)
for pins and measured outcomes.

The runner blocks service workers and uses fresh, disposable browser contexts.
Offline/PWA caching, real accounts or finances, invalid files, mobile browsers,
power failure, encryption, and data outside selected observations are not
covered. Dates affect the app's “Today” label; the baseline and restoration are
compared within the same run. The report retains export size/hash and comparison
metadata, not downloaded records or captured dialogs. Declared synthetic inputs
and confirmation text are still saved in the contract. Review artifacts before
sharing. These commands do not test the author's deployed service.
