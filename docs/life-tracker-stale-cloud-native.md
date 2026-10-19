# A successful cloud read must not erase a newer offline edit

Native Playwright checks for [Life Tracker's existing data-loss issue #28](https://github.com/Adnan9-63/life-tracker/issues/28).
The original app UI, auth context, persistence hook and Supabase SDK run unchanged.
Only the auth/REST HTTP responses are synthetic and controlled on loopback.

**Two controls pass. The preservation regression fails:** after a real SDK upsert
receives a controlled 503, the UI says the new name is saved locally. Reloading
after an older row becomes available replaces that name in both the cache and
the visible title.

[Download the test/setup ZIP](https://aichance.github.io/business-ai-recipes/app-crash-lab-life-tracker-stale-cloud-native-v0.1.0.zip)
· [SHA-256](https://aichance.github.io/business-ai-recipes/app-crash-lab-life-tracker-stale-cloud-native-v0.1.0.zip.sha256)
· [Measured results](life-tracker-stale-cloud-results.json)
· [Readable test](life-tracker-stale-cloud.spec.mjs)

## Run from a fresh folder

Requires Node **22.12+**, npm, Python 3 and free local ports 54311/54312.
Tested on macOS with Node 22.16.0 and Chromium. Extract the ZIP, then run:

```sh
cd life-tracker-stale-cloud-native
npm ci --ignore-scripts --no-audit --no-fund
npm run setup
npx playwright install chromium
npm run controls
npm test
```

The setup downloads the author's public source at
[`402ad57f`](https://github.com/Adnan9-63/life-tracker/tree/402ad57f75816302fc0cd50cb1a17f78eb78d143)
and verifies **all 35 original Git blobs and sizes** before creating a new `app/`.
It refuses an existing `app/`; it does not overwrite your checkout.
Upstream source is **not included** in the ZIP. Our MIT license covers our test,
setup and manifest files only.

The app install follows its CI's `--legacy-peer-deps` flag because plain `npm ci`
fails on the declared Vite 8/PWA-plugin peer range. Package and lock bytes stay
unchanged; install scripts are disabled. No real credentials are needed.

The fresh ZIP setup and both documented test commands were actually executed.
`npm run controls` exits 0. `npm test` exits 1 with **two PASS / one preservation
FAIL**, without expected-failure annotations, skip or retry. This failure is
evidence of the measured issue, not a passing release test.

## What distinguishes the cases

| Case | Observed result |
| --- | --- |
| Successful newer remote row | PASS: the real SDK loads it, cache and title reflect it |
| Rejected write, remote still unavailable on reload | PASS: the newer offline name remains; other four business fields remain intact |
| Rejected write, then successful older remote row | FAIL: the newer local name returns to the original baseline; the captured title also returns to the old name |

The test logs in and edits through the normal UI. It requires an actual rejected
SDK upsert and the app's offline-saved notice before reloading. After the GET,
it waits for SDK retry/fallback and known-record hydration. It compares the full
five-field business record, observes for 1.6 seconds, and keeps the first loss.

On the failing source, the first-loss assertion stops execution before the later
cache/UI preservation assertions. The attached checkpoints independently retain
the final cache and visible title. A missing selector, login or unfinished retry
is labeled `SETUP_FAILED`, rather than counted as this regression.

## Adapt the pattern

Keep the actual client/SDK. Control its HTTP boundary, create a newer change
through normal UI, prove the write was rejected, then return an older successful
read. Assert the entire saved business record and user-visible result. Preserve
the successful-update and continued-outage controls when adapting another app.

This does **not** test real Supabase cloud, RLS, authentication security, physical
offline/PWA behavior, every edit type, or every later retry. The edited field is
the profile name; the other four fields are checked for unintended changes.
Traces and raw auth transport/session evidence stay local. Our repository CI checks the published pack's
identity; the reported browser run was performed separately by the operator.

If you run this on your own app checkout, share the revision and command result,
or the first setup blocker. These operator measurements do not establish an
independent run, maintainer adoption, fix or star.
