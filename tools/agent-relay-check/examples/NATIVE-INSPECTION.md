# Native source inspection: operator controls

Candidate tool0.1.2, Codex CLI0.163.0, macOS, synthetic disposable local project. These are operator controls, **not independent external adoption**. Each case requested/resolved gpt-6.1-sol/MAX at thread initialization and made zero `turn/start` requests. It did not request a model response or verify model receipt.

The isolated Codex configuration sets `project_doc_max_bytes=128`. The root has a `.git` marker; startup is its `child` directory. File contents are repeated synthetic ASCII bytes. Every case used a fresh ephemeral thread through the common `node cli.mjs inspect --project DIRECTORY` entry. Both owned app-server trees closed successfully; the normal and isolated configuration file hashes were unchanged before/after the controls. This does not prove absence of other initialization metadata writes or network activity.

| Case | Files | Native project paths | Separate local estimate |
|---|---|---|---|
| All fit | parent40B, child60B | parent and child | both FULL |
| Partial child | parent40B, child200B | parent and child | parent FULL; child TRUNCATED at88B |
| Exhausted in parent | parent128B, child60B | parent only | child SKIPPED_BUDGET |
| Empty child override | parent40B, empty child override, child60B | parent only | override empty/whitespace; child shadowed |

Thus native membership does not distinguish full and partial child contents, nor establish why an absent child was excluded. Byte counts and skip reasons are estimates from the stable local snapshot and pinned loader, not extra native API fields. `INSPECTED` means this supported local estimate matched native paths, not that a model received or followed an instruction.

The estimator uses the configured root-to-CWD chain, filename priority and raw-byte budget from [the pinned loader](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/agents_md.rs). It preserves fallback filename whitespace and Rust whitespace behavior for file contents. Native paths come from [ThreadStartResponse](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs); only a [single local environment](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/exec-server/src/environment.rs) with matching startup directory is supported. Project-layer root-marker overrides are deliberately inconclusive because the loader excludes those layers for root selection. Unrecognized config layers, unknown external sources, changed or unreadable inputs, unconfirmed symlinks and bounded snapshot limits also prevent a successful estimate.

Reports omit guidance text, configuration bodies, home/absolute project paths and raw provider errors. Outside-root sources are counted without opening their contents; only names derived from the known user config layer are classified as global guidance. Review relative filenames before sharing a report. A newer or alpha CLI is not automatically treated as this pinned source version. Windows process/transport and the new native-inspection CI check must be read separately from authenticated live marker evidence.

To test actual receipt, append a fresh `prepare` diagnostic block to shareable guidance and use `run --live` with challenge/output outside your project. That separate command makes one existing model/quota call. `prepare`/`compare` are offline. Keep the same startup directory and record changes for a later comparison.
