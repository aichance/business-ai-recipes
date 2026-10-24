# Moving global Codex rules with dotfiles: what inspection can show

**A global `AGENTS.md` symlink can be counted by native inspection; that count does not prove which content reached the model.** These four synthetic controls use the unchanged Agent Relay Check **v0.1.3** archive on **macOS / Node22.23.4 / official stable Codex0.164.0**, observed October24,2026. They are operator measurements, not an external developer's setup or adoption.

## Measured result

Each project contained the same 30-byte ordinary `AGENTS.md`, with a 128-byte project budget. The diagnostic used its own temporary Codex configuration directory and synthetic global guidance. No authentication was copied and no model turn was requested. Both owned app servers closed in each inspection; the synthetic configuration stayed byte-identical.

| Synthetic global setup | Known target bytes, set by the fixture | `status` | `other_native_source_count` | Separate project byte estimate |
|---|---:|---|---:|---:|
| Ordinary global `AGENTS.md` | 26 | `INSPECTED` | 1 | 30 |
| Global `AGENTS.md` symlink to the same text | 26 | `INSPECTED` | 1 | 30 |
| Same symlink, target text replaced | 40 | `INSPECTED` | 1 | 30 |
| Global symlink points to a missing target | absent | `INSPECTED` | 0 | 30 |

The target-byte column describes the controlled fixture. It is **not** a global byte measurement returned by the tool. In this fixture, only the known user configuration directory could contribute the counted outside-project guidance.

All four checks reported `model_turn_requests: 0`, `cleanup_confirmed: true`, `receipt: NOT_TESTED` and `compliance: NOT_TESTED`. Requested and resolved initialization settings were `gpt-6.1-sol` / `max`; no inference was requested. Normal Codex startup can still communicate and write its usual metadata.

## How to interpret it

- **Regular file versus global symlink:** this exact global path was accepted in both controls. It is too broad to reject every global symlink because the project-file estimator rejects an unconfirmed project symlink.
- **Updating the target:** the count stayed one when the fixture changed from26 to40bytes. Inspection does not identify the global content version, its byte count, the target path or content stability.
- **Broken link:** the outside-project source count fell to zero while `INSPECTED` stayed unchanged. That status describes the supported local project estimate and native membership match. It does not assert that a required global instruction exists or was received. Compare the fields relevant to your workflow.

A tool that knows a user-config-layer `AGENTS.md` path can count it without opening its contents. An unknown outside-root path or uncertain project symlink can still be `INCONCLUSIVE`. These controls do not establish behavior on Windows, another CLI build, another configuration layer, or another machine.

## Try the common tool on your own project

Review the [v0.1.3 source and command effects](agent-relay-source-review.md), then download the unchanged [v0.1.3 ZIP](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.3.zip) and its [checksum](https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.3.zip.sha256). After extracting it and opening `agent-relay-check`:

```sh
node cli.mjs inspect --project "/absolute/path/to/your shareable project"
```

Node22+ and installed stable Codex0.163.0 or0.164.0 are needed for the current version-specific project estimate; the four global controls above were measured only on0.164.0. Keep before/after reports when migrating settings, and review the outside-project count separately from the project rows. Omit private paths and guidance when sharing results.

