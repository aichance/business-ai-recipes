# Did Codex apply that project setting?

An `AGENTS.md` file and a nearby `.codex/config.toml` can both exist while Codex uses a different effective instruction budget. Check the running client's selection before trying to explain a missing instruction.

These are **operator measurements**, recorded on October 24, 2026 JST with unchanged [Agent Relay Check v0.1.2](https://github.com/aichance/business-ai-recipes/releases/tag/agent-relay-check-v0.1.2), macOS and stable Codex CLI0.163.0. No external developer execution or model receipt is claimed.

## The same setting in two project contexts

Each test used this synthetic, 33-byte ordinary `AGENTS.md`:

```md
# Trial guidance
Use two spaces.
```

The added leaf configuration contained only:

```toml
project_doc_max_bytes = 0
```

| Observation | New standalone repository | Leaf inside an existing project, without a nested `.git` |
|---|---:|---:|
| Effective project budget before adding the setting | 65,536 bytes | 65,536 bytes |
| Effective project budget after adding the setting | 65,536 bytes | 0 bytes |
| Native project source paths, before → after | 1 → 1 | 2 → 0 |
| Synthetic leaf `AGENTS.md` natively listed, before → after | true → true | true → false |
| Model turns requested | 0 | 0 |
| Cleanup confirmed | yes | yes |

65,536 was this environment's effective value, **not a claimed default**. The two initial project paths in the existing-project case included inherited guidance. A separate global source is excluded from these project-path counts.

The first case did **not** reproduce a budget change. A follow-up Codex `config/read` observation showed the project layer with its zero value and a disabled reason present; the effective value came from the user layer. We did not change trust or global settings to force that layer on. The second case used a new leaf inside an existing project and observed the effective budget and native selection change together. The disabled reason's presence alone does not identify its cause.

These are four common-CLI `inspect` invocations plus one adapter-level configuration observation, all without a model turn. Each `inspect` result was `INSPECTED`; all owned processes closed. The temporary configuration files were then renamed out of their active `config.toml` paths. No global configuration, authentication or trust settings were changed.

## Check your own startup directory

Download and extract the [unchanged v0.1.2 ZIP](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.2.zip) ([SHA-256](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.2.zip.sha256)). From its `agent-relay-check` directory:

```sh
node cli.mjs inspect --project "/absolute/path/to/your project/working-directory"
```

Use the same startup directory before and after a settings change. Compare `estimate.effective_project_doc_max_bytes`, the native project source paths and the relevant row's `native_listed`. The command observes your current settings; it does not apply the zero-budget fixture above or repair configuration.

Node22+ and installed stable Codex0.163.0 are needed for the pinned byte estimate. Other versions, uncertain configuration provenance, changed files or failed cleanup remain `INCONCLUSIVE`. This initializes Codex, which may communicate and write its normal metadata, but requests no model answer or model turn. Use project guidance you are authorized to load, and review reports locally rather than sharing private paths or instruction contents.

Native path membership can include a partial file. Byte and skip fields are separate local estimates. Neither observation proves marker receipt or instruction compliance. For a separate marker-receipt observation, the [one-call marker check](https://github.com/aichance/business-ai-recipes/blob/agent-relay-check-v0.1.2/tools/agent-relay-check/README.md#try-your-own-project) uses an authenticated Codex CLI0.163.0+, existing gpt-6.1-sol/MAX access and quota. Authenticated native Windows receipt remains unverified.

The lesson from these two controls is to record the **effective setting and selected paths**, along with the configuration edit. File presence alone left the first case unexplained. This is one local startup environment, not a general result for other CLI versions or clients.
