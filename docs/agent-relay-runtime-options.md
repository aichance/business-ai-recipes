# v0.1.4: explicit model selection for the marker check

An external Windows tester completed native inspection with v0.1.2, but its live marker run was inconclusive. The reporter cited unavailable model authentication/quota. That report does not diagnose which preflight or provider operation failed.

v0.1.4 removes the tool's fixed-model requirement for **explicitly selected end-user live runs**. The defaults remain gpt-6.1-sol/MAX. There is no model discovery, automatic fallback, account change, sign-in or retry. This option cannot grant access or guarantee that the reported failure is fixed.

From the extracted `agent-relay-check` directory, use a new output path and a project whose guidance you may send to your already configured provider:

```sh
node cli.mjs run --project /path/to/your-project \
  --challenge ../relay-before/challenge.json --out ../relay-result-before \
  --model gpt-6.1-sol --effort max --live
```

This example explicitly selects the default. To choose other settings, supply the exact model and effort identifiers from an existing Codex configuration you already use. Each omitted flag keeps its own default. The flags belong only to `run`; `inspect`, `prepare`, `compare` and the four-call demo do not accept them.

| Boundary | Behavior |
| --- | --- |
| Syntax | Reject invalid/empty identifiers before file creation or launching Codex. No trimming or silent coercion. |
| Requested settings | Same explicit values in restricted startup, thread, turn and report. |
| Resolved settings | Exact model/effort equality, read-only policy and no approvals required before inference. A mismatch is inconclusive, not a receipt. |
| Model fallback | `allowProviderModelFallback: false`; failed requests are not retried. |
| Privacy | No expected marker in the question/schema/arguments. Raw provider errors and mismatched model identifiers are excluded from the report. |
| Report comparison | Requested/resolved model, effort, client and tool versions are recorded as runtime changes. A difference is not proof of causality. |

## Review the release

- [Source at the v0.1.4 release tag](https://github.com/aichance/business-ai-recipes/tree/agent-relay-check-v0.1.4/tools/agent-relay-check).
- [ZIP](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.4.zip) and [SHA-256](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.4.zip.sha256). The latest ZIP is checked byte-for-byte against every file in `tools/agent-relay-check/` by `verify.py`.
- Read `cli.mjs` for command-specific validation and paths, `lib/codex.mjs` for selectors and the bounded adapter, and `test/runtime.test.mjs` for the offline stdio controls. Existing process/RPC/observation/inventory boundaries are preserved.
- The [v0.1.3 source map and hash](agent-relay-source-review.md), older ZIPs, historical measurements and the CI consumer pinned to v0.1.3 are preserved unchanged.

Offline fixtures cover unchanged defaults, explicit selection, exact settings propagation, coerced model/effort stopping before inference, provider-error redaction and no retries. Fixture model identifiers are synthetic data; no alternate model is called. Live operator verification is restricted to **gpt-6.1-sol/MAX**. Other models/efforts are experimental: their availability, structured-output compatibility, provider routing and receipt behavior are **not live-verified**. A client's resolved metadata does not independently attest a provider's internal routing.

Native inspection remains separate: its supported byte estimates are pinned to stable Codex0.163.0/0.164.0, and it requests no model turn. A marker match concerns that marker in that response, not general instruction compliance, durable memory, security or independent adoption.