For actual marker receipt, use the separate [prepare → instruction block → run → compare workflow](../tools/agent-relay-check/README.md#try-your-own-project). It uses **one existing authenticated `gpt-6.1-sol`/MAX turn per observation** and sends the selected guidance through that existing account. Keep challenge/output outside the tested project, remove only your diagnostic block afterward, and do not automatically retry an inconclusive run. This is not proof of full guidance reception, rule compliance, or safe behavior; compaction and hook/MCP delivery are outside scope.

## Reproduce the four isolated controls

Use Python3, Node22+, an already installed official stable Codex0.164.0, the reviewed extracted v0.1.3 tool and an existing scratch parent directory. The following creates only a new `relay-global-guidance-*` directory under that parent. It does not edit your normal rules, configuration, authentication or parent environment. It leaves its synthetic files for inspection; it does not copy credentials or request a model turn. Normal Codex initialization can communicate/write metadata in the diagnostic profile.

Supply the tool directory and scratch parent as the first two arguments. If0.164.0 is already in an isolated installation, its existing bin directory can be an optional third argument; only the child PATH uses it. No installation, sign-in or model fallback occurs. Review the code before executing it.

```sh
python3 - "/path/to/extracted/agent-relay-check" "/path/to/existing/scratch-parent" <<'PY'
import hashlib, json, os, shutil, signal, subprocess, sys, tempfile
from pathlib import Path

tool = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_dir() or json.loads((tool / "package.json").read_text())["version"] != "0.1.3":
    raise SystemExit("Need an existing scratch parent and the reviewed v0.1.3 tool.")
# Optional third argument: an already installed Codex bin directory.
# This changes only the child environment, never the parent shell's PATH.
env = {k: os.environ[k] for k in ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"] if k in os.environ}
if len(sys.argv) > 3:
    env["PATH"] = str(Path(sys.argv[3]).resolve()) + os.pathsep + env["PATH"]
version = subprocess.run(["codex", "--version"], env=env, capture_output=True, text=True, timeout=15)
if version.returncode or version.stdout.strip() != "codex-cli 0.164.0":
    raise SystemExit("These controls require already installed stable Codex0.164.0; no automatic install.")
node = shutil.which("node", path=env["PATH"])
node_version = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10)
if node_version.returncode or int(node_version.stdout.strip()[1:].split(".")[0]) < 22:
    raise SystemExit("Node22+ is required.")
work = Path(tempfile.mkdtemp(prefix="relay-global-guidance-", dir=scratch))
project, profile, dotfiles = work / "project", work / "diagnostic-config", work / "dotfiles"
for directory in [project / ".git", profile, dotfiles]:
    directory.mkdir(parents=True)
(project / "AGENTS.md").write_bytes(b"PROJECT-GUIDANCE-FIXTURE-ONLY\n")
global_file, target = profile / "AGENTS.md", dotfiles / "AGENTS.md"
original = b"SYNTHETIC-GLOBAL-ORIGINAL\n"
updated = b"SYNTHETIC-GLOBAL-UPDATED-CONTENT-LONGER\n"
target.write_bytes(original)
config = profile / "config.toml"
config.write_text('model="gpt-6.1-sol"\nmodel_reasoning_effort="max"\nproject_doc_max_bytes=128\n[projects.' + json.dumps(str(project)) + ']\ntrust_level="trusted"\n')
config_hash = hashlib.sha256(config.read_bytes()).hexdigest()
# Documented application setting for these children only. No auth is copied.
env["CODEX_HOME"] = str(profile)
results = []
for name, expected_other in [("regular_global", 1), ("symlink_global", 1), ("updated_symlink_target", 1), ("broken_global_symlink", 0)]:
    if name == "regular_global":
        global_file.write_bytes(original)
    elif name == "symlink_global":
        global_file.unlink()  # Only the synthetic file just created above.
        global_file.symlink_to(target)
    elif name == "updated_symlink_target":
        target.write_bytes(updated)
    else:
        global_file.unlink()  # Only this fixture's synthetic link.
        global_file.symlink_to(dotfiles / "not-created.md")
    process = subprocess.Popen([node, str(tool / "cli.mjs"), "inspect", "--project", str(project), "--timeout-seconds", "30"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    timed_out = False
    try:
        stdout, _ = process.communicate(timeout=50)
    except subprocess.TimeoutExpired:
        timed_out = True
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, _ = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
            stdout, _ = process.communicate(timeout=5)
    try:
        report = json.loads(stdout)
    except ValueError:
        report = {"status": "INVALID_JSON"}
    observation, estimate = report.get("observation", {}), report.get("estimate", {})
    rows = estimate.get("rows", [])
    private_leak = any(s in json.dumps(report) for s in [str(work), original.decode().strip(), updated.decode().strip()])
    passed = (not timed_out and process.returncode == 0 and report.get("status") == "INSPECTED"
        and report.get("tool_version") == "0.1.3" and report.get("client_version") == "codex-cli 0.164.0"
        and observation.get("model_turn_requests") == 0 and observation.get("cleanup_confirmed") is True
        and observation.get("native_servers_started") == observation.get("native_servers_closed") == 2
        and observation.get("requested_model") == observation.get("resolved_model") == "gpt-6.1-sol"
        and observation.get("requested_effort") == observation.get("resolved_effort") == "max"
        and all(m in ["initialize", "config/read", "thread/start"] for m in observation.get("request_methods", []))
        and estimate.get("basis") == "local-snapshot-and-rust-v0.164.0-loader"
        and estimate.get("other_native_source_count") == expected_other and estimate.get("unknown_external_source_count") == 0
        and estimate.get("native_project_sources") == ["AGENTS.md"] and len(rows) == 1
        and rows[0].get("examined_bytes") == 30 and rows[0].get("estimated_status") == "FULL"
        and report.get("receipt") == report.get("compliance") == "NOT_TESTED"
        and hashlib.sha256(config.read_bytes()).hexdigest() == config_hash and not private_leak
        and not (profile / "auth.json").exists())
    results.append({"case": name, "passed": passed, "status": report.get("status"), "other_native_source_count": estimate.get("other_native_source_count"), "project_estimated_bytes": rows[0].get("examined_bytes") if rows else None, "model_turn_requests": observation.get("model_turn_requests"), "servers_started": observation.get("native_servers_started"), "servers_closed": observation.get("native_servers_closed"), "cleanup_confirmed": observation.get("cleanup_confirmed"), "receipt": report.get("receipt"), "compliance": report.get("compliance")})
    if not passed:
        break  # Stop; an unknown/failed cleanup is not an invitation to retry.
print(json.dumps({"tool_version": "0.1.3", "cli_version": version.stdout.strip(), "node_version": node_version.stdout.strip(), "cases": results}, indent=2))
raise SystemExit(0 if len(results) == 4 and all(r["passed"] for r in results) else 1)
PY
```

The recipe prints a four-case JSON summary and exits0 only when the observed fields match the table and cleanup is confirmed. An inconclusive or failed control exits1 and stops the sequence; it is not an automatic retry. Inspect the newly created fixture directory under your chosen scratch parent before removing it. Neither this recipe nor a successful `INSPECTED` result verifies global content receipt.

The [existing native-path/budget controls](../tools/agent-relay-check/examples/NATIVE-INSPECTION.md) and [historical live-marker measurements](../tools/agent-relay-check/examples/MEASUREMENTS.md) cover different claims. The global symlink controls add a documented case; the v0.1.3 source, archive and release are unchanged.
