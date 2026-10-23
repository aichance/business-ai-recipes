# Agent Relay Check

**Does a fresh Codex session actually receive the marker in your `AGENTS.md`?**

Add a disposable marker to the instruction path you want to test. Agent Relay Check starts a fresh session and asks for that marker **without putting its value in the question**. A local, deterministic check compares the reply. After a configuration or CLI update, run the same check again and compare the reports.

The first adapter checks **Codex startup guidance**: `AGENTS.md`, `AGENTS.override.md`, parent/child scope and configured discovery rules. It preserves your guidance settings while restricting tools and disabling configured MCP servers, Apps, plugins and hooks for the diagnostic. It does **not** test hook delivery, MCP handoff, compaction or every instruction's effect on behavior.

## Try your own project

Requires Node.js 22+, an authenticated Codex CLI **0.163.0 or newer**, macOS/Linux or native Windows, and access to **gpt-6.1-sol with MAX reasoning**. Native Windows is experimental: process and CLI transport tests are separate from an authenticated marker response; see the CI results and verification boundary below. Live checks use that existing account's quota or billing. No additional service, API key entry, npm dependency or global installation is needed. Unsupported model access fails; the tool never substitutes another model.

Prefer a small download? Get the [v0.1.1 ZIP](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.1.zip) and [SHA-256](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.1.zip.sha256), extract it, and open its `agent-relay-check` directory instead of cloning below. The original v0.1.0 archive is preserved. [Measured macOS four-case result with v0.1.0](examples/MEASUREMENTS.md).

```sh
git clone --depth 1 https://github.com/aichance/business-ai-recipes.git relay-kit
cd relay-kit/tools/agent-relay-check
node cli.mjs prepare --out ../relay-before
```

1. Open `../relay-before/instruction.md`. Append its diagnostic block to the existing instruction file you want to check. **Do not replace your project's existing instructions.**
2. Keep `challenge.json` outside the project being tested. Do not paste it into the agent, its question or another guidance file.
3. Run the check, replacing the example project path:

```sh
node cli.mjs run \
  --project /path/to/your-project \
  --challenge ../relay-before/challenge.json \
  --out ../relay-result-before \
  --live
```

`--out` must be a **new directory** whose parent already exists. Challenge and output paths must be outside the tested project, including resolved symlinks. The tool does not edit your instruction files. Remove your diagnostic block when you finish.

### Native Windows / PowerShell

Use a native Node/Codex installation; WSL is a different environment. Check `node --version` and `codex --version` first. Relay does not upgrade the CLI or sign you in. In the extracted `agent-relay-check` directory:

```powershell
$RelayWork = Join-Path $env:TEMP ('relay-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $RelayWork | Out-Null
node .\cli.mjs prepare --out (Join-Path $RelayWork 'before') --keys project_probe
```

Append only the generated `instruction.md` block to the instruction file you want to test, then replace the example path with your own startup directory:

```powershell
node .\cli.mjs run --project 'C:\path\to\your-project' `
  --challenge (Join-Path $RelayWork 'before\challenge.json') `
  --out (Join-Path $RelayWork 'result-before') --live
```

Read `report.json` locally. Keep this PowerShell session open. For a later settings or CLI change, use the same workspace and marker name:

```powershell
node .\cli.mjs prepare --out (Join-Path $RelayWork 'after') --keys project_probe
# Replace only the previous diagnostic block with after\instruction.md, then:
node .\cli.mjs run --project 'C:\path\to\your-project' `
  --challenge (Join-Path $RelayWork 'after\challenge.json') `
  --out (Join-Path $RelayWork 'result-after') --live
node .\cli.mjs compare `
  --before (Join-Path $RelayWork 'result-before\report.json') `
  --after (Join-Path $RelayWork 'result-after\report.json')
```

Use the same startup directory and record what changed. Each live run makes one model call; prepare/compare are offline. Remove only the temporary instruction block after your final check. For another comparison, start a new workspace instead of reusing existing output directories.

The Windows launcher respects PATH order: it uses `codex.exe`, or runs the adjacent official npm `codex.js` launcher with Node. It never starts a `.cmd`/`.bat` shell. A timeout or cancellation targets only the still-live owned process tree using Windows `taskkill /T /F`, then waits for both the helper result and stdio close. Failed or uncertain cleanup makes the observation inconclusive; do not automatically retry it. This is bounded cleanup, not Job Object containment of deliberately escaped processes.

