# Native source inspection: operator controls

## Tool0.1.3: Codex0.163.0 and0.164.0 controls, 2026-10-24

The common `inspect` entry was run on macOS / Node22.23.4 against each exact official stable CLI. Version0.164.0 was installed under a disposable local prefix; the normal0.163.0 installation and authentication were not replaced. These are operator controls, **not independent external adoption**.

Each CLI passed all five cases below with `INSPECTED`. Reports identify the actual loader (`local-snapshot-and-rust-v0.163.0-loader` or `local-snapshot-and-rust-v0.164.0-loader`). Across the ten checks, all20 owned app servers closed, the synthetic configuration stayed byte-identical in every check, and zero model turns were requested. Requested/resolved initialization settings were gpt-6.1-sol/MAX. Receipt and compliance stayed `NOT_TESTED`.

| Case,128B project budget unless noted | Native project paths, both CLIs | Separate local estimate, both CLIs |
|---|---|---|
| parent40B, child60B | parent and child | both FULL |
| parent40B, child200B | parent and child | child TRUNCATED at88B |
| parent128B, child60B | parent only | child SKIPPED_BUDGET |
| parent40B, empty child override, child60B | parent only | override empty; child SHADOWED |
| zero budget, parent40B, child60B | none | both SKIPPED_BUDGET |

Before the change, tool0.1.2 with CLI0.164.0 completed native startup/cleanup but returned `INCONCLUSIVE / source_version_unverified`; it supplied no supported byte estimate. Tool0.1.3 adds only the reviewed exact stable version, while future, alpha and custom-version builds remain inconclusive.

The official [0.163 loader](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/agents_md.rs) and [0.164 loader](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/core/src/agents_md.rs) are identical. The global-guidance module and root-marker configuration helper also matched, as did the complete ancestor-marker search helper ([0.163](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/file-system/src/find_up.rs), [0.164](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/file-system/src/find_up.rs), Git blob `a5a071d2843ccd19f11a73aed3af54e676b9e876`). Other startup/configuration/filesystem code did change; this is not a claim that the full runtimes are identical. The real-CLI checks above test the supported local route separately.

## Historical tool0.1.2 controls

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
