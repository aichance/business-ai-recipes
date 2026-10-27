# One more parent byte can remove the child from Codex's startup list

This reproducible experiment compares **different scopes**: a static per-file limit with native startup path selection and a separate root-to-directory byte estimate. The current script uses unchanged common Agent Relay Check **v0.1.4**, official stable Codex **0.164.0**, a **32,768 B** project budget, and (for full comparison mode) dropped commit `06536a1ee332f14073df87fdd0a628a61c6ebf5c`. Earlier tool archives stay unchanged.

## Current native boundary: same child, one more parent byte

**Measured October 27, 2026 at 13:55 JST:** five native-only controls completed on macOS with Node 22.23.4 and Codex 0.164.0. [Complete sanitized result JSON](../experiments/relay-cumulative-budget/native-results-2026-10-27.json) records `PARTIAL_NATIVE_ONLY`: dropped was **not run locally**. These are operator-authored ASCII fixtures, not external adoption.

| Authored fixture; startup directory | Actual native project paths | Separate local byte estimate |
|---|---|---|
| Root 24,000 B; root | root | root FULL 24,000 B |
| Root 24,000 B + child 18,000 B; child | root and child | root FULL 24,000 B; child TRUNCATED 8,768 B |
| Root 42,000 B; root | root | root TRUNCATED 32,768 B |
| **Root 32,767 B + child 60 B; child** | **root and child** | root FULL 32,767 B; child TRUNCATED 1 B |
| **Root 32,768 B + the same child 60 B; child** | **root only** | root FULL 32,768 B; child SKIPPED_BUDGET 0 B |

The last pair changes only the parent's authored byte length; the 60 B child has the same SHA-256 in both cases. The child's disappearance is an actual native path observation. The 1 B / 0 B ranges are separate local estimates, **not** byte fields returned by Codex. Native membership can include a partial source; it does not prove full delivery or adherence. Both files remain within an individual 32,768 B limit, including the parent exactly at the boundary.

All five inspections returned `INSPECTED`, requested zero model turns and confirmed all ten owned servers closed. Synthetic instruction/configuration hashes stayed unchanged; no authentication was copied. Requested/resolved initialization remained gpt-6.1-sol/MAX. This is not a live marker receipt.

The runner previously required v0.1.3 while the current checkout contains v0.1.4, causing `INCONCLUSIVE/common_version` before inspection. That reproduction guard now explicitly matches **v0.1.4**; it does not accept arbitrary future versions. The two boundary controls and offline rejection checks run in the existing comparison workflow. The local JSON above remains native-only evidence even when a later CI run performs the full static comparison.

## Public-source copy: same native paths, different child budget

