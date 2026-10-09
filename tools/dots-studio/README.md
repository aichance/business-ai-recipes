# Dots Studio

**Four interactive workbenches. One input you can inspect and replay.**

| Workbench | Do something useful | Take it with you |
| --- | --- | --- |
| Scenario Lab | Open a CSV and change price/quantity assumptions | Exact cents-based comparison + `.scenario` replay |
| Evidence Canvas | Select claims, inspect attached excerpts, record your decision | Sources, missing evidence and next checks in `.evidence` |
| Run Lens | Scrub a supplied event log to its failure and blocked dependents | Selected failure and reproducible `.dotrun` repair pack |
| Proof Pack Builder | Compare supplied input, before/after values and checks | Selected checks and a `.proof` replay pack |

![Scenario Lab using a CSV](demo/scenario.jpg)

## Try the panels in a minute

Node **22 or newer** is required. No API key is needed.

```bash
git clone https://github.com/aichance/business-ai-recipes.git
cd business-ai-recipes/tools/dots-studio
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run preview
```

Open [Scenario Lab](http://127.0.0.1:8782/scenario?preview=1),
[Evidence Canvas](http://127.0.0.1:8782/evidence?preview=1), or
[Run Lens](http://127.0.0.1:8782/run?preview=1), or
[Proof Pack Builder](http://127.0.0.1:8782/proof?preview=1).
Choose **Open your file**, select items, then **Export full-input replay**.
Save the file or copy its visible JSON if the host blocks file downloads.
Change one assumption and compare results. Stop the local server with Ctrl-C.

The full-input replay contains **all supplied input**, including unselected
items, to reproduce the full calculation. **Share selected context** sends
only checked items (plus linked sources and next checks) to a connected host.
It is disabled in the local preview. Neither operation automatically posts a
message, executes a repair, or changes an external system.

## Replay without the UI

From the repository root, after installing the dependencies above:

```bash
node tools/dots-studio/replay.mjs tools/dots-studio/fixtures/own-sales.scenario
```

This pack came from the UI using the second synthetic CSV: baseline gross
margin `400.00`, price assumption `+1%`, new gross margin `405.60`, difference
`5.60`. Only Workshop is selected for context. Guide remains in the full-input
pack so its contribution to the total can be recomputed.

The CLI validates the input and recomputes from it; it does not trust a saved
result or execute a command from the JSON. Open the pack in its matching panel
to restore assumptions, selection, decisions and replay position.

## Plugin source and extension surfaces

`plugin.json` + portable `mcp.json` describe a local stdio MCP process. Prepare
dependencies and build assets **in this directory before adding it to a host**.
A host must support local processes, MCP Apps and OpenAI Extensions. Use that
host's documented local-plugin installation flow with this directory; source
publication does not install it into an account or provide a remote endpoint.

The four `open_*` tools register sidebar/global, thread-panel and file
entrypoints (`.csv`/`.scenario`, `.evidence`, `.dotrun`, `.proof`). The UI
implements the granted file-resource bridge and selected model-context update.
The four `analyze_*` tools also open the matching panel; `replay_pack`
recomputes a pack.
HTML resources are bundled with no remote script or font fetches.

**Verified:** build, fourteen tests, discovery of nine tools and four HTML
resources, local preview import, condition changes, selections and replay JSON.
**Pending:** installation and a complete
run in an actual dots account/host, host file permissions and context delivery.
The preview displays `HOST UNVERIFIED` for this reason.

Dots can use supported plugins available to its computer/account, but that
does not guarantee that a particular local stdio plugin works in its cloud
computer. [Official dots guidance](https://learn.chatgpt.com/docs/dots/computers-and-apps),
[Extensions specification](https://developers.openai.com/plugins/build/extensions),
[SDK](https://github.com/openai/mcp-extensions).

## Bring a different input

- **CSV:** exact header `name,unit_price,unit_cost,units`; 1–1000 rows;
  nonnegative amounts with up to two decimal places and integer quantities.
  All rows use one currency/unit. Assumptions range from -80% to +100%.
  Prices round per unit to cents; quantities round to integers.
- **Evidence JSON:** `title`, `claims: [{id,text,sourceIds}]`,
  `sources: [{id,title,url,excerpt,checkedAt?}]`. Only HTTP(S) links are accepted;
  links and excerpts are supplied, not fetched. `linked` does not mean true.
  Decisions are recorded as the user's choice, not an AI approval.
- **Run JSON:** `title`, `steps: [{id,title,dependsOn}]`,
  `events: [{step,at,type,note?,artifact?}]`. `at` is nonnegative seconds;
  `type` is start/success/failure. The whole log is checked before prefix replay;
  dependencies must finish successfully before their dependents start.
  Artifact names are declarations; files are not opened or verified.
- **Proof JSON:** `title`, `input`, `before`, `after` metric arrays with
  `{id,title,value}`, and `checks: [{id,title,status,note,metricIds,artifact?}]`.
  Status is supplied evidence; `unverified` remains unverified and missing
  before/after values are shown instead of being inferred.

Files are capped at 200 KB. Large selected context is rejected with a smaller
selection instruction; it is never silently truncated. The tool has no live
dot log collector, background notification subscription, truth checker,
forecasting model or auto-repair executor. It works on explicitly supplied
input and leaves decisions with the user.

## Why this instead of pasting everything into a chat?

The panel makes assumptions and the selected scope visible. A spreadsheet can
do the same arithmetic, and a text editor can read the same log; this prototype
adds an inspectable UI, dependency-aware replay and a portable handoff pack.
It makes no measured time-saving or adoption claim.

[50 ranked extension ideas](IDEAS.md) are the next experiments; only the four
workbenches above are implemented. AI-assisted work by **Naoya / jokv213**.

日本語: CSVの条件を動かす、主張と根拠を選ぶ、失敗したrunを時間順に追う、証拠パックを比較する4画面。
結果だけでなく入力・条件・選択をJSONで持ち帰り、同じ計算を再現できます。
現版はローカル画面とMCP接続まで検証済みで、実際のdots内の利用は未検証です。
