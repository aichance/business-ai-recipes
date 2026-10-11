# Missing CSS made an invalid test route pass

This is a counterexample about **our test setup**, not a reported production bug
in MealAI. A missing stylesheet made a normally hidden input control clickable.
Our first contract took that invalid route and reported PASS. The corrected
contract checks the starting UI state and uses a route available with normal CSS.

## Controlled result

On 2026-10-11 we served the same prepared app bytes at one loopback origin.
One server mode returned the local Tailwind CSS; the other returned 404 for that single asset.
Application JavaScript, synthetic input, selected date, browser and runner were
unchanged. Each check started in a fresh browser context.

| Contract | Local Tailwind CSS | Reload | Rejected update | CLI exit |
| --- | --- | --- | --- | --- |
| Original counterexample | Available | PASS | INCONCLUSIVE: hidden click target | 2 |
| Original counterexample | Withheld | PASS | PASS via the invalid route | 0 |
| Corrected `mealai.json` | Available | PASS | PASS | 0 |
| Corrected `mealai.json` | Withheld | INCONCLUSIVE: baseline | INCONCLUSIVE: baseline | 2 |

The original contract tried the empty-lunch button after a lunch had been saved.
With CSS available, that element was hidden and the click timed out after 7000ms.
With the stylesheet missing, `.hidden` no longer hid it: the test could click it
and reach a zero-calorie rejection. The successful preservation check did not
establish that the normal UI path worked.

The corrected baseline expects `oldEntryVisible: 0`; missing CSS produced `1`.
The runner stopped with `Known-good baseline did not match expected values; no
preservation verdict`. This is **INCONCLUSIVE, not an app-data-loss FAIL**. Its
state-difference list was empty because the comparison phase was never reached.

The corrected rejection route starts at the still-empty dinner entry, selects
`lunch` in the modal, checks that selection, then submits zero calories. It
requires the exact native alert and unchanged saved object/card. Neither route
uses force-clicks or changed application JavaScript.

## Reproduce all four runs

First follow [README.md](README.md#prepare-a-local-copy) to prepare your disposable
app and build its local CSS. Stop the README's single server before starting this
experiment. Python **3.9+**, Node **22+**, npm and installed Playwright Chromium are needed.
From this example directory:

```sh
python3 css-control-server.py ./mealai-local
```

Keep that terminal open. In another terminal, from the same example directory:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run legacy-contract-counterexample.json --base-url http://127.0.0.1:54198 --out css-legacy-available
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run mealai.json --base-url http://127.0.0.1:54198 --out css-current-available
```

Stop the server with Ctrl+C. Restart at the **same URL**, withholding only CSS:

```sh
python3 css-control-server.py ./mealai-local --withhold-css
```

In the second terminal:

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run legacy-contract-counterexample.json --base-url http://127.0.0.1:54198 --out css-legacy-withheld
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run mealai.json --base-url http://127.0.0.1:54198 --out css-current-withheld
```

Run each line even when a previous run exits 2; that is an expected result in
this experiment. Each output directory must be new. Open its `index.html` and
`report.json`. Ctrl+C in the server terminal stops the server. The server reads
only six named app assets into memory and makes no network request itself.
Use `--port N` to choose a different port, updating all four base URLs accordingly.

`legacy-contract-counterexample.json` is the byte-identical rejected first
attempt, supplied **only to demonstrate the invalid route**. Do not use it as
your app's normal regression contract. `mealai.json` is the accepted contract.

## Scope and evidence

[results-summary.json](results-summary.json) records the measured statuses,
baseline values, runner versions and SHA-256 hashes. The pinned app-source checks
and CSS build caveats in the [README](README.md#limits) still apply. This experiment
does not establish CDN equivalence, public-site behavior, mobile layout, photo/AI
features, real-user data safety or third-party adoption.

The general lesson is to check **the starting UI state required by your test**,
in addition to the final stored value. An asset failure that changes visibility
can change what the test is testing. A baseline mismatch should stop the verdict;
it should not be converted to PASS by forcing a click.