**Measured October 27, 2026 at 21:08 JST:** a local copy of two pinned public guidance files from [rat-stack](https://github.com/joelhooks/rat-stack/tree/de67d8c670cb7e10c83ef5e7a7cf7ff886ebbb2f) was inspected with unchanged common **v0.1.4**, macOS / Node22.23.4 / stable Codex0.164.0. This is an operator source-copy experiment, **not an execution of rat-stack, a reproduction of its author's environment, or independent adoption**. The [upstream issue](https://github.com/joelhooks/rat-stack/issues/145) describes a startup truncation concern; our [measured report](https://github.com/joelhooks/rat-stack/issues/145#issuecomment-6441594393) records this narrower local test.

The temporary fixture contained only `AGENTS.md`, `apps/web/src/AGENTS.md` and a synthetic `.git` boundary. Startup was `apps/web/src`. A separate temporary Codex configuration set the project budget first to 32,768 B, then to 40,960 B. No credentials were copied, and the normal configuration and upstream repository were not changed. The two public files remained byte-identical. Codex startup initialized with gpt-6.1-sol/MAX but requested **zero model turns**; no application code or guidance commands were executed.

| Effective project budget | Actual native project paths | Separate local estimate: parent | Separate local estimate: child |
|---|---|---|---|
| 32,768 B (32 KiB) | `AGENTS.md`, `apps/web/src/AGENTS.md` | FULL 32,062 B | **TRUNCATED 706 / 7,679 B** |
| 40,960 B (40 KiB) | the same two paths | FULL 32,062 B | **FULL 7,679 / 7,679 B** |

Both checks returned `INSPECTED`; each started and closed two owned native servers with cleanup confirmed. The combined file size is 39,741 B. The native response lists the child in **both** cases; the 706 B and 7,679 B values come from the separate stable-snapshot estimate pinned to the Codex0.164.0 loader. They are not native full-content telemetry. Receipt and instruction compliance remain `NOT_TESTED`. The 40 KiB condition is a comparison, **not a recommendation to enlarge a real project's configuration or evidence of cost savings**.

### Pinned input identity and sanitized measurement

Source commit: `de67d8c670cb7e10c83ef5e7a7cf7ff886ebbb2f`. The source Markdown bodies and local configuration are deliberately not republished here.

| Public source | Bytes | Git blob | SHA-256 |
|---|---:|---|---|
| [Root AGENTS.md](https://github.com/joelhooks/rat-stack/blob/de67d8c670cb7e10c83ef5e7a7cf7ff886ebbb2f/AGENTS.md) | 32,062 | `8b6ca095447175dbe62fd41b81b40d36b7d3915c` | `d1eaada6729faf887e59bac0276aadd76f2d4f58511b6c2fc81a8e1e471c7352` |
| [Child AGENTS.md](https://github.com/joelhooks/rat-stack/blob/de67d8c670cb7e10c83ef5e7a7cf7ff886ebbb2f/apps/web/src/AGENTS.md) | 7,679 | `6f8311300bbd273bda3ac2a1dd79bc810926de4d` | `5e4465ee8f49cd3a261bb68d96e5db5653c902361ee7ea1cb35c0aa40606baea` |

The following is a compact transcription of the two operator reports, not a full native API response. Single-run timings are omitted because this was not a performance experiment.

```json
{
  "type": "operator_public_source_copy",
  "measured_at": "2026-10-27T12:08:40.503593+00:00",
  "source_ref": "de67d8c670cb7e10c83ef5e7a7cf7ff886ebbb2f",
  "tool_version": "0.1.4",
  "archive_sha256": "d21cf2f75c069b244b212f8988085d952b2159e4e07842ed806235c52998dcda",
  "runtime": {"os": "macOS", "node": "22.23.4", "codex": "0.164.0"},
  "startup_directory": "apps/web/src",
  "local_estimate_basis": "local-snapshot-and-rust-v0.164.0-loader",
  "conditions": [
    {
      "effective_project_doc_max_bytes": 32768,
      "status": "INSPECTED",
      "native_project_sources": ["AGENTS.md", "apps/web/src/AGENTS.md"],
      "local_estimated_examined_bytes": [32062, 706],
      "local_estimated_status": ["FULL", "TRUNCATED"],
      "model_turn_requests": 0,
      "native_servers_started": 2,
      "native_servers_closed": 2,
      "cleanup_confirmed": true,
      "receipt": "NOT_TESTED"
    },
    {
      "effective_project_doc_max_bytes": 40960,
      "status": "INSPECTED",
      "native_project_sources": ["AGENTS.md", "apps/web/src/AGENTS.md"],
      "local_estimated_examined_bytes": [32062, 7679],
      "local_estimated_status": ["FULL", "FULL"],
      "model_turn_requests": 0,
      "native_servers_started": 2,
      "native_servers_closed": 2,
      "cleanup_confirmed": true,
      "receipt": "NOT_TESTED"
    }
  ],
  "input_files_unchanged": true,
  "compliance": "NOT_TESTED"
}
```

For a comparable source-copy experiment, review and obtain the two **pinned** public files, verify both hashes above, keep their relative paths in a new temporary fixture with a `.git` boundary, and start at `apps/web/src`. Use an isolated temporary Codex configuration for the two budgets; do not alter your normal configuration or execute the upstream app. Run the common `node cli.mjs inspect --project "/absolute/path/to/fixture/apps/web/src"` once per budget. Confirm the effective budget, stable CLI version, source identities and cleanup in each report; a mismatch is not this comparison. Codex initialization can communicate and write normal metadata even without a model turn. These steps describe the measured setup; the synthetic runner below does not download or execute this public-source case.

For your own project, the [unchanged v0.1.4 quick start](../tools/agent-relay-check/README.md#inspect-your-current-instruction-budget-first) inspects the existing startup configuration without editing it. A separate explicit live marker check is needed to observe marker receipt; neither this source copy nor a successful inspection proves that all instructions are followed.

## Historical full static/native comparison

**Measured October 25, 2026 at 00:54 JST, using v0.1.3:** the original three controls completed on GitHub's Ubuntu 24.04 runner with Node 22.23.3, Python 3.12 and Go 1.26.4. The [actual comparison run and complete JSON](https://github.com/aichance/business-ai-recipes/actions/runs/40109068535) record `COMPARISON_CONFIRMED`; the pinned Go module's tests and vet checks also passed. These historical results do not include the new boundary pair and are not relabeled as v0.1.4.

| Authored ASCII fixture, project budget 32,768 B | Actual dropped `--target codex --ci` exit | Actual native project paths | Separate local byte estimate |
|---|---:|---|---|
| Root 24,000 B, startup at root | 0 | root | root FULL 24,000 B |
| Root 24,000 B + child 18,000 B, startup at child | 0 | root and child | root FULL 24,000 B; child TRUNCATED 8,768 B |
| Root 42,000 B, startup at root | 1 | root | root TRUNCATED 32,768 B |

The single oversized file is a positive control for dropped's normal truncation detection. The nested example tests something its per-file loop does not compute: the remaining budget for a specific startup directory. A zero static exit does not establish that the child is fully available in that startup. Conversely, native membership includes partial sources and is not a byte measurement.

All three inspections returned `INSPECTED`, requested zero model turns and confirmed both owned servers closed, six in total. Synthetic inputs and diagnostic configuration hashes stayed unchanged; no authentication was copied. The nested static result covered both expected files, reported zero truncated files, had no stderr warning and exited 0. Its two files each pass a per-file check while the separate cumulative estimate leaves only 8,768 B for the child. This is a difference in inspection scope, not evidence that dropped's per-file byte arithmetic is wrong.

The build used checksum-verified registry module `v0.1.2-0.20260617042836-06536a1ee332`, `h1:BlVDniZIn6nN71JYpOGf6Hyy4TM25he0QFANPZ0vmPA=`, with its origin hash checked against the full commit above. A separate local macOS/Node 22.23.4 native-only run matched the same path/estimate controls, but did not execute dropped and is not a second full comparison.

The pinned [dropped loop](https://github.com/phrypy/dropped/blob/06536a1ee332f14073df87fdd0a628a61c6ebf5c/main.go) calls the analyzer once for each discovered file with the same limit. Its [JSON renderer](https://github.com/phrypy/dropped/blob/06536a1ee332f14073df87fdd0a628a61c6ebf5c/internal/render/json.go) reports those individual results. The separate Relay estimate follows the [Codex0.164 loader](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/core/src/agents_md.rs) for the observed effective configuration and checks selected paths against the native response.

## Reproduce

Review [the script](../experiments/relay-cumulative-budget/check.py), [the workflow](../.github/workflows/relay-cumulative-budget.yml), the [current v0.1.4 change map](agent-relay-runtime-options.md) and the [earlier inspection source map](agent-relay-source-review.md) before running third-party code. The workflow builds the fixed public Go module through the checksum-verified Go registry, runs its tests and vet checks, installs official Codex 0.164.0 in a temporary prefix and runs **all five cases**. It uses no account credentials or model turns.

For a reviewed local build, Linux/macOS, Python 3, Node 22+ and an already installed official stable Codex 0.164.0:

```sh
# From a checkout of this repository. Use an existing scratch parent.
python3 -B experiments/relay-cumulative-budget/check.py \
  --scratch-parent "/path/to/existing/scratch" \
  --codex-bin-dir "/path/to/existing/codex/bin" \
  --dropped "/path/to/reviewed/dropped"
```

Offline report-contract checks require neither Codex nor Go:

```sh
python3 -B -m unittest discover -s experiments/relay-cumulative-budget -p 'test_*.py'
```

The dropped binary must be built from the fixed commit with `-ldflags '-X main.version=06536a1ee332f14073df87fdd0a628a61c6ebf5c'`; the workflow shows the complete build. If Codex is already on PATH, omit `--codex-bin-dir`. When Go/dropped is unavailable, `--native-only` instead of `--dropped PATH` explicitly yields a **partial** native-only check and cannot confirm the comparison.

Only new `relay-cumulative-*` synthetic projects and diagnostic configuration directories are created below the chosen scratch parent. Your normal configuration, authentication, instruction files and parent environment are not edited or copied. The script leaves its files for review, reports sanitized JSON, stops on inconclusive results and never retries. Codex initialization can communicate and write normal metadata even with zero model turns.

## What this does not establish

- The local byte estimate is not a native API byte field, full-content receipt or proof of instruction adherence.
- No authenticated marker turn is requested. Both receipt and compliance remain `NOT_TESTED`.
- These are operator-authored synthetic controls, not an external developer's trial, reuse or endorsement.
- The result is specific to the fixed versions, budget and startup directories; wrappers, Cloud/IDE sessions, compaction and other CLI builds are outside scope.

For a real project, start with the unchanged common `node cli.mjs inspect --project "/path/to/shareable/project"` entry described in the [quick start](../tools/agent-relay-check/README.md#inspect-your-current-instruction-budget-first). Actual marker receipt uses the separate explicitly live workflow; defaults remain Sol6.1/MAX, with v0.1.4's optional explicit existing runtime documented separately.
