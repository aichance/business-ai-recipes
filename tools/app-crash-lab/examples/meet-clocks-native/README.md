# Test a real Chrome sync quota and a complete local fallback

The author [acknowledged our report and test cases, then fixed the save path](https://qiita.com/mamarezza/items/824c0c2fbb75456370da#comment-56d858d800b39f06e1eb). We ran the unmodified extension on both source pins using the **same fallback-aware Playwright spec**:

| Source | Three native checks | Quota-boundary outcome |
| --- | --- | --- |
| [v0.9.2 / e7fafc7](https://github.com/mamarezza/meet-clocks/tree/e7fafc7ad7cfb46c9677fb0a4f2ab1e452fb681e) | 2 PASS / 1 FAIL, exit 1 | The new clock appears without a save error, then disappears after reload. Every field of the previous saved record remains intact. |
| [Author fix v0.9.3 / f13d8ff](https://github.com/mamarezza/meet-clocks/tree/f13d8ff41ab6e2a3b22e1ce29294d2b717afd7b1) | 3 PASS, exit 0 | The complete new record falls back to local storage and survives reload, another format edit and a second reload. The older sync record stays intact. |

These are **our operator-run measurements**, separate from the author's public fix report. The author did not explicitly report running this Playwright package. This tests unpacked GitHub source, not the Chrome Web Store package or an actual Google Meet call.

| v0.9.2 after reload: Jordan is absent | v0.9.3 after reload → format edit → reload: Jordan remains |
| --- | --- |
| ![Actual extension panel after the original source silently refused the quota-crossing addition](before-fix-reload.png) | ![Actual author-fixed extension panel preserving Jordan and Avery after the additional UI save and second reload](after-fix-reload.png) |

The images are direct screenshots of the native extension panel on an empty synthetic host. The red banner in the fixed image is a night-time reminder for Jordan's time zone, not a storage error. Both tests use synthetic names and a fresh browser profile. [Selected measurements and complete synthetic records](RESULTS-fallback.json).

## Download just this example

[Download the 199 KB Playwright package (.zip)](https://github.com/user-attachments/files/33792602/meet-clocks-fallback-playwright.zip). Unzip it, open a terminal in `meet-clocks-fallback-playwright/`, then follow the setup below. You do not need to clone the whole App Crash Lab repository.

The 12-file package contains the tests, pinned npm manifest and lock, measurements, screenshots and MIT license from the [measured PR #166 snapshot](https://github.com/aichance/business-ai-recipes/tree/8ab4cd3e5eb8b5a5cc03c7668d20d8d1eb44d333/tools/app-crash-lab/examples/meet-clocks-native). The extension source and installed dependencies are separate.

ZIP SHA-256: `4762c13e8106bc73d70dcc6a278a447f9078f6dd92d79ca43d24c690af4e9841`.

## Run three ordinary Playwright tests

The upstream project has Python/CDP QA, not an existing Playwright Test suite. This is a separate small package with one fallback-aware [test file](storage-boundary.spec.mjs). It needs Node 22+, npm and Playwright's bundled Chromium; no App Crash Lab runtime, JSON contract, Google login, relay or API key.

From this example directory, use a disposable upstream checkout:

```sh
git clone https://github.com/mamarezza/meet-clocks.git meet-clocks-source
git -C meet-clocks-source checkout --detach f13d8ff41ab6e2a3b22e1ce29294d2b717afd7b1
npm ci --ignore-scripts
npx --no-install playwright install chromium
MEET_CLOCKS_SOURCE="$PWD/meet-clocks-source" npm test
```

Expected on the author fix: **3 passed, exit 0**. Use a separate disposable checkout at `e7fafc7ad7cfb46c9677fb0a4f2ab1e452fb681e` to reproduce **2 passed, 1 failed, exit 1** with the same test file. Do not change a checkout in use by another task. Outputs contain complete synthetic storage observations and full-host/extension-panel screenshots. Each test owns a new profile and removes it on exit.

The per-test deadline is 90 seconds, with one worker and no retries. An initial 30-second pilot timed out; an unchanged historical control needed 31.179 seconds on the same host. Those pilot timeouts are inconclusive, not application failures or fix proof. The final two-pin measurements completed without timeouts.

## What the three checks assert

1. An ordinary UI addition preserves its complete saved record and clock after reload.
2. A same-size format edit preserves a valid near-limit record, including every unrelated field.
3. Crossing the sync quota either saves the complete new record to local storage, or refuses visibly while retaining the previous complete record. A successful fallback must also survive reload, another ordinary format edit and reload with all contacts and settings intact.

The fixture has **107 address-book entries and one visible attendee**, not 107 people in a call. Its real sync API usage is **8,166 bytes**. Adding Jordan produces a complete record of **8,278 bytes** (UTF-8 JSON plus the storage key), beyond the actual API's **8,192-byte** per-item quota. The fallback has 108 address-book entries and two visible attendee clocks. Counts depend on these synthetic name lengths; bytes are the boundary.

Both real storage areas receive the same complete fixture in setup because v0.9.3 merges local values over sync on load. After the quota addition, the sync record remains exactly the baseline and local contains exactly the new record. The subsequent UI format edit serializes the reloaded app state, so a partial load that silently dropped other contacts would fail the whole-record comparison. No save/load function or Chrome storage API is replaced, and quota rejection is not injected. The fix has zero observed unhandled extension exceptions in these checks; caught Promise rejections are not reported as directly observed exceptions.

## Historical refusal-only test

The original [181-line sync-only spec](sync-quota.spec.mjs), [measurements](RESULTS.json) and [before](quota-before-reload.png)/[after](quota-after-reload.png) images remain available. `npm run test:refusal` runs that historical test. It expects an explicit refusal and seeds only sync; use it with its documented v0.9.2 pin. It does not support the author's new local-fallback setup. The new test is a changed contract applied identically to both pins, not a claim that the original refusal-only assertions became green unchanged.

## What is real, and what is a fixture?

- The manifest, content script, UI, save/load logic and Chrome storage APIs are original. All 41 source blobs on v0.9.2 and 43 on v0.9.3 were checked against the pinned public Git trees before and after the runs. No upstream source is redistributed here.
- The matching Meet host is controlled empty HTML. Other intercepted page requests are blocked. No real meeting, camera, microphone, relay or signed-in account participates.
- Only the app's complete `meetClocks` record is compared; the transient `shared` flag is excluded exactly as upstream's save function does. An unsaved new clock disappearing is distinct from loss of older saved data.
- The local fallback is device-local. Cross-device synchronization, concurrent writers, immediate browser termination during a write, the local area's larger capacity limit and general Meet compatibility are untested.

Chrome describes [storage quotas and asynchronous writes](https://developer.chrome.com/docs/extensions/reference/api/storage). Playwright documents [unpacked extensions in a persistent bundled Chromium context](https://playwright.dev/docs/chrome-extensions).

Tests and measurement notes: MIT, App Crash Lab. Upstream: MIT, Meet Clocks by mamarezza.
