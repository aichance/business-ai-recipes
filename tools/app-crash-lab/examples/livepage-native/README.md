# A two-tab regression you can keep in your Playwright suite

**A toolbar click in an earlier tab can erase another tab's saved row.**
This single [native Playwright file](stale-tab.spec.mjs) checks that failure
without App Crash Lab's runner, JSON contract or generated protocol. It contains
three tests: same-tab and new-tab controls, then the earlier-tab regression.

The regression comes from the existing [LivePage issue #355](https://github.com/glennfaison/livepage/issues/355).
Our unmodified local build at [`915f828f`](https://github.com/glennfaison/livepage/tree/915f828f0b8f9fabc0124c37b5d94797b2ef02e3)
preserves the saved title and row in both controls, but loses both in the earlier
tab case. The toolbar's separate saved `false → true` change is confirmed in all
three. [Full original measurements and screenshots](../livepage/README.md).
These are our tests with synthetic data, not maintainer adoption or a verified
upstream fix.

## Already using Playwright? Copy one file

1. Review and save [stale-tab.spec.mjs](stale-tab.spec.mjs) as, for example,
   `tests/e2e/save-preservation.spec.mjs` in your app's existing test suite.
2. Start a **disposable local LivePage build** using the pinned-source instructions
   below. To test another app, first make the four marked adaptations below.
3. From your existing app project, run:

```sh
LIVEPAGE_URL=http://127.0.0.1:54194/try npx --no-install playwright test tests/e2e/save-preservation.spec.mjs
```

Your suite needs `@playwright/test`, a Chromium browser, and a `testMatch` that
includes `.spec.mjs`. Choose its Chromium project if the suite defines several
projects; other browsers have not been verified. You keep your existing reporter
and dependency installation. The file explicitly starts an empty context rather
than using a suite's saved login/storage state. The two pages in each test share
that context; separate tests do not share saved data.

## Adapt it to your own app

Four `ADAPT` comments mark the app-specific parts:

| Edit | Replace with your app's actual behavior |
| --- | --- |
| URL and protected state | Your local entry, saved key, and the **complete** record/tree you need to preserve |
| Saved-state read | A read-only observer of the real stored value; this example reads one localStorage JSON envelope |
| Primary UI steps | Save a non-default initial value, open the peer, then make a distinguishable new edit through normal UI |
| Peer UI and commit | Change a different persisted field in the earlier peer; prove that change really saved before checking preservation |

Also replace the example's title, row and toolbar assertions with your own
values. The four comments are a map, not four automatic substitutions. Do not
keep a LivePage selector or localStorage oracle for an app that uses IndexedDB
or server storage. A delete test should assert the record stays absent; this
sample instead preserves an existing complete tree.

Keep the two controls while adapting. Confirm the initial saved sentinel in the
peer **before** editing the primary. A correct storage-event synchronization fix
is allowed: the test does not require that peer to keep displaying old data.
Compare all relevant fields, including generated IDs and nested attributes;
checking only a title or item count can miss corruption.

## Run the measured LivePage case in a separate folder

Download the [small native ZIP](https://aichance.github.io/business-ai-recipes/app-crash-lab-livepage-native-v0.1.0.zip)
and [SHA-256 checksum](https://aichance.github.io/business-ai-recipes/app-crash-lab-livepage-native-v0.1.0.zip.sha256).
It contains this guide, the native spec/config, pinned Playwright metadata,
license and measured summary. It does not include LivePage or a browser profile.

In a disposable checkout of the pinned LivePage source:

```sh
npm ci --ignore-scripts --no-audit --no-fund
NEXT_PUBLIC_PROMPT_ASSIST_ENABLED=0 npm run build
NEXT_PUBLIC_PROMPT_ASSIST_ENABLED=0 npm run start -- --hostname 127.0.0.1 --port 54194
```

In a second terminal, inside the extracted native ZIP:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm test
npm run controls
```

On the measured pin, `npm test` should exit **1** with **two passing controls and
one failing regression**. `npm run controls` should exit **0**. The failed
assertion says `PRESERVATION` and attaches the complete saved checkpoints. A
`PRECONDITION` failure instead means the initial save, hydration or peer commit
was not established; it is not proof of this data-loss bug. No test is marked
`test.fail()` or skipped to make the broken app appear green.

## What this does and does not establish

- Each saved-state read parses the envelope once. It preserves the whole
  `componentTree` and separately confirms the toolbar commit after reload.
- The 1000 ms observation windows exceed this app's measured 500 ms debounce.
  Samples are about 75 ms apart; unobserved instants and later writes are not
  covered. A loss seen in a sample remains a failure even if a later write repairs it.
- Only HTTP loopback URLs without credentials are accepted. HTTP requests are
  restricted to that app origin; service workers are blocked. Use synthetic
  data on disposable local copies.
- This is one ordered two-page localStorage scenario, not a concurrent-write
  stress test, IndexedDB test, server conflict test or whole-app durability claim.
  Unexpected native dialogs fail the test; no dialog-handling protocol is included.
- The app was measured on macOS, Node 22.16.0, Playwright 1.64.0 and Chromium.
  [RESULTS.json](RESULTS.json) separates real-app runs from authored acceptance fixtures.

If you try it on your own app, a useful report is: the app/version, which saved
value you protected, what you changed in the test, and the result or setup
blocker. [Report your own-app result](https://github.com/aichance/business-ai-recipes/issues/new?title=Native%20Playwright%20save%20check%20result).
Keeping or starring the repository for your next release is optional.
