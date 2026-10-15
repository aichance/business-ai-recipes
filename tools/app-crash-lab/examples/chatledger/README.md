# ChatLedger: check import persistence and confirmation metadata

A record can reload unchanged after a save has already discarded a field.
This example checks [ChatLedger](https://github.com/tharu200304/ChatLedger) at
`aff6741e4e8c71919882217f6a92b0e660cf967d`, using our own synthetic chat and
its existing **Local English Heuristic** upload mode. The app source is
unchanged. No customer records, account, external LLM or API key is used.

## Measured outcomes

| Contract | Result with App Crash Lab 0.9.0 | Meaning |
| --- | --- | --- |
| [import-reload.json](import-reload.json) | **reload PASS**, exit 0 | The complete selected order, items and source thread match after reload; the icing text and item source positions `[1, 2]` are still present. |
| [confirm-reload.json](confirm-reload.json) | **INCONCLUSIVE at baseline**, exit 2 | After normal confirmation, the expected item instruction and source positions are already missing. The runner makes no reload-preservation verdict. |

On 2026-10-16 JST, a separate normal-UI diagnostic observed:

| Selected value | After importing our chat | After `Confirm & Save Example` |
| --- | --- | --- |
| Item instruction | `Icing text: 'ACL SYNTHETIC CAKE'` | empty string |
| Item source positions | `[1, 2]` | `[]` |
| Order amount | 3800 | 3800 |

The second step changes only the separate kitchen-instructions field to
`ACL correction 日本語 🧁`; that field and `confirmed` status persist. It does
not edit or remove the order line. A subsequent reload matches the already
changed record. This is an operator finding on the pinned local source,
not author confirmation or a verified fix. Internal item row IDs are recreated
by the save path; this example does not treat that ID policy as a defect.

The generated Playwright-only test for import passed (exit 0). The confirmation
test failed at its known-good baseline assertion (exit 1), as expected for this
pin. The separate diagnostic's later reload equality is not a generated
confirmation-test PASS. These
are **one positive control and one reproduced unmet expectation**, not two
passing preservation checks.

## Run against a disposable local copy

Use Python 3.10+, Node 22+ and npm. Start from a new folder; the app stores a
SQLite database and uploaded text inside its own `data/` directory. Do not
use your daily ledger, real WhatsApp exports or an existing app directory.

```sh
git clone https://github.com/tharu200304/ChatLedger.git chatledger-acl-test
cd chatledger-acl-test
git checkout --detach aff6741e4e8c71919882217f6a92b0e660cf967d
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn backend.app:app --host 127.0.0.1 --port 54620
```

Leave the server running. In a second terminal, before opening this local UI,
point its existing Ollama health-check setting at an unused loopback port.
Port 54621 must be unused. The contracts also select `heuristic` explicitly;
**do not use `Load Demo Chats`**, which selects `auto`.

```sh
curl --fail --silent --show-error -X POST http://127.0.0.1:54620/api/settings \
  -H 'Content-Type: application/json' \
  --data '{"seller_name":"ACL Synthetic Shop","seller_phone":"0000000000","ollama_url":"http://127.0.0.1:54621"}'
```

Save the two linked JSON contracts in a separate, empty working folder and run
these commands **sequentially**:

```sh
npx --yes --package=@playwright/test@1.64.0 playwright install chromium
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.9.0/aichance-app-crash-lab-0.9.0.tgz app-crash-lab run import-reload.json --out reports/import
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.9.0/aichance-app-crash-lab-0.9.0.tgz app-crash-lab run confirm-reload.json --out reports/confirm
```

The last command's exit 2 is the observed baseline mismatch, not a setup
success or an expected reload failure. Open the printed HTML report to review
`itemNote` and `itemSources`. If setup cannot create the expected order, report
that separately. Each run adds synthetic records; it does not delete previous
orders. The contracts adjust only this disposable app's seller/health-check
settings. Stop the server you started when finished.

For each exported test, copy that report's `repro.spec.mjs` and
`playwright.config.mjs` to its own new folder, install only
`@playwright/test@1.64.0`, and run `npx playwright test --config playwright.config.mjs`
with the local app running. No App Crash Lab installation is needed there.
The confirmation assertion should pass after a compatible upstream fix that
retains the item metadata; do not weaken the expected values to make it green.

## Scope

The complete first order returned by the existing same-origin filtered
`GET /api/orders` is compared, including its items and hydrated source thread.
Known synthetic instructions, source positions, status and amount prevent an
empty or unrelated record from passing. UI import creates the source records;
confirmation uses the normal button. No SQL or browser-storage injection is
used. Reports and traces contain the selected values, so keep them private
when adapting the contract to real data.

This is **reload-only**. It does not test rejected updates, full backup/restore,
Excel arithmetic, model extraction, LoRA training quality, server restart,
sync or concurrent users. Google Fonts is blocked by the runner's external
HTTP rule; no app source modification is needed.

Only our independently authored contracts and guide are distributed here.
No upstream source, assets, sample chat or raw API snapshot is bundled; the
upstream pin has no license file. See [SOURCE.json](SOURCE.json) for the source
pin and operator verification boundary. This AI-assisted example is maintained
by the human-owned aichance project; it is not an independent-user report.
