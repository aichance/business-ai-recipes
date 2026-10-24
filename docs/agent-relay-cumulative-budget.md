# Two files below 32 KiB can still share one Codex budget

This reproducible experiment compares **different scopes**: a static per-file limit with a startup-specific root-to-directory estimate. Agent Relay Check v0.1.3, official stable Codex0.164.0 and dropped commit `06536a1ee332f14073df87fdd0a628a61c6ebf5c` are fixed. The v0.1.3 source, release and ZIP are unchanged.

**Candidate: comparison CI has not yet been run.** The table below is the acceptance expectation, not a claimed measurement. Replace this notice only after the public candidate's actual comparison has completed.

| Authored ASCII fixture, project budget32,768B | Expected dropped `--target codex --ci` | Expected native project paths | Expected separate local byte estimate |
|---|---:|---|---|
| Root24,000B, startup at root | 0 | root | root FULL24,000B |
| Root24,000B + child18,000B, startup at child | 0 | root and child | root FULL24,000B; child TRUNCATED8,768B |
| Root42,000B, startup at root | 1 | root | root TRUNCATED32,768B |

The single oversized file is a positive control for dropped's normal truncation detection. The nested example tests something its per-file loop does not compute: the remaining budget for a specific startup directory. A zero static exit does not establish that the child is fully available in that startup. Conversely, native membership includes partial sources and is not a byte measurement.

The pinned [dropped loop](https://github.com/phrypy/dropped/blob/06536a1ee332f14073df87fdd0a628a61c6ebf5c/main.go) calls the analyzer once for each discovered file with the same limit. Its [JSON renderer](https://github.com/phrypy/dropped/blob/06536a1ee332f14073df87fdd0a628a61c6ebf5c/internal/render/json.go) reports those individual results. The separate Relay estimate follows the [Codex0.164 loader](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/core/src/agents_md.rs) for the observed effective configuration and checks selected paths against the native response.

## Reproduce

Review [the script](../experiments/relay-cumulative-budget/check.py), [the workflow](../.github/workflows/relay-cumulative-budget.yml) and the [unchanged v0.1.3 source map](agent-relay-source-review.md) before running third-party code. The workflow builds the fixed public Go module through the checksum-verified Go registry, runs its tests and vet checks, installs official Codex0.164.0 in a temporary prefix and runs all three cases. It uses no account credentials or model turns.

For a reviewed local build, Linux/macOS, Python3, Node22+ and an already installed official stable Codex0.164.0:

```sh
# From a checkout of this repository. Use an existing scratch parent.
python3 -B experiments/relay-cumulative-budget/check.py \
  --scratch-parent "/path/to/existing/scratch" \
  --codex-bin-dir "/path/to/existing/codex/bin" \
  --dropped "/path/to/reviewed/dropped"
```

The dropped binary must be built from the fixed commit with `-ldflags '-X main.version=06536a1ee332f14073df87fdd0a628a61c6ebf5c'`; the workflow shows the complete build. If Codex is already on PATH, omit `--codex-bin-dir`. When Go/dropped is unavailable, `--native-only` instead of `--dropped PATH` explicitly yields a **partial** native-only check and cannot confirm the comparison.

Only new `relay-cumulative-*` synthetic projects and diagnostic configuration directories are created below the chosen scratch parent. Your normal configuration, authentication, instruction files and parent environment are not edited or copied. The script leaves its files for review, reports sanitized JSON, stops on inconclusive results and never retries. Codex initialization can communicate and write normal metadata even with zero model turns.

## What this does not establish

- The local byte estimate is not a native API byte field, full-content receipt or proof of instruction adherence.
- No authenticated marker turn is requested. Both receipt and compliance remain `NOT_TESTED`.
- These are operator-authored synthetic controls, not an external developer's trial, reuse or endorsement.
- The result is specific to the fixed versions, budget and startup directories; wrappers, Cloud/IDE sessions, compaction and other CLI builds are outside scope.

For a real project, start with the unchanged common `node cli.mjs inspect --project "/path/to/shareable/project"` entry described in the [quick start](../tools/agent-relay-check/README.md#inspect-your-current-instruction-budget-first). Actual marker receipt uses its separate explicitly live Sol6.1/MAX workflow.
