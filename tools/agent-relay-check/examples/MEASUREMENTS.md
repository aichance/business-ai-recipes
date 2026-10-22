# A real Codex run of the authored override demonstration

Measured on 2026-10-22 using the fresh-unpacked v0.1.0 code, macOS, Node 22.23.4 and Codex CLI 0.163.0. The client reported `gpt-6.1-sol` and `max` for all four sessions. Each run used a fresh challenge and session in the **same project directory**. This is our controlled demonstration, not independent adoption or a newly discovered Codex defect.

| Project guidance at startup | `base_only` | `override_only` | Duration |
| --- | --- | --- | ---: |
| `AGENTS.md` only | RECEIVED | NOT_OBSERVED | 11.458 s |
| `AGENTS.md` plus `AGENTS.override.md` | NOT_OBSERVED | RECEIVED | 18.032 s |
| Override removed | RECEIVED | NOT_OBSERVED | 18.144 s |
| Both project files removed | NOT_OBSERVED | NOT_OBSERVED | 12.884 s |

All four runs completed, observed zero tool calls and confirmed cleanup. The expected values were supplied only through the selected guidance files, never through the question or schema. Hooks and external tool integrations were disabled for the diagnostic. Other guidance settings remained in effect.

[Machine-readable summary and comparisons](override-results.json) record the observations. To reproduce the authored cases with your own Codex account:

```sh
node examples/override.mjs --out ../relay-demo --live
```

This makes four model calls and consumes your existing Codex quota or billing. Each result is an observation, not a guarantee of repeatability or general instruction compliance. A missing marker does not prove that a file was never loaded. For a useful diagnosis, [place a fresh marker in your own project's intended instruction path](../README.md#try-your-own-project), then repeat after the actual configuration change you are investigating.
