# My Ideals: preserve complete collection profiles through a real backup

This configuration uses the unchanged, MIT-licensed
[My Ideals source at a65fb102](https://github.com/monaka-ikonoi/my-ideals/tree/a65fb102204fac7c4691cc8ba2119ff6f0d61798).
It creates two synthetic profiles through the normal UI, records two owned
items in the first, downloads **Export All Profiles**, restores the unchanged
JSON in a fresh empty context, then reloads.

The complete `profiles` IndexedDB store is compared, including profile IDs,
names, template references, selected members, every collection/item value,
mode, version, field presence and `lastModified`. Only the outer record-array
order is ignored. Counts or successful import messages alone cannot pass.

## Start the disposable app

Tested locally on macOS, Node 22.16.0, pnpm 12.13.0 and Playwright 1.64.0.
No account, app API key or production records are needed.

```sh
git clone https://github.com/monaka-ikonoi/my-ideals.git my-ideals-local
cd my-ideals-local
git checkout a65fb102204fac7c4691cc8ba2119ff6f0d61798
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev --host 127.0.0.1 --port 54660 --strictPort
```

Leave that server running. The pinned development configuration selects
IndexedDB. The workflow enters the app's bundled `/sample/template.json`
through its normal Template URL input; the app source and sample are unchanged.
External sample-image requests are blocked by the runner's loopback boundary.
The app's normal text placeholders remain usable; image loading is not tested.

In another terminal, save [roundtrip.json](roundtrip.json) in your working
folder, then run the pinned release:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.10.0/aichance-app-crash-lab-0.10.0.tgz app-crash-lab run roundtrip.json
```

Use port 54660, or change **both** `baseURL` and the Template URL input in the
contract. `--base-url` alone does not rewrite that normal UI input.
The report prints its output folder. To rerun the independent exported test,
follow that folder's README with the same app server running. It requires
Playwright, and does not require App Crash Lab at runtime.

## Why there are two profiles

My Ideals debounces progress writes by 500ms. The first, single-profile draft
showed `INCONCLUSIVE / SOURCE_BASELINE_NOT_STABLE` when the expected UI appeared
before the pending storage write. That result is retained as a setup boundary,
not evidence of data loss.

This workflow creates a second profile and returns to the first through the
normal profile selector. The app's session transition flushes pending writes.
There is no arbitrary sleep, injected storage write, fixed random ID or app
patch. Both complete profiles remain in the backup comparison. The currently
selected profile and settings are outside that exported bundle; the restored
UI may select either imported profile. The complete saved collection values
must still match.

## Measured result and exact boundary

- Native diagnostic: one profile, 13 item states, two checked items. Actual
  bundle download → empty target → preview → one import → reload retained
  every complete record and primary key.
- App Crash Lab 0.10.0: the two-profile workflow passed, exit 0, one actual
  1,965-byte JSON download in the recorded run. Export, source-after-export,
  before-commit empty state, restoration and reload comparisons all matched.
- Its generated standalone Playwright test passed independently, 1/1.

The real store has `keyPath: null` and `autoIncrement: false`; each external
primary key equals its record's own `id`. The contract declares
`keyMode: "out-of-line"`, `keyPath: "id"`, at most 16 records and 65,536 UTF-8
bytes. Version 0.9 rejects that explicit mode. A mismatched key, anonymous
record, generated external key or unsupported structured-clone value remains
INCONCLUSIVE. No identity or field is rewritten to make the comparison pass.

The import dialog exists before file selection. The declared commit frame
identifies its **loaded preview state**, when its preview checkbox exists.
The exact `2 / 2 profile(s) to import` text is required, the selected store
must still be empty, and exactly one `Import` button inside that frame is
clicked. The success signal is a loaded profile heading, absent beforehand;
full saved data is checked independently.

This covers a fresh, conflict-free bundle restore in standard mode on the
pinned development source. LocalStorage backend, existing-profile overwrite,
ID conflict handling, version-1 migration, custom mode, service workers,
template/image availability and all browsers/operating systems are untested.
Backup reports contain comparison/hash metadata, without captured records,
screenshots or traces. Declared synthetic contract inputs remain visible.

These are AI-operated maintainer tests. They do **not** establish author
execution, third-party adoption, an app defect or a production deployment.
Upstream app and sample data belong to monaka-ikonoi and their respective
authors; this package contains the test contract, not the app or sample images.

