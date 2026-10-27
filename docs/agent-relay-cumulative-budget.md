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
