# LifePilot: a repeatable local continuity baseline

Checks for the unchanged [LifePilot v0.4 source](https://github.com/gregmoulton/LifePilot/tree/4710a5ec56dccd9436fec48369d513144306d7de), using App Crash Lab **0.12.0-dev.2** (a prerelease). This is a small local baseline for the author's [continuity/comparison requirements](https://github.com/gregmoulton/LifePilot/issues/2), not an evaluation of competing services or personal effectiveness.

The LifePilot README already reports acceptance tests and owner UAT. This pack does not allege a defect or missing tests. It gives the same synthetic scenario a portable JSON contract, state differences and generated standalone Playwright tests.

## Run entirely in GitHub

The **LifePilot continuity trial** workflow runs these same contracts against
the original public LifePilot files on an ephemeral Linux runner. It requires
no local Node.js, browser or server setup and no application account or API key.

1. Fork `aichance/business-ai-recipes` into your personal account.
2. Open **Actions** in that fork. If GitHub asks, review and enable the fork's
   workflows, then select **LifePilot continuity trial**.
3. Select **Run workflow** on `main`. Keep the measured LifePilot commit
   `4710a5ec56dccd9436fec48369d513144306d7de`, or enter another full 40-character
   LifePilot commit SHA to check an update with the same contract.
4. Read the job summary and download its `lifepilot-continuity-...` artifact.
   A green job verifies three normal PASS results, the deliberate changed-goal
   FAIL and the wrong-baseline INCONCLUSIVE. The latter two are intended controls.

The workflow anonymously verifies the fixed personal owner/repository IDs before
downloading only `index.html` and `execution.js`. It executes no upstream install
or server scripts, serves those files on loopback, and uses fresh browser contexts
with synthetic profiles. The uploaded artifact contains reports and generated
tests, not the upstream source or raw browser traces. Original source hashes are
checked for the default pin; a selected newer commit is recorded separately and
may require a contract update. A request limit, missing browser or setup failure
must not be treated as an application data-loss verdict.

The artifact includes 18 explicitly selected result/test files and an
`artifact-manifest.json` with their SHA-256 hashes. Missing expected files fail
the job; a partial diagnostic artifact must not be presented as a complete run.

This is a LifePilot-specific trial. Using another app requires its own source and
contract. The action's execution record, app ownership and report must be checked
before calling a run independent author use; a run by aichance is operator testing.

For a local Linux/macOS run, after the runner's documented dependencies are ready:

```sh
node ci-trial.mjs --fetch-source --out .crash-lab/lifepilot-ci-1
```

The explicit flag opts into the bounded public-source download. Output must be a
new directory. Each CLI run has a two-minute deadline. Timeout, SIGINT and SIGTERM
stop the owned CLI tree, including separate browser process groups. A forced
SIGKILL of the helper itself cannot run cleanup; terminate the disposable job if
that happens. The normal App Crash Lab CLI commands below remain available.

## What runs

The initial profile has two goals, one completed prerequisite, a planned task linked to it, an approved decision, a prior correction and an extra profile field. The test imports that synthetic fixture, then uses the real **System Improvement Log** form to save a second correction with its details, goal, task reference and evidence.

| Contract | Expected result |
| --- | --- |
| `preservation.json` | PASS after reload; PASS after `{}` is rejected with the exact native alert. Full stored profile and correction summary/reference are compared. |
| `roundtrip.json` | PASS for the actual exported JSON, import into a new empty browser context, and reload. The complete profile is compared, including generated IDs/timestamps, execution records, decisions and correction history. |
| `changed-goal-control.json` | Deliberate FAIL: pause goal B after reload. Both goals still exist, but `goals[1].status` changes from `active` to `paused`. This checks the test oracle, not a LifePilot bug. |
| `wrong-baseline-control.json` | Deliberate INCONCLUSIVE: the declared task reference is wrong before preservation is tested. It must not PASS. |

The completed prerequisite and planned successor are **imported synthetic records**. Their creation/completion dialogs are outside this check. The new correction is saved through the normal UI. No private profile is needed.

## Start the app

Use a disposable checkout at commit `4710a5ec56dccd9436fec48369d513144306d7de`. Serve its original `index.html` and `execution.js` together:

```sh
# Terminal A, inside that LifePilot checkout
python3 -m http.server 59818 --bind 127.0.0.1
```

This origin is separate from a live GitHub Pages profile. Do not import a real personal backup for this trial. LifePilot source is not included in this pack; obtain it from its original repository or use your own checkout. See `SOURCE.json` for the two measured source-file hashes.

## Run the checks

Node.js **22+** and Chromium are required. In Terminal B, inside this extracted pack:

```sh
# Once, if Playwright's Chromium is not already installed
npm exec --yes --package=@playwright/test@1.64.0 -- playwright install chromium

npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.12.0-dev.2/app-crash-lab-0.12.0-dev.2.tgz app-crash-lab run preservation.json --out .crash-lab/lifepilot-preservation-1

npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.12.0-dev.2/app-crash-lab-0.12.0-dev.2.tgz app-crash-lab run roundtrip.json --out .crash-lab/lifepilot-roundtrip-1
```

Each output contains `index.html`, `report.json`, and `repro.spec.mjs` with its Playwright config. The generated test needs `@playwright/test` but does not import App Crash Lab. Use a new output-directory name for another run. A different local port can be supplied with `--base-url http://127.0.0.1:PORT`.

To check the two controls, use the same `npx` command with `changed-goal-control.json` or `wrong-baseline-control.json`, and a separate output directory. Exit codes are **0 PASS, 1 FAIL, 2 INCONCLUSIVE**. The two deliberate controls are expected to return 1 and 2 respectively.

The tool repository, account, API key and model call are not required during a run. The first `npx` invocation downloads the tool and its Playwright dependency.

## A useful configuration detail

Before a fresh import, `lifepilot-v02-profile` is absent. Nested `jsonPath` observations cannot traverse that absent value. The roundtrip contract therefore observes the **entire profile** (`null` before import), checks the same known nested values through `sourceReady`, and compares the entire profile across export/restore/reload. It does not discard generated IDs, timestamps or unknown profile fields to pass.

The preservation contract can navigate back to the correction tab after reload. Backup readiness hooks do not allow those clicks, so its UI observation is the profile label; full correction data remains in the complete stored-profile comparison. An additional independent operator check also verified the visible correction details and prerequisite after real restoration. Its measured scope is recorded in `RESULTS.json`.

## Scope and attribution

This pack was prepared and exercised by aichance using AI under a human owner's responsibility. Operator verification is separate from author adoption. See `RESULTS.json` for measured outcomes and limits.

No cloud synchronization, competing SaaS, voice input, motivation/causal efficacy, mobile browser, all-feature or cross-version guarantee is made. Run your wider acceptance tests as usual. A changed UI/schema can require a contract update; do not change expected values merely to make an unexpected result pass.

The MIT license in this pack applies to these original fixtures, contracts and documentation. It does not license or redistribute LifePilot's source. [App Crash Lab source and examples](https://github.com/aichance/business-ai-recipes/tree/main/tools/app-crash-lab).
