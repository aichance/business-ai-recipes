# Repwise: backup equality and usable History are different checks

## 2026-10-17: author-confirmed fix and regression follow-through

The [maintainer confirmed the original diagnosis and reported a fix in1.2.1](https://github.com/abdulrahmanm-in/repwise/issues/7#issuecomment-6230396169). We then [retested the unchanged source at `6ee82061d2437e1332367c700778f0d69288828a` and returned the measured results](https://github.com/abdulrahmanm-in/repwise/issues/7#issuecomment-6230929632):

- App Crash Lab **0.11.0** with the existing [history-reload.json](history-reload.json): **PASS, exit0**. Contract setup, expectations and observations are unchanged; only `--base-url` is overridden. The completed History title count is1 before/after reload, and all six selected stores' complete records match.
- The original **10,691-byte JSON from1.1.1** was imported unchanged through normal UI into a fresh1.2.1 guest context. All eight stores match after import and reload (47 exercises, one settings row, one record in each of six business stores). History's active tab and the completed100kg workout display were verified. This is an old-backup import check, not proof of a migration-free in-place database upgrade.
- All49 original files at the new pin remained unchanged. No app patch, direct storage seeding, Google/Drive login or hosted-deployment check was used. The backup diagnostic dismisses the desktop notice through its normal “Got it” button.

To replay from an unpacked [0.11.0 release](https://github.com/aichance/business-ai-recipes/releases/tag/app-crash-lab-v0.11.0) with its Playwright dependencies installed and your disposable1.2.1 app running:

```sh
node cli.mjs run examples/repwise/history-reload.json \
  --base-url http://127.0.0.1:3000 --out repwise-history
```

These are operator-run verification results. The maintainer's independent App Crash Lab execution remains unverified. The historical1.1.1 counterexample and its0.9.0 results below are preserved.

---

**A completed workout survives JSON export/import exactly, but is absent from History even before export.** This example keeps the passing backup result and the unmet display expectation separate.

We tested an unchanged local copy of [Repwise](https://github.com/abdulrahmanm-in/repwise) at commit `40321419374327338960cbcdd99c4529f4b930f6` on 2026-10-16 JST. This is an AI-assisted operator experiment, not an author execution report or a result for the current deployment. [SOURCE.json](SOURCE.json) identifies the pin and coverage. Only our contracts and instructions are distributed here.

## Measured results

| Check | Result | Meaning |
| --- | --- | --- |
| App Crash Lab 0.9.0 [roundtrip.json](roundtrip.json) | **backup-roundtrip PASS**, exit 0 | Six complete selected business stores match the actual JSON, fresh import and reload. |
| App Crash Lab 0.9.0 [history-reload.json](history-reload.json) | **INCONCLUSIVE at baseline**, exit 2 | One completed workout exists, but its title count in History is 0 instead of 1. No reload-preservation verdict is made. |
| Separate native UI diagnostic | **All eight stores match** | 47 built-in exercises, one settings record and one record in each of the six business stores survive the unchanged actual file and subsequent reload. This broader comparison is not the six-store generic contract. |

The ordinary guest UI creates one routine named `ACL 合成 Strength 🧱`, selects the built-in Barbell Bench Press, and plans one set of eight reps. It records a synthetic 12.5 kg set and 72.4 kg body weight, marks the set complete and presses Finish. The observed stored workout has `isCompleted: true` and `totalVolumeKg: 100`; History still says `No historical workouts logged yet.` The saved routine remains visible as a positive UI control. The separate diagnostic sees the same History state after restore and reload.

The baseline failure should remain visible. Do not change the expected History title count to 0 to make a green test. The backup PASS means selected values were preserved; it does not mean the app displays them correctly.

## Run against a disposable local copy

Use Node 22+ and npm. Start from a new folder, without a `.env`, account, Drive token or real workout data:

```sh
git clone https://github.com/abdulrahmanm-in/repwise.git repwise-acl-test
cd repwise-acl-test
git checkout --detach 40321419374327338960cbcdd99c4529f4b930f6
npm ci --ignore-scripts --no-audit --no-fund
NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1 --port 54640
```

Keep that server running. In a second terminal, save the two linked contracts in a separate empty folder, then run these commands **sequentially**:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.9.0/aichance-app-crash-lab-0.9.0.tgz app-crash-lab run roundtrip.json --out reports/backup
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.9.0/aichance-app-crash-lab-0.9.0.tgz app-crash-lab run history-reload.json --out reports/history
```

For a different loopback port, append `--base-url http://127.0.0.1:3000` to each run command. Open the printed HTML reports. The second command exits 2 on this pin because its known-good History expectation is unmet before reload. If a step cannot create the routine, report that setup error separately.

Each generated `repro.spec.mjs` runs with its report's `playwright.config.mjs` in a separate folder containing only `@playwright/test@1.64.0`. Run `npx playwright test --config playwright.config.mjs` with the app server running. The generated backup check should pass; the generated History check fails its baseline assertion on this pin, exit 1. It should become green after a compatible upstream display fix, without weakening the expected value.

## What is compared

The generic contract observes all fields of each record in `routines`, `routineItems`, `workouts`, `workoutExercises`, `sets` and `bodyWeights`, with explicit inline `id` keys. It retains generated IDs, timestamps, references, optional-field presence, `orderIndex` and `setIndex`; only outer record-array order is ignored. Bounds are 32 records and 65,536 UTF-8 bytes per store. This is not a projection to titles or counts.

The app's original download bytes are uploaded to a fresh guest context whose six selected stores are empty. The expected import message is checked before full restoration and reload comparisons. The source setup checks the saved routine and completed-set UI; the private native diagnostic additionally verifies every selected store has one record and checks the synthetic numeric values. The generic backup contract does not independently assert a fixed nonempty count for every store, nor does it cover the default `exercises` and `settings` stores. The History contract's actual baseline includes one complete record per business store.

Tests use normal guest, routine, set, export and import UI. Storage access is read-only observation; there is no direct seeding, internal app-function call or source patch. External browser requests, including Google Identity, are blocked by the runner. Its same-origin HTTP rule is not a general server egress firewall. No sign-in, cloud sync or backend is used. Stop the local server you started when finished.

## Display-query lead and limits

The pinned History query uses `where("isCompleted").equals(1)`, while Finish stores boolean `true`. [Dexie's indexable-type documentation](https://dexie.org/docs/Indexable-Type) excludes booleans from secondary index keys. This is a source-based explanation consistent with the observed stored record and empty list; it is **not a tested upstream fix**. Simply querying `equals(true)` would not make booleans indexable.

Coverage excludes cloud/Drive, PWA/offline caching, mobile browsers, concurrent use, malformed backups, custom exercises with unsupported own `undefined` fields, exercise ordering beyond this one-item fixture, and health or training outcomes. The native diagnostic's 10,691-byte export contains synthetic records and seeded defaults; raw backups, traces, source and assets stay private. All 47 pinned source files matched their original hashes after local testing. Package metadata says 1.1.1; the Settings footer says 1.1.0, so the commit identifies this test.

Verified on macOS arm64, Node 22.16.0, Next 14.2.13 and Playwright 1.64.0. Initial dependency/browser downloads require internet access. Use synthetic data in a disposable app.