**Verification boundary:** the CI job runs real Windows process-tree tests, and an opt-in smoke test installs official Codex 0.163.0 in an isolated path with spaces. That smoke test initializes stdio and reads effective restrictions with a temporary configuration home, without a thread, model turn or credentials. CI success does not prove an authenticated Windows marker response or external adoption. The macOS v0.1.0 measurements remain historical. No Windows live receipt has been verified at this release's preparation.

## Read the result

| Result | What was observed |
|---|---|
| `RECEIVED` | The exact random marker was returned in a fresh, completed session with no observed tool activity. |
| `NOT_OBSERVED` | The response was usable but the marker was null or different. This does **not** prove non-delivery: the model can ignore or misremember it. |
| `INCONCLUSIVE` | The run was unusable: timeout, refused/malformed receipt, tool retrieval, incomplete turn, configuration preflight or transport failure. |

Exit codes: `0` received, `2` not observed, `3` inconclusive, `1` command/preflight error. The live timeout defaults to 120 seconds; set `--timeout-seconds` between 10 and 600. No failed model request is retried automatically.

A correct answer after a file-read tool call is **not** accepted as startup receipt evidence. We also require the client to report the requested model, reasoning effort and read-only policy before starting the turn. The report records that client-resolved model; it is not an independent audit of the provider's internal routing.

An exact marker is evidence about that marker in that response. It does not establish that the agent follows the whole file, retains durable memory or is secure.

## Try a disposable demonstration first

```sh
node examples/override.mjs --out ../relay-demo --live
```

This makes **four model calls** in one newly created Git project: normal `AGENTS.md`, a same-directory override, removal of that override, and no project guidance. Every case gets fresh random values and a fresh session. It writes the reports and comparisons under your new output directory, and stops if a run is inconclusive. This is an authored reproduction of documented file selection behavior, not a new bug or evidence that other people use this tool.

## Check after a change

Generate a fresh challenge, **replace your previous diagnostic block** with the new block in the same instruction path, and run to another new output directory. Use the same marker names so the reports are comparable. Record what you changed, such as the client version or an override file.

```sh
node cli.mjs prepare --out ../relay-after
# Replace only your previous diagnostic block, then:
node cli.mjs run \
  --project /path/to/your-project \
  --challenge ../relay-after/challenge.json \
  --out ../relay-result-after \
  --live
node cli.mjs compare \
  --before ../relay-result-before/report.json \
  --after ../relay-result-after/report.json
```

Comparison reports `CHANGED`, `UNCHANGED` or `INCONCLUSIVE` per marker, plus changes in client/model/effort/tool version. It does not establish causality. Keep the instruction path and other conditions comparable.

## Why not just check whether the file exists?

A static checker can validate files and their scopes. This check asks whether a new agent session can **return a value delivered through the selected path**. For example, Codex documents that one guidance file is selected per directory, preferring `AGENTS.override.md` over `AGENTS.md`. Putting different markers in those two files lets you observe the effect without treating that documented behavior as a newly discovered bug. [Codex guidance discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance)

The same result may already be sufficient in your existing tooling. This project is useful when you need a small repeatable receipt check, particularly before and after a change; it is not a replacement memory engine or a general agent benchmark.

## Data and execution boundaries

- `prepare`, `compare` and the test suite run offline. Only `run --live` starts Codex.
- Codex uses its existing authentication. Its normal startup can contact OpenAI and write its own local state. Project guidance is model input: use a project whose guidance you are authorized to send.
- The adapter reads effective configuration through Codex's local stdio API, uses only MCP identifiers to disable those servers, then reads the restrictions back before creating a fresh ephemeral thread. It never calls MCP list/auth-status or reads credential files directly.
- Shell, Apps, plugin, browser, memory and subagent features are restricted at server startup. Hooks are disabled for this run. Core tools can remain available in Codex; observed tool activity makes the check inconclusive. This is not a claim that every possible tool is unavailable.
- No global configuration changes, telemetry, uploads or automatic repair. Each live run owns its ephemeral app-server process group and attempts to terminate it. If cleanup cannot be confirmed within the bounded wait, the result is `INCONCLUSIVE` with `cleanup_confirmed: false`; it is not automatically retried.
- `report.json` excludes the raw model reply, marker value, project path, configuration bodies and logs. It contains random challenge identifiers, marker hashes, observation states, versions, timing and diagnostic codes. Review it before sharing.
- The report is not cryptographically attested; a self-reported run is not an independently verified user study. Operator demonstrations and external adoption are counted separately.

## Development

```sh
npm test
```

The suite covers exact matching, stale/wrong values, challenge leakage, ordered turn completion, tool contamination, transport restrictions and comparison consistency. No model call is made by the tests. MIT license.
