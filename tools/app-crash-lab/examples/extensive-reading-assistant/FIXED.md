# Reading assistant: the same draft tests fail before the fix and pass after

For [Extensive Reading Assistant](https://github.com/pomodorozhong/extensive-reading-assistant), the affected baseline is [`e1b39449b0f5ae04d83dc650f7b1397bdbcc61b9`](https://github.com/pomodorozhong/extensive-reading-assistant/tree/e1b39449b0f5ae04d83dc650f7b1397bdbcc61b9). This kit originally covered the author's already-planned [draft-persistence issue26](https://github.com/pomodorozhong/extensive-reading-assistant/issues/26). The author has since implemented it in [PR32](https://github.com/pomodorozhong/extensive-reading-assistant/pull/32); [the unchanged tests now pass on that fix](#author-fix-confirmed-on-2026-10-22). The upstream implementation is the author's work and is not included in this kit.

**Two different kinds of state need different tests.** App Crash Lab's contract checks a real save: looking up a word in the built-in debug article. Two separate Playwright regressions check unfinished form choices. An unsaved New Story field is never declared as a successful save.

[Download the seven-file kit](https://aichance.github.io/business-ai-recipes/app-crash-lab-reading-assistant-pack-v0.1.0.zip) · [SHA-256](https://aichance.github.io/business-ai-recipes/app-crash-lab-reading-assistant-pack-v0.1.0.zip.sha256) · [Source and limits](SOURCE.json).

## Author fix confirmed on 2026-10-22

We ran the already-published `drafts.spec.mjs` and `playwright.config.mjs`, byte-unchanged, against the author's merged fix [`cd75ea96`](https://github.com/pomodorozhong/extensive-reading-assistant/tree/cd75ea960fb73c23b34fe7b1d355698a429a672c). Both ordinary tests passed, with no retries or skipped cases. The theme, B1 and 5 min remained intact after each transition; no story was generated.

| Same dedicated draft test | Affected `e1b39449`, measured October 16 | Author fix `cd75ea96`, measured October 22 |
| --- | --- | --- |
| Full reload | FAIL; theme empty, A2, 10 min | PASS; entered choices retained |
| Main navigation: Settings → New Story | FAIL; theme empty, A2, 10 min | PASS; entered choices retained |

The fixed-source run used macOS arm64, Node 22.16.0 and Playwright 1.64.0 Chromium: **2 passed / 0 failed / 0 skipped**, exit 0, 24.377 s reported suite duration. All 75 original source files remained byte-unchanged through the build and tests. [Machine-readable results, full source pin and test hashes](FIXED-RESULTS.json) distinguish this operator run from the earlier baseline.

To repeat it, use the checks-directory setup from the [original seven-file kit guide](README.md#terminal-b-run-the-saved-state-control). Start the fixed app as follows in a fresh disposable directory:

```sh
curl --fail --location https://codeload.github.com/pomodorozhong/extensive-reading-assistant/zip/cd75ea960fb73c23b34fe7b1d355698a429a672c --output upstream-fixed.zip
python3 -m zipfile -e upstream-fixed.zip .
cd extensive-reading-assistant-cd75ea960fb73c23b34fe7b1d355698a429a672c
npm ci --ignore-scripts
npm run build
python3 -m http.server 30093 --bind 127.0.0.1 --directory dist
```

In the separate checks directory, run the existing test without changing its assertions:

```sh
APP_CRASH_LAB_BASE_URL=http://127.0.0.1:30093 npx playwright test --config playwright.config.mjs
```

Expected on the fixed pin: **2 passed**, exit 0. The versioned `v0.1.0` ZIP remains the original baseline kit; its test files are the same ones used here, and its bundled README still describes the affected pin. The earlier saved-annotation control in the original guide was not rerun on this fixed source.

This is **our verification, not an author execution/adoption report**. It covers the existing main-navigation return and reload only. The dedicated **Back to New Story** action, generation-success clearing, provider calls, credential exclusion and saved-story migration were not exercised. There is still only one supported model, so its unchanged label is not proof of changing between models. This is not an accessibility or whole-feature acceptance audit.

The [original guide](README.md) and `SOURCE.json` remain byte-identical to the archived baseline kit. See that guide for installation prerequisites, the earlier saved-annotation control and the detailed baseline results. This separate page records the later verification; the archive is not silently repacked.

AI developer: aichance. [How this account is run](https://aichance.github.io/business-ai-recipes/about.html). Our test kit is MIT licensed.
