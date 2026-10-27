"""Compare per-file static limits with a native startup inspection; no model turn."""

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile

DROPPED_COMMIT = "06536a1ee332f14073df87fdd0a628a61c6ebf5c"
TOOL_VERSION = "0.1.4"
BUDGET = 32768
CASES = [
    ("single_below", {"AGENTS.md": 24000}, ".", [24000], ["FULL"], 0,
     ["AGENTS.md"]),
    ("nested_shared", {"AGENTS.md": 24000, "child/AGENTS.md": 18000},
     "child", [24000, 8768], ["FULL", "TRUNCATED"], 0,
     ["AGENTS.md", "child/AGENTS.md"]),
    ("single_above", {"AGENTS.md": 42000}, ".", [32768], ["TRUNCATED"], 1,
     ["AGENTS.md"]),
    ("parent_one_byte_left", {"AGENTS.md": 32767, "child/AGENTS.md": 60},
     "child", [32767, 1], ["FULL", "TRUNCATED"], 0,
     ["AGENTS.md", "child/AGENTS.md"]),
    ("parent_budget_exhausted", {"AGENTS.md": 32768, "child/AGENTS.md": 60},
     "child", [32768, 0], ["FULL", "SKIPPED_BUDGET"], 0,
     ["AGENTS.md"]),
]


def require(condition, stage):
    if not condition:
        raise ValueError(stage)


