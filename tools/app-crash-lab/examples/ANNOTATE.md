# Do imported HTML review comments survive the next operation?

[annotate.js](https://reviewjs.github.io/annotate/) adds a review layer to HTML
and lets reviewers exchange comments as JSON. This small compatibility example
checks its local import workflow with one synthetic comment:

1. Import a valid comment, reload, and compare both the stored project and the
   rendered comment.
2. In a separate fresh browser context, import the same valid comment, attempt
   to import malformed JSON, require the specific invalid-JSON error, and check
   that the original stored project and rendered comment remain unchanged.

**Observed on 2026-10-10:** both checks passed with the unmodified npm package
`@reviewjs/annotate@1.5.1` and App Crash Lab 0.2.1. The two exported Playwright
tests also passed. This is correct behavior, not a reported annotate.js bug.

## Run it locally

Use the current repository checkout; these example files were added after the
0.2.1 ZIP release. Requirements: Node 22+, npm, Python 3, and `tar`. From
`tools/app-crash-lab/`, install this runner's dependencies if needed:

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

Prepare a disposable page. This downloads the pinned official npm package but
does not run its package scripts or change this tool's dependencies:

```sh
mkdir -p .crash-lab/annotate-site
npm pack @reviewjs/annotate@1.5.1 --ignore-scripts --pack-destination .crash-lab/annotate-site
tar -xzf .crash-lab/annotate-site/reviewjs-annotate-1.5.1.tgz -C .crash-lab/annotate-site --strip-components=1 package/annotate.js
cp examples/annotate.html .crash-lab/annotate-site/index.html
python3 -m http.server 54191 --bind 127.0.0.1 --directory .crash-lab/annotate-site
```

Keep that terminal running. In a second terminal, from `tools/app-crash-lab/`:

```sh
node cli.mjs run examples/annotate.json --out .crash-lab/annotate-first
npx playwright test --config .crash-lab/annotate-first/playwright.config.mjs
```

Expected: `PASS reload`, `PASS rejected-update`, then `2 passed`. Open
`.crash-lab/annotate-first/index.html` for before/after values. Choose a new
output directory on the next run. Stop the local server with Ctrl-C.

## What the contract observes

The whole `annotate:crash-lab-synthetic` localStorage record, the imported ID
and text, the rendered comment count, and its body text form the preservation
snapshot. The successful import must first match known synthetic values. The
malformed file is the literal `{"comments":[`; rejection requires the exact
visible message `That file isn’t valid JSON`. A missing message is not a pass.

The contract opens the Comments panel through its normal button. Its import
button creates a hidden file input; `setFile` supplies inline synthetic data
to that input. No script injection or changes to annotate.js are needed.

To adapt this to your own disposable HTML, use the same local script and
`data-project` value, or update the contract's storage key and route to match
your configuration. Use your own test server, not a production page.

This covers one local comment/import path in Chromium and a 500 ms observation
window. It does not test remote collaboration, JSON export/download fidelity,
all annotation types, browser crashes, concurrent reviewers, or later writes.
The test host is our minimal synthetic HTML, not any other user's page.

annotate.js is by Akash Goswami and its contributors, under MIT. The pinned
tarball's SHA-256 is
`0313d1edba9a4f5c8cbac4dfb15c2256bab552c47048c9515a230e3b62ef72ff`;
registry integrity was also verified. This independent example does not imply
upstream adoption or endorsement. Prepared and executed by an AI-operated,
human-owned project.
