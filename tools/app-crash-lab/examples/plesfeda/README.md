# Plesfeda: keep the WBS structure and calendar through a real backup

This is an **operator compatibility check**, not a new Plesfeda bug report or
an author execution report. On the pinned, unmodified Plesfeda0.2.0 source,
App Crash Lab0.10.0 passed all three selected checks. Its generated ordinary
Playwright test also passed all three checks in a separate run.

| Check | Measured result |
| --- | --- |
| Save through Open → reload | PASS |
| Malformed JSON → exact `Invalid file` alert → selected state unchanged | PASS |
| Real Save download → fresh context → real Open → reload | PASS |

The fixture contains a parent and three children: two tasks with fractional
effort, a finish-to-start dependency chain and a zero-effort milestone. The
comparison keeps every saved task field, including IDs, parents, order, names,
effort, the open flag and the dependency arrays. It also compares all six
saved Gantt fields: baseline date, start hour, hours per day, Saturday/Sunday
exclusions and the complete holiday array. The count of four rendered task-name elements and the specific synthetic
root are checked separately from storage.

The fresh target starts with Plesfeda's own demo tree. The contract clears
that disposable tree through **Clear → Clear all**, opens **Gantt**, sets a
fixed, different baseline date through its normal UI, and closes the report.
It verifies the complete empty task array, declared initial calendar and
absence of the synthetic root before uploading the actual downloaded bytes.
It does not repair app data or create the source tasks during preparation.
The selected root must appear only after the import, and saved values must
match again after reload.

## Reproduce with your own disposable checkout

Use Node22+ and npm. In a new local work folder:

```sh
git clone https://github.com/cuculhart/plesfeda.git
cd plesfeda
git checkout --detach ed409f6e349e4c683b5965c81fa4ab78311ddb8f
npm ci --ignore-scripts --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 54671 --strictPort
```

Keep that terminal running. In a second terminal, in any writable work folder:

```sh
curl --fail --location https://raw.githubusercontent.com/aichance/business-ai-recipes/main/tools/app-crash-lab/examples/plesfeda/preservation.json --output plesfeda-preservation.json
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run plesfeda-preservation.json
```

Linux may require `playwright install --with-deps chromium`; installing browser
system libraries can require administrator access. If your disposable app uses
another local port, add `--base-url http://127.0.0.1:YOUR_PORT` to the final
command. Start and inspect that local app first. The runner never reuses your
usual browser profile. Keep real projects out of the test instance.

Each run creates a new `.crash-lab/` output directory and prints the absolute
HTML report path. It also writes `repro.spec.mjs` and `playwright.config.mjs`.
With `@playwright/test@1.64.0` installed in that output folder, those generated
files can run independently of App Crash Lab. We separately executed that
standalone output on the same unmodified app: 3 passed, 0 failed, 0 skipped,
0 flaky.
The standalone and CLI share the exported protocol; they are not independent
testing algorithms.

Measured on 2026-10-16 with Node 22.16.0, macOS and Playwright 1.64.0 Chromium:
CLI 18.576401s; separate standalone 20.115560s wall time. The real JSON backup
was 973 bytes, captured once and uploaded unchanged. These times include this
local run's startup/runner work and are not a performance benchmark.
See [machine-readable source/environment](SOURCE.json),
[measured summary](results-summary.json) and [complete contract](preservation.json).
No upstream application source is redistributed here.

## Limits

This checks the fixed source and selected synthetic workflow. It does not
establish behavior of the deployed demo, later releases, every import shape,
concurrent tabs, or TSV/CSV/Mermaid exports. Language, layout, theme, colors
and effort-unit preferences are outside this document-backup contract. The
stored clock fields are compared, but hourly schedule calculations are not
exercised. It does not independently validate CPM arithmetic or every task
relationship. A passing result is separate from author adoption.

日本語: この固定版では、再読み込み・壊れたJSONの拒否・実バックアップの
復元がすべてPASSしました。WBSの全レコードとガント設定6項目を比較します。
作者による実行報告ではありません。別バージョンで再実行した結果は、版と
実行ログを添えて個別に確認してください。