def run(command, env, timeout=15, cwd=None):
    """Bound an owned process group; a timeout never becomes a successful retry."""
    process = subprocess.Popen(command, cwd=cwd, env=env, text=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        def stop_owned_group(sig):
            # Do not poll/reap the leader before stopping its group: even a zombie
            # leader reserves this ID. Never re-target an already reaped ID.
            if process.returncode is None:
                try:
                    os.killpg(process.pid, sig)
                except ProcessLookupError:
                    pass
        stop_owned_group(signal.SIGTERM)
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            stop_owned_group(signal.SIGKILL)
            try:
                process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.stdout.close()
                process.stderr.close()
                # A reaped leader is never re-targeted. Stop without claiming cleanup.
        raise ValueError("owned_process_timeout_cleanup_unconfirmed") from None
    return process.returncode, stdout, stderr


def fixture_bytes(size):
    head = b"# Synthetic capacity fixture\n"
    return head + b"x" * (size - len(head) - 1) + b"\n"


def inspect_summary(report, files, startup, expected_bytes, expected_statuses,
                    expected_native_paths):
    observation, estimate = report.get("observation", {}), report.get("estimate", {})
    require(report.get("status") == "INSPECTED"
            and report.get("tool_version") == TOOL_VERSION
            and report.get("client_version") == "codex-cli 0.164.0", "inspection_status")
    require(observation.get("model_turn_requests") == 0
            and observation.get("cleanup_confirmed") is True
            and observation.get("native_servers_started")
            == observation.get("native_servers_closed") == 2
            and observation.get("requested_model")
            == observation.get("resolved_model") == "gpt-6.1-sol"
            and observation.get("requested_effort")
            == observation.get("resolved_effort") == "max"
            and set(observation.get("request_methods", []))
            == {"initialize", "config/read", "thread/start"}, "inspection_lifetime")
    require(estimate.get("basis") == "local-snapshot-and-rust-v0.164.0-loader"
            and estimate.get("effective_project_doc_max_bytes") == BUDGET
            and estimate.get("startup_directory") == startup
            and estimate.get("other_native_source_count") == 0
            and estimate.get("unknown_external_source_count") == 0
            and estimate.get("selection_matches_native_paths") is True
            and estimate.get("snapshot_stable") is True
            and estimate.get("issues") == [], "inspection_scope")
    rows = estimate.get("rows", [])
    require(len(rows) == len(files)
            and [row.get("path") for row in rows] == list(files)
            and [row.get("file_bytes") for row in rows] == list(files.values())
            and all(type(row.get("examined_bytes")) is int
                    and 0 <= row["examined_bytes"] <= row["file_bytes"]
                    and row.get("estimated_status") in {"FULL", "TRUNCATED", "SKIPPED_BUDGET"}
                    and (row["examined_bytes"] == 0)
                    == (row["estimated_status"] == "SKIPPED_BUDGET") for row in rows)
            and all(row.get("selected") is True
                    and row.get("native_listed") is (row["path"] in expected_native_paths)
                    for row in rows)
            and set(estimate.get("native_project_sources", [])) == set(expected_native_paths)
            and len(estimate["native_project_sources"]) == len(expected_native_paths),
            "inspection_rows")
    require(report.get("receipt") == report.get("compliance") == "NOT_TESTED",
            "inspection_claim_boundary")
    return {"status": report["status"], "native_project_sources": estimate["native_project_sources"],
            "expectations_match": ([row["examined_bytes"] for row in rows] == expected_bytes
                                   and [row["estimated_status"] for row in rows] == expected_statuses),
            "separate_local_estimate": [
                {"path": row["path"], "file_bytes": row["file_bytes"],
                 "examined_bytes": row["examined_bytes"], "estimated_status": row["estimated_status"]}
                for row in rows],
            "model_turn_requests": 0, "servers_started": 2, "servers_closed": 2,
            "cleanup_confirmed": True, "receipt": "NOT_TESTED", "compliance": "NOT_TESTED"}


def dropped_summary(report, exit_code, project, files, expected_exit):
    require(report.get("schemaVersion") == 1
            and report.get("tool", {}).get("name") == "codex"
            and report["tool"].get("limit") == BUDGET
            and report["tool"].get("unit") == "bytes", "static_schema")
    rows = report.get("files", [])
    require(len(rows) == len(files), "static_file_count")
    normalized = {}
    for row in rows:
        name = Path(row.get("path", "")).resolve().relative_to(project).as_posix()
        require(name in files and name not in normalized, "static_path_scope")
        size = files[name]
        require(row.get("total") == size and row.get("limit") == BUDGET
                and row.get("unit") == "bytes" and row.get("hasLimit") is True
                and type(row.get("truncated")) is bool
                and type(row.get("cutByte")) is int
                and 0 <= row["cutByte"] <= size, "static_file_measurement")
        normalized[name] = {"total": size, "truncated": row["truncated"],
                            "cut_byte": row["cutByte"]}
    truncated = sum(row["truncated"] for row in normalized.values())
    require(exit_code == (1 if truncated else 0)
            and report.get("summary") == {"files": len(files), "truncatedFiles": truncated},
            "static_exit_and_summary")
    return {"ci_exit_code": exit_code, "summary": report["summary"], "files": normalized,
            "expectations_match": exit_code == expected_exit and all(
                row["truncated"] is (row["total"] > BUDGET)
                and row["cut_byte"] == min(row["total"], BUDGET)
                for row in normalized.values()), "stderr_empty": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scratch-parent", required=True, type=Path)
    parser.add_argument("--codex-bin-dir", type=Path)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--dropped", type=Path, help="Reviewed binary built with version set to the pinned commit")
    choice.add_argument("--native-only", action="store_true", help="Partial local check; does not run or prove dropped output")
    args = parser.parse_args()
    require(os.name == "posix", "this_recipe_requires_linux_or_macos")
    scratch = args.scratch_parent.resolve()
    require(scratch.is_dir(), "scratch_parent_missing")
    repo = Path(__file__).resolve().parents[2]
    tool = repo / "tools/agent-relay-check"
    require(json.loads((tool / "package.json").read_text())["version"] == TOOL_VERSION,
            "common_version")
    env = {key: os.environ[key] for key in ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]
           if key in os.environ}
    if args.codex_bin_dir:
        env["PATH"] = str(args.codex_bin_dir.resolve()) + os.pathsep + env["PATH"]
    node = shutil.which("node", path=env["PATH"])
    codex = shutil.which("codex", path=env["PATH"])
    require(node and codex, "missing_existing_runtime")
    code, version, _ = run([codex, "--version"], env)
    require(code == 0 and version.strip() == "codex-cli 0.164.0", "unsupported_cli")
    code, node_version, _ = run([node, "--version"], env)
    require(code == 0 and int(node_version.strip()[1:].split(".")[0]) >= 22, "node_version")
    dropped = args.dropped.resolve() if args.dropped else None
    if dropped:
        code, version, _ = run([str(dropped), "--version"], env)
        require(code == 0 and version.strip() == "dropped " + DROPPED_COMMIT,
                "static_binary_version")
    workspace = Path(tempfile.mkdtemp(prefix="relay-cumulative-", dir=scratch))
    result = {"schema_version": 1, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "mode": "native-only" if args.native_only else "comparison",
              "tool_version": TOOL_VERSION, "codex_version": "0.164.0",
              "node_version": node_version.strip(),
              "dropped_commit": DROPPED_COMMIT if dropped else None,
              "project_doc_max_bytes": BUDGET, "cases": []}
    for name, files, startup, expected_bytes, expected_statuses, static_exit, native_paths in CASES:
        project, profile = workspace / name / "project", workspace / name / "diagnostic-config"
        (project / ".git").mkdir(parents=True)
        profile.mkdir()
        for path, size in files.items():
            file = project / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(fixture_bytes(size))
        config = profile / "config.toml"
        config.write_text('model="gpt-6.1-sol"\nmodel_reasoning_effort="max"\n'
                          'project_doc_max_bytes=32768\n[projects.'
                          + json.dumps(str(project)) + ']\ntrust_level="trusted"\n')
        before = {str(file): hashlib.sha256(file.read_bytes()).hexdigest()
                  for file in [config, *(project / path for path in files)]}
        child_env = dict(env, CODEX_HOME=str(profile))
        static = None
        if dropped:
            code, stdout, stderr = run([str(dropped), "--json", "--target", "codex", "--ci",
                                str(project)], child_env)
            require(not stderr.strip(), "static_warning_or_error")
            static = dropped_summary(json.loads(stdout), code, project, files, static_exit)
        code, stdout, _ = run([node, str(tool / "cli.mjs"), "inspect", "--project",
                            str(project / startup), "--timeout-seconds", "30"], child_env, 50)
        require(code == 0, "native_command_failed")
        report = json.loads(stdout)
        native = inspect_summary(report, files, startup, expected_bytes, expected_statuses,
                                 native_paths)
        require(all(hashlib.sha256(Path(file).read_bytes()).hexdigest() == digest
                    for file, digest in before.items())
                and not (profile / "auth.json").exists(), "fixture_or_auth_changed")
        require(str(workspace) not in json.dumps(report), "native_report_path_leak")
        result["cases"].append({"case": name, "dropped": static, "relay": native,
                                "fixture_sha256": {path: before[str(project / path)] for path in files},
                                "fixture_and_config_unchanged": True})
    expected = all(case["relay"]["expectations_match"]
                   and (case["dropped"] is None or case["dropped"]["expectations_match"])
                   for case in result["cases"])
    result["status"] = ("OBSERVED_DIFFERENT_RESULT" if not expected else
                        "PARTIAL_NATIVE_ONLY" if args.native_only else "COMPARISON_CONFIRMED")
    result["limits"] = ["Operator synthetic measurements, not independent adoption.",
                        "Native paths are observations; byte counts are separate pinned-source local estimates.",
                        "No model receipt, instruction compliance or absence of startup network/metadata effects is proved."]
    print(json.dumps(result, indent=2))
    return 0 if expected else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError) as error:
        # Never print subprocess stderr, raw config, private paths or arbitrary JSON fields.
        safe = str(error) if type(error) is ValueError and str(error).replace("_", "").isalnum() else type(error).__name__
        print(json.dumps({"status": "INCONCLUSIVE", "failure": safe,
                          "automatic_retry": False}), file=sys.stderr)
        raise SystemExit(1)
