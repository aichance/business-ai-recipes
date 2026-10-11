# Fala Gringo: keep progress, ignore a visit counter

This example checks unmodified [Fala Gringo](https://github.com/henrikhestnes/fala-gringo)
v1.32.8, pinned to commit `2a4fe3471d296ba9b77c4c449dc92bcb81bf9363`.
It imports one **synthetic** learning record through the backup UI, saves
nondefault goals, then checks reload and a rejected malformed backup.
It needs App Crash Lab 0.3.0 or later; this example is in the source checkout.

## Start the pinned app

Fala Gringo is static. Use a disposable checkout and Python 3; no app package
installation, account, sync code or microphone is needed:

```sh
git clone https://github.com/henrikhestnes/fala-gringo.git
cd fala-gringo
git checkout 2a4fe3471d296ba9b77c4c449dc92bcb81bf9363
python3 -m http.server 54191 --bind 127.0.0.1
```

Leave that terminal running. In a second terminal, from
`tools/app-crash-lab` in this repository, with Node 22+:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node cli.mjs run examples/fala-gringo.json --out .crash-lab/fala-first
npx playwright test --config .crash-lab/fala-first/playwright.config.mjs
```

Keep the output under this tool directory so the generated tests can resolve
its installed `@playwright/test` dependency. Use a new output directory when
rerunning. Open `.crash-lab/fala-first/index.html` for the result and
`report.json` for the captured values. Stop the app server with Ctrl+C.

## Why not compare the entire localStorage blob?

Our initial whole-blob check reported a reload failure, but its only differences
were `prefs.syncNudge` changing from `1` to `2` and the associated
`prefTimes.syncNudge` timestamp. The app deliberately increments this counter
on its first three visits to show a one-time sync hint
([pinned source](https://github.com/henrikhestnes/fala-gringo/blob/2a4fe3471d296ba9b77c4c449dc92bcb81bf9363/js/lib/sync.js#L288)).
The learning record and goals did not change. That result was an overly broad
assertion, **not a demonstrated data-loss bug**.

The contract therefore observes every current progress section (`mastered`,
`strength`, `daily`, `dailyDone`, `days`, `right`, `drilled`, `graduated`,
`milestones`, `resets`) and the saved goal/last-tab preferences with their
timestamps. It also reads the three goal fields after reopening Settings.
Only the sync-hint counter and its timestamp are excluded from this fixture's
known initial state. No app code is changed and no expected learning value is
loosened to obtain a pass.

## Verified behavior and limits

On 2026-10-11, with Node 22.16.0, Playwright 1.64.0, Chromium and App Crash Lab
0.3.0, both CLI checks and both generated standalone tests passed:

| Check | Input and assertion |
| --- | --- |
| Reload | Import a synthetic `numbers` record for card ID `one=um`; save goals `37`, `7`, `12`; reload; compare the selected stored state and visible goals |
| Rejected update | Start fresh with the same saved baseline; import truncated JSON; require the exact rejection message; compare the selected state |

The rejection was `Could not import: invalid file or a backup for another language.`
The nonempty mastery/strength baseline and nondefault saved goals are required
before comparison, so an empty store cannot satisfy this example.

This is our local compatibility check, not the author's run or endorsement.
It does not test completing a real quiz, every card, Daily scheduling, backup
export/download, restore mode, valid-backup conflict resolution, other
languages, storage quota, service-worker updates, multiple tabs, sync, audio
or process-crash recovery. Several observed progress sections start empty;
equality there is not evidence that their populated workflows were exercised.
Each check starts in a new browser context. No real learner data is used.

Fala Gringo code is MIT-licensed; its learning content has a separate
CC BY-NC-SA 4.0 license. This repository includes only our contract and
instructions, with one card identifier and invented counters, not the learning
dataset. Fetch the app from its author using the pinned instructions above.
