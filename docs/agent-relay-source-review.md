# Review Agent Relay Check before running it

This map describes **v0.1.3**, not a moving checkout. It helps you review the code; it is not an independent security approval. Follow your environment's review policy. You can continue using Codex's native logs without running this tool.

## Start with the pinned code

- [Source at f8c55fef](https://github.com/aichance/business-ai-recipes/tree/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check).
- [Release ZIP](https://github.com/aichance/business-ai-recipes/releases/download/agent-relay-check-v0.1.3/agent-relay-check-v0.1.3.zip): **50,841 bytes, 23 files**, one `agent-relay-check/` directory.
- ZIP SHA256: `a2cce93178144ee535b1637ffc23a8e2592d2e4a863d058785a145ea7adf7a0c`.

Check the ZIP with your existing hash tool, for example `shasum -a 256` or PowerShell `Get-FileHash -Algorithm SHA256`. Matching a hash establishes byte identity, not safety. There are no npm dependencies or install scripts in [package.json](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/package.json); the ZIP needs Node22+ and an existing Codex CLI. No automatic installation, login or upgrade is performed.

| Read first | What to inspect |
| --- | --- |
| [cli.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/cli.mjs#L69) | Command dispatch, path checks and explicit writes. |
| [lib/inspect.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/lib/inspect.mjs) | Native source inspection and configuration readback. |
| [lib/inventory.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/lib/inventory.mjs) | Ancestor root discovery, bounded instruction-file reads and local byte estimates. |
| [lib/codex.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/lib/codex.mjs#L16) | Requested feature restrictions, fixed model/effort, optional live turn. |
| [lib/rpc.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/lib/rpc.mjs) | Stdio messages, in-memory buffers, timeouts and approval-request rejection. |
| [lib/process.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/lib/process.mjs) | Existing executable resolution and descendant cleanup. Resolution does not attest the binary. |

## Commands and side effects

| Command | Reads / starts | Tool-created files |
| --- | --- | --- |
| `inspect --project DIR` | Directory metadata for root discovery, bounded candidate instruction prefixes, Codex configuration and native source paths. Normal successful path: one `--version` process and two `app-server --stdio` processes. | JSON on stdout; no report file created by the wrapper. |
| `prepare --out NEW_DIR` | Generates fresh synthetic marker values; no Codex process. | New directory: `challenge.json`, `instruction.md`, `question.txt`, `receipt-schema.json`. |
| `run --live ...` | Existing Codex with one requested model turn, using a challenge kept outside the tested project. | New output directory outside the tested project, containing `report.json`. |
| `compare --before A --after B` | The two specified JSON reports; no Codex process. | Comparison on stdout. |

`inspect` requests `initialize`, `config/read`, then restarts with restrictions and requests `initialize`, `config/read`, `thread/start`, `config/read`. It sends **no `turn/start`**. Unexpected turn notifications make the result inconclusive. Zero requested model turns does **not** mean no communication or disk activity: the child is your normal installed Codex, with its normal environment, settings, authentication and local metadata behavior. Its startup may contact configured services and write metadata.

The Node wrapper runs with your host permissions. The child thread's requested `read-only` sandbox is **not a filesystem sandbox around Node**. Root discovery checks ancestor marker metadata, potentially above the target project. Instruction inventory reads bounded prefixes along the discovered root-to-startup-directory chain; it does not open unknown outside-source contents reported by Codex.

Diagnostic sessions request disabled tools/features, hooks and configured MCP servers, `approvalPolicy: never`, ephemeral threads, and `gpt-6.1-sol` / `max` without provider model fallback; relevant settings are read back. These controls do not certify the installed client or every possible internal behavior. POSIX cleanup targets the owned process group; Windows uses `taskkill /T /F` on the live owned process. Failed or unconfirmed cleanup remains inconclusive; escaped processes are not guaranteed to be contained.

Optional marker receipt: review [protocol.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/lib/protocol.mjs) and [observation.mjs](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/lib/observation.mjs). You manually append and later remove only the generated block. The separate [override demonstration](https://github.com/aichance/business-ai-recipes/blob/f8c55fefb261e5c4b95f6c559603a92f1d38bfc3/tools/agent-relay-check/examples/override.mjs) creates its own disposable Git project, writes/removes its own synthetic guidance and makes **four** model calls, saving case reports and a summary. It is not the zero-turn inspection command.

Native listed paths, local byte estimates, marker receipt and instruction compliance are different claims. The byte estimator is pinned to exact stable Codex0.163.0/0.164.0; uncertain versions, configuration, files or cleanup remain `INCONCLUSIVE`. A listed file need not be fully included; a returned marker does not prove full-file receipt or compliance.

## Exact archive inventory

The following hashes were compared against all 23 files in the published ZIP. They do not extend the review scope to other versions.

<details>
<summary>23 files: byte size and SHA256</summary>

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `AGENTS.md` | 2233 | `f0802ba759bb8b91566062a9861261be4727ca09db2b78886b2d0daca28a7d56` |
| `LICENSE` | 1072 | `9ba23e6fbbebcfd775dfab81773646a4f79e7f2204221feed93bed73f7bc506c` |
| `README.md` | 14487 | `e089e5a1745ee4dc563359883f6f65625c7e001540d116d0f24cd78cb555bc93` |
| `cli.mjs` | 7886 | `8a90244829c18ba3250d16878398d6f8ccdb053e483900ad4ef17bb294f897d0` |
| `examples/MEASUREMENTS.md` | 1744 | `633dc47bc58c3c7c5fc2ecdb458a1d3894c0b2fa40d249d38a7778ddb8b7aac5` |
| `examples/NATIVE-INSPECTION.md` | 5867 | `c6819191e591edfaf3b0987f57571af4805b656c4c5f997f2402cba39bd6baa8` |
| `examples/override-results.json` | 5521 | `92fe2daf49f0a57258ff90797b2cdfd6e6fae24c8df2d845a0ef0c91be7f0b5d` |
| `examples/override.mjs` | 3654 | `4974d5dff6ca7d06c4919385cbbacf6d7b3e9f6265777815a12f3d7bfbe83a78` |
| `lib/codex.mjs` | 9946 | `1dfe8349d108a9553ecd28bdb5fce06dc78bf6caeb256bcf1c565167452e5bcd` |
| `lib/inspect.mjs` | 11331 | `4dc0727d19ff1c115535c829bf1b14f28ba12b1c7990ef3ec7462df8e9a7fd8c` |
| `lib/inventory.mjs` | 10258 | `f5bb4c85550cc6ab476aa66a7d1372f88aa2d3f799079163be42f676ca97eb8b` |
| `lib/observation.mjs` | 1842 | `d58c45e9942c0001d5349aa9fe4b10dbde030059f01c66cd862c3686c5a194ee` |
| `lib/process.mjs` | 3521 | `aa72157232aaf91c29031524117ed55b1f6d2744319cf869acb52a97f8e9c5d0` |
| `lib/protocol.mjs` | 9463 | `ea324c40dfab20439ed69cfcc17ce3440a247c1ceed8a78c90d3086dbd349afd` |
| `lib/rpc.mjs` | 6337 | `144b0cd12d09de56217f01edb440f35ad64a46600eaa394048be4b3eaa8bbe42` |
| `package.json` | 468 | `c4c682e3ef8e65f236fc664f48b2656e9f5d4f9f06ffab61dfbad2e2d4346196` |
| `test/adapter.test.mjs` | 3696 | `1f11c4f8af5f0be00f8d31084535f0805a07d7481a96be54a685c10ad17729c3` |
| `test/inspect.test.mjs` | 12041 | `b88c51192d7235100b3b40bbccbf5f5d18f8d4ba6cd262a467f2287f0531b394` |
| `test/installed-cli.test.mjs` | 4808 | `2f6e3722f02b74e056c5a0aec9e91b99dc9d6f773dd5b17037b9180efbd8d087` |
| `test/inventory.test.mjs` | 10543 | `549b07fcbb949ab98039147f67ecef919e12ff988fa45e412e1ddb02a14d24b2` |
| `test/process.test.mjs` | 6516 | `a5e9fa26d8f8e78b023e04483fb3d694e2a1992c26bb51753776e217f6fe48e0` |
| `test/protocol.test.mjs` | 5855 | `15ddef4d37620242b85d53e2ddaccbfe3b4c37618adf1170e9817d18e68bbaa2` |
| `test/rpc.test.mjs` | 2319 | `19ea896b934163750b6377bf8eaddaf02d3122a89c5950262e55f360ed7fee9c` |

</details>
