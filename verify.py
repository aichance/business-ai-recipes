"""Verify the detached public-package candidate with the standard library."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from recipe import Refused, apply_local, approve, prepare, read_json, validate_plan

EXPECTED_FILES = {
    "docs/test-the-test.html",
    "docs/test-the-test-ja.html",
    "docs/test-the-test.js",
    "docs/app-crash-lab-language-single.html",
    "docs/app-crash-lab.html",
    "docs/app-crash-lab.png",
    "tools/app-crash-lab/.gitignore",
    "tools/app-crash-lab/CONTRACT.md",
    "tools/app-crash-lab/LICENSE",
    "tools/app-crash-lab/README.md",
    "tools/app-crash-lab/cli.mjs",
    "tools/app-crash-lab/demo/index.html",
    "tools/app-crash-lab/demo/server.mjs",
    "tools/app-crash-lab/examples/ANNOTATE.md",
    "tools/app-crash-lab/examples/AUGUR.md",
    "tools/app-crash-lab/examples/AVONTURE.md",
    "tools/app-crash-lab/examples/CEREUSDB.md",
    "tools/app-crash-lab/examples/CREATOR-FRAME.md",
    "tools/app-crash-lab/examples/FIRST-FAILURE-TRACE.md",
    "tools/app-crash-lab/examples/FALA-GRINGO.md",
    "tools/app-crash-lab/examples/MULTI-COUNTER.md",
    "tools/app-crash-lab/examples/GLYPHA.md",
    "tools/app-crash-lab/examples/PIXIE.md",
    "tools/app-crash-lab/examples/TUNORON.md",
    "tools/app-crash-lab/examples/TYPETRAIL.md",
    "tools/app-crash-lab/examples/VISIBLE-LANGUAGE.md",
    "tools/app-crash-lab/examples/SETHERA.md",
    "tools/app-crash-lab/examples/annotate.html",
    "tools/app-crash-lab/examples/annotate.json",
    "tools/app-crash-lab/examples/augur.json",
    "tools/app-crash-lab/examples/avonture.json",
    "tools/app-crash-lab/examples/cereusdb.json",
    "tools/app-crash-lab/examples/creator-frame.json",
    "tools/app-crash-lab/examples/fala-gringo.json",
    "tools/app-crash-lab/examples/multi-counter.json",
    "tools/app-crash-lab/examples/direct-playwright/README.md",
    "tools/app-crash-lab/examples/direct-playwright/direct.spec.mjs",
    "tools/app-crash-lab/examples/direct-playwright/fixtures.json",
    "tools/app-crash-lab/examples/direct-playwright/playwright.config.mjs",
    "tools/app-crash-lab/examples/failure-boundary/README.md",
    "tools/app-crash-lab/examples/failure-boundary/LICENSE",
    "tools/app-crash-lab/examples/failure-boundary/package.json",
    "tools/app-crash-lab/examples/failure-boundary/package-lock.json",
    "tools/app-crash-lab/examples/failure-boundary/boundary.spec.mjs",
    "tools/app-crash-lab/examples/failure-boundary/playwright.config.mjs",
    "tools/app-crash-lab/examples/glypha.json",
    "tools/app-crash-lab/examples/inventory.json",
    "tools/app-crash-lab/examples/language.html",
    "tools/app-crash-lab/examples/language-single.html",
    "tools/app-crash-lab/examples/language-single-count-only.json",
    "tools/app-crash-lab/examples/language-single-normal.json",
    "tools/app-crash-lab/examples/language-single-text-loss.json",
    "tools/app-crash-lab/examples/LANGUAGE-COUNTS.md",
    "tools/app-crash-lab/examples/language-naive.json",
    "tools/app-crash-lab/examples/language-normal.json",
    "tools/app-crash-lab/examples/language-display-loss.json",
    "tools/app-crash-lab/examples/notes.json",
    "tools/app-crash-lab/examples/pixie.json",
    "tools/app-crash-lab/examples/pixie-roundtrip/playwright.config.mjs",
    "tools/app-crash-lab/examples/pixie-roundtrip/roundtrip.spec.mjs",
    "tools/app-crash-lab/examples/tunoron.json",
    "tools/app-crash-lab/examples/typetrail.json",
    "tools/app-crash-lab/examples/sethera.json",
    "tools/app-crash-lab/lib/contract.mjs",
    "tools/app-crash-lab/lib/protocol.mjs",
    "tools/app-crash-lab/lib/report.mjs",
    "tools/app-crash-lab/lib/runner.mjs",
    "tools/app-crash-lab/package-lock.json",
    "tools/app-crash-lab/package.json",
    "tools/app-crash-lab/tests/acceptance.test.mjs",
    "tools/app-crash-lab/tests/contract.test.mjs",
    "tools/app-crash-lab/tests/file-import.test.mjs",
    "tools/app-crash-lab/tests/native-alert.test.mjs",
    ".agents/skills/demo-forge/SKILL.md",
    ".agents/skills/demo-forge/LICENSE",
    ".agents/skills/demo-forge/references/setup.md",
    ".agents/skills/demo-forge/scripts/forge.py",
    ".agents/skills/demo-forge/scripts/server.py",
    ".agents/skills/demo-forge/scripts/operation.json",
    ".agents/skills/demo-forge/scripts/operation.narrated.json",
    ".agents/skills/demo-forge/scripts/app/index.html",
    ".github/workflows/verify.yml",
    ".gitignore",
    "AGENTS.md",
    "LICENSE",
    "README.md",
    "RECIPES.md",
    "docs/index.html",
    "docs/studio.html",
    "docs/studio-core.mjs",
    "docs/studio-gif.mjs",
    "docs/gifenc.mjs",
    "docs/gifenc.LICENSE.txt",
    "docs/studio-sample.mp4",
    "docs/silentstars.html",
    "docs/silentstars-demo.mp4",
    "docs/silentstars-demo.gif",
    "docs/silentstars-raw.mp4",
    "docs/silentstars-storyboard.yml",
    "docs/silentstars-story.json",
    "docs/silentstars-operation.json",
    "docs/glypha-codex-roundtrip.md",
    "experiments/demo-forge/README.md",
    "experiments/demo-forge/app/index.html",
    "experiments/demo-forge/demo.gif",
    "experiments/demo-forge/examples/brief-app/server.py",
    "experiments/demo-forge/examples/brief-app/index.html",
    "experiments/demo-forge/examples/brief-app/operation.json",
    "experiments/demo-forge/forge.py",
    "experiments/demo-forge/present.py",
    "experiments/demo-forge/story.example.json",
    "experiments/demo-forge/operation.json",
    "experiments/demo-forge/operation.narrated.json",
    "experiments/demo-forge/server.py",
    "fixtures/human_review.json",
    "fixtures/meeting_line_judgment.json",
    "fixtures/selected_model_output.json",
    "fixtures/synthetic_meeting.json",
    "recipe.py",
    "recipes/csv-to-report/README.md",
    "recipes/csv-to-report/examples/duplicate.csv",
    "recipes/csv-to-report/examples/empty.csv",
    "recipes/csv-to-report/examples/mixed-strings.csv",
    "recipes/csv-to-report/report.py",
    "recipes/csv-to-report/sales.csv",
    "recipes/jev-csv-exception-routing/README.md",
    "recipes/jev-csv-exception-routing/cases.json",
    "recipes/jev-csv-exception-routing/recorded-answers.json",
    "recipes/jev-csv-exception-routing/route.py",
    "recipes/jev-support-triage/README.md",
    "recipes/jev-support-triage/cases.json",
    "recipes/jev-support-triage/observed-answers.json",
    "recipes/jev-support-triage/triage.py",
    "recipes/meeting-line-judgment/README.md",
    "recipes/meeting-line-judgment/recipe.py",
    "run_demo.py",
    "tools/cutroom/README.md",
    "tools/cutroom/app.js",
    "tools/cutroom/demo/recorded.json",
    "tools/cutroom/demo/screenshot.png",
    "tools/cutroom/demo/source.json",
    "tools/cutroom/demo/walkthrough.mp4",
    "tools/cutroom/demo/walkthrough.srt",
    "tools/cutroom/index.html",
    "tools/cutroom/intelligence.py",
    "tools/cutroom/media.py",
    "tools/cutroom/server.py",
    "tools/cutroom/style.css",
    "tools/cutroom/test_media.py",
    "tools/cutroom/test_server.py",
    "tools/app-forge/README.md",
    "tools/app-forge/fixtures/adversarial-title.data.json",
    "tools/app-forge/fixtures/adversarial-title.schema.json",
    "tools/app-forge/fixtures/release-checklist.data.json",
    "tools/app-forge/fixtures/release-checklist.schema.json",
    "tools/app-forge/fixtures/support-request.data.json",
    "tools/app-forge/fixtures/support-request.schema.json",
    "tools/app-forge/fixtures/support-request.unexpected.data.json",
    "tools/app-forge/forge.mjs",
    "tools/dots-studio/.gitignore",
    "tools/dots-studio/IDEAS.md",
    "tools/dots-studio/README.md",
    "tools/dots-studio/build.mjs",
    "tools/dots-studio/core.mjs",
    "tools/dots-studio/demo/evidence.jpg",
    "tools/dots-studio/demo/run.jpg",
    "tools/dots-studio/demo/scenario.jpg",
    "tools/dots-studio/examples.mjs",
    "tools/dots-studio/fixtures/own-sales.csv",
    "tools/dots-studio/fixtures/own-sales.scenario",
    "tools/dots-studio/fixtures/sample.dotrun",
    "tools/dots-studio/fixtures/sample.evidence",
    "tools/dots-studio/mcp.json",
    "tools/dots-studio/package-lock.json",
    "tools/dots-studio/package.json",
    "tools/dots-studio/plugin.json",
    "tools/dots-studio/preview.mjs",
    "tools/dots-studio/replay.mjs",
    "tools/dots-studio/server.mjs",
    "tools/dots-studio/shell.html",
    "tools/dots-studio/skills/dots-studio/SKILL.md",
    "tools/dots-studio/style.css",
    "tools/dots-studio/test/core.test.mjs",
    "tools/dots-studio/test/protocol.test.mjs",
    "tools/dots-studio/ui.mjs",
    "verify.py",
}
_MISSING = object()
_WORKSPACE_DIRS = frozenset({".demo-forge-output", ".demo-forge-venv"})
_DOTS_WORKSPACE_PATHS = frozenset(
    {
        "tools/dots-studio/node_modules",
        "tools/dots-studio/dist",
        "tools/app-crash-lab/node_modules",
        "tools/app-crash-lab/.crash-lab",
        "tools/app-crash-lab/test-results",
        "tools/app-crash-lab/playwright-report",
    }
)


def _files(root: Path) -> set[str]:
    files = set()
    for path in root.rglob("*"):
        if ".git" in path.parts or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        if any(part in _WORKSPACE_DIRS for part in path.parts):
            continue
        relative = path.relative_to(root).as_posix()
        if any(
            relative == name or relative.startswith(name + "/") for name in _DOTS_WORKSPACE_PATHS
        ):
            continue
        if path.is_symlink():
            raise AssertionError(f"symlink is not allowed: {path.relative_to(root)}")
        if path.is_file():
            files.add(path.relative_to(root).as_posix())
    return files


def _assert_candidate_boundary(root: Path) -> None:
    if (root / "docs/app-crash-lab-language-single.html").read_bytes() != (
        root / "tools/app-crash-lab/examples/language-single.html"
    ).read_bytes():
        raise AssertionError("browser comparison fixture differs from the CLI example")
    if _files(root) != EXPECTED_FILES:
        raise AssertionError(f"candidate file set differs: {_files(root)}")
    forbidden = (
        "/Users" + "/",
        "github" + "_author",
        "config/" + "policy.json",
        ".runtime" + "/",
        "BEGIN " + "PRIVATE KEY",
        "gh" + "p_",
        "xox" + "b-",
    )
    for relative in EXPECTED_FILES:
        path = root / relative
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for fragment in forbidden:
            if fragment in content:
                raise AssertionError(f"forbidden content in {relative}")


def _must_refuse(action) -> None:
    try:
        action()
    except ValueError:
        return
    raise AssertionError("invalid input was accepted")


def _load_csv_recipe(root: Path):
    path = root / "recipes" / "csv-to-report" / "report.py"
    spec = importlib.util.spec_from_file_location("public_csv_to_report", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public CSV recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_jev_recipe(root: Path):
    path = root / "recipes" / "jev-support-triage" / "triage.py"
    spec = importlib.util.spec_from_file_location("public_jev_support_triage", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public Jev recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_jev_csv_exception_recipe(root: Path):
    path = root / "recipes" / "jev-csv-exception-routing" / "route.py"
    spec = importlib.util.spec_from_file_location("public_jev_csv_exception_routing", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public Jev CSV exception recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_line_judgment_recipe(root: Path):
    path = root / "recipes" / "meeting-line-judgment" / "recipe.py"
    spec = importlib.util.spec_from_file_location("public_meeting_line_judgment", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public meeting-line judgment recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _verify_demo_forge(root: Path) -> dict:
    demo_root = root / "experiments" / "demo-forge"
    skill_root = root / ".agents" / "skills" / "demo-forge"
    for relative in (
        "forge.py",
        "server.py",
        "operation.json",
        "operation.narrated.json",
        "app/index.html",
    ):
        if (skill_root / "scripts" / relative).read_bytes() != (demo_root / relative).read_bytes():
            raise AssertionError(
                f"bundled Demo Forge skill differs from recorder source: {relative}"
            )
    if (skill_root / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise AssertionError("bundled Demo Forge skill must include the root license")
    presentation_spec = importlib.util.spec_from_file_location(
        "public_demo_presentation", demo_root / "present.py"
    )
    presentation = importlib.util.module_from_spec(presentation_spec)
    presentation_spec.loader.exec_module(presentation)
    story = json.loads((demo_root / "story.example.json").read_text())
    if len(presentation.validate_story(story, 12)) != 3:
        raise AssertionError("presentation example must contain three valid cues")
    _must_refuse(lambda: presentation.validate_story(story, 2))
    forge_source = (demo_root / "forge.py").read_text(encoding="utf-8")
    if "build_gif_command" not in forge_source or "demo-forge.gif" not in forge_source:
        raise AssertionError("Demo Forge GIF artifact contract missing")
    operation = json.loads((demo_root / "operation.json").read_text(encoding="utf-8"))
    if operation["name"] != "launch-demo" or operation["input"] != {"project_name": "Launch Kit"}:
        raise AssertionError("Demo Forge operation contract changed")
    if len(operation["steps"]) != 6 or operation["success"]["text"] != "Launch Kit is ready":
        raise AssertionError("Demo Forge success contract changed")
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    help_result = subprocess.run(
        [sys.executable, "-B", "experiments/demo-forge/forge.py", "--help"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if help_result.returncode != 0 or "--tail-seconds" not in help_result.stdout:
        raise AssertionError("Demo Forge CLI help contract failed")
    doctor_result = subprocess.run(
        [sys.executable, "-B", "experiments/demo-forge/forge.py", "--doctor"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    try:
        doctor = json.loads(doctor_result.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError("Demo Forge doctor did not return JSON") from exc
    if doctor_result.returncode not in (0, 1) or doctor.get("scope") != "local-only":
        raise AssertionError("Demo Forge doctor contract failed")
    if set(doctor.get("requirements", {})) != {"python", "playwright", "chromium", "ffmpeg"}:
        raise AssertionError("Demo Forge doctor requirements changed")
    with TemporaryDirectory() as directory:
        output = Path(directory) / "out"
        output.mkdir()
        (output / "run.json").write_text(json.dumps({"scope": "experiments/demo-forge"}))
        (output / "demo-forge.mp4").write_bytes(b"synthetic previous clip")
        (output / "notes.txt").write_text("keep notes")
        invalid_operation = Path(directory) / "invalid.json"
        invalid_operation.write_text("not JSON")
        failed_run = subprocess.run(
            [
                sys.executable,
                "-B",
                str(demo_root / "forge.py"),
                "--operation",
                str(invalid_operation),
                "--output",
                str(output),
            ],
            env=environment,
            capture_output=True,
            text=True,
            timeout=30,
        )
        failed = json.loads(failed_run.stdout)
        archived = Path(failed["previous_run_dir"])
        if (
            failed_run.returncode != 1
            or failed["status"] != "failed"
            or failed["artifacts"]
            or (output / "demo-forge.mp4").exists()
            or (archived / "demo-forge.mp4").read_bytes() != b"synthetic previous clip"
            or (output / "notes.txt").read_text() != "keep notes"
            or json.loads((output / "run.json").read_text()) != failed
        ):
            raise AssertionError("Demo Forge failed rerun must preserve history, not stale exports")
    return {
        "operation": operation["name"],
        "steps": len(operation["steps"]),
        "success_text": operation["success"]["text"],
        "gif_artifact": "demo-forge.gif",
        "presentation": "author-written captions, no automatic timing or truth check",
        "doctor": doctor["status"],
        "failed_rerun_keeps_only_historical_media": True,
        "network_scope": "127.0.0.1",
        "external_write": False,
    }


def _verify_meeting_line_judgment(root: Path) -> dict:
    recipe = _load_line_judgment_recipe(root)
    meeting_path = root / "fixtures" / "synthetic_meeting.json"
    fixture_path = root / "fixtures" / "meeting_line_judgment.json"
    meeting = recipe.load_meeting(meeting_path)
    fixture = recipe.load_recorded_fixture(fixture_path)
    result = recipe.offline_result(meeting_path, fixture_path)
    if result != recipe.offline_result(meeting_path, fixture_path):
        raise AssertionError("meeting-line judgment is not deterministic")
    if (
        fixture["fixture_metadata"]["live_api_call"] is not False
        or fixture["fixture_metadata"]["record_origin"]
        != "hand_authored_synthetic_fixture_not_api_observation"
        or result["fixture_status"] != "recorded_synthetic_fixture_not_live"
        or result["live_api_call"] is not False
    ):
        raise AssertionError("recorded meeting-line fixture is mislabeled as live")
    if (
        result["input_line_count"],
        result["action_candidate_count"],
        result["review_count"],
    ) != (6, 1, 5):
        raise AssertionError("meeting-line judgment count reconciliation failed")
    action_ids = [row["line_id"] for row in result["action_candidates"]]
    review_ids = [row["line_id"] for row in result["review"]]
    if action_ids != ["L2"] or review_ids != ["L1", "L3", "L4", "L5", "L6"]:
        raise AssertionError("meeting-line action/review routing changed")
    review_by_id = {row["line_id"]: row for row in result["review"]}
    if not {
        "probability_below_threshold",
        "confidence_below_threshold",
        "ambiguity_flagged",
    }.issubset(set(review_by_id["L3"]["review_reasons"])):
        raise AssertionError("ambiguous or low-confidence action candidate was not reviewed")
    if any(
        key in row
        for row in [*result["action_candidates"], *result["review"]]
        for key in ("owner", "due", "number", "amount")
    ):
        raise AssertionError("meeting-line judgment extracted a code-owned field")
    if (
        result["human_review_required"] is not True
        or result["auto_decision"] is not False
        or result["auto_approval"] is not False
        or result["task_registration"] is not False
        or result["external_write"] is not False
    ):
        raise AssertionError("meeting-line judgment crossed the external-write boundary")

    payload = recipe.question_payload(meeting["lines"][0])
    if payload["model"] != "jev-1.13.0" or set(payload["state"]) != {
        "meeting_id",
        "line_id",
        "text",
    }:
        raise AssertionError("live payload does not use the fixed synthetic line contract")
    environment = os.environ.copy()
    environment.pop("TYPESAFE_API_KEY", None)
    environment.pop("PYTHONPATH", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    live_without_key = subprocess.run(
        [sys.executable, "-B", "recipes/meeting-line-judgment/recipe.py", "--live"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if (
        live_without_key.returncode == 0
        or "TYPESAFE_API_KEY" not in live_without_key.stderr
        or "Authorization" in live_without_key.stderr
    ):
        raise AssertionError("keyless --live did not refuse before network use")
    return {
        "input_lines": result["input_line_count"],
        "action_candidates": result["action_candidate_count"],
        "review": result["review_count"],
        "keyless_live_refused": True,
        "external_write": False,
    }


def _verify_csv_report(root: Path) -> dict:
    recipe = _load_csv_recipe(root)
    csv_root = root / "recipes" / "csv-to-report"
    sales_text = (csv_root / "sales.csv").read_text(encoding="utf-8")
    report = recipe.build_report(sales_text)
    expected_sales = {
        "status": "REVIEW_REQUIRED",
        "source_rows": 4,
        "valid_amount_rows": 3,
        "missing_amount_rows": 1,
        "invalid_amount_rows": 0,
        "duplicate_record_rows": 0,
        "total_amount_yen": 4500,
    }
    if report["metrics"] != expected_sales or report["narrative_verified"] is not True:
        raise AssertionError("CSV sample metrics or narrative do not reconcile")

    cases = {
        "empty.csv": {
            "status": "EMPTY_INPUT",
            "source_rows": 0,
            "valid_amount_rows": 0,
            "missing_amount_rows": 0,
            "invalid_amount_rows": 0,
            "duplicate_record_rows": 0,
            "total_amount_yen": 0,
        },
        "duplicate.csv": {
            "status": "REVIEW_REQUIRED",
            "source_rows": 2,
            "valid_amount_rows": 2,
            "missing_amount_rows": 0,
            "invalid_amount_rows": 0,
            "duplicate_record_rows": 1,
            "total_amount_yen": 2400,
        },
        "mixed-strings.csv": {
            "status": "REVIEW_REQUIRED",
            "source_rows": 3,
            "valid_amount_rows": 1,
            "missing_amount_rows": 1,
            "invalid_amount_rows": 1,
            "duplicate_record_rows": 0,
            "total_amount_yen": 1200,
        },
    }
    for name, expected in cases.items():
        actual = recipe.build_report((csv_root / "examples" / name).read_text(encoding="utf-8"))
        if actual["metrics"] != expected or actual["narrative_verified"] is not True:
            raise AssertionError(f"CSV edge case does not reconcile: {name}")

    invalid_csv_inputs = (
        "record_id,amount_yen\nX001,1200\n",
        "record_id,department,amount_yen\n,営業,1200\n",
        "record_id,department,amount_yen\nX001,営業,1200,unexpected\n",
        'record_id,department,amount_yen\nX001,"営業,1200\n',
    )
    for csv_text in invalid_csv_inputs:
        try:
            recipe.analyze_csv_text(csv_text)
        except recipe.CSVReportError:
            continue
        raise AssertionError("invalid CSV input was accepted")

    changed_narrative = report["narrative"].replace("4,500円", "4,501円")
    if changed_narrative == report["narrative"]:
        raise AssertionError("CSV narrative regression probe did not change its total")
    try:
        recipe.build_report(sales_text, narrative=changed_narrative)
    except recipe.NarrativeMismatch:
        pass
    else:
        raise AssertionError("incorrect narrative total was accepted")

    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    completed = subprocess.run(
        [
            sys.executable,
            "-B",
            "recipes/csv-to-report/report.py",
            "--csv",
            "recipes/csv-to-report/sales.csv",
        ],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if completed.returncode:
        raise AssertionError(f"CSV README command failed: {completed.stderr}")
    cli_result = json.loads(completed.stdout)
    if (
        cli_result.get("metrics") != expected_sales
        or cli_result.get("narrative_verified") is not True
    ):
        raise AssertionError("CSV README command output did not reconcile")
    return {
        "source_rows": expected_sales["source_rows"],
        "missing_amount_rows": expected_sales["missing_amount_rows"],
        "total_amount_yen": expected_sales["total_amount_yen"],
        "edge_cases": len(cases),
        "invalid_inputs_rejected": len(invalid_csv_inputs),
        "narrative_mismatch_rejected": True,
    }


def _verify_jev_recipe(root: Path) -> dict:
    recipe = _load_jev_recipe(root)
    recipe_root = root / "recipes" / "jev-support-triage"
    cases_path = recipe_root / "cases.json"
    recorded_path = recipe_root / "observed-answers.json"
    cases = recipe.load_cases(cases_path)
    report = recipe.reproduce(cases_path, recorded_path)
    expected_summary = {
        "cases": 16,
        "clear_cases": 11,
        "routable_clear_cases": 10,
        "routable_correct_auto": 10,
        "routable_wrong_auto": 0,
        "routable_reviewed": 0,
        "clear_other_cases": 1,
        "clear_other_reviewed": 1,
        "review_cases": 5,
        "review_gated": 5,
        "review_missed": 0,
        "input_tokens": 7655,
        "latency_ms_median": 844.5,
        "latency_ms_max": 2738,
    }
    if report["summary"] != expected_summary:
        raise AssertionError(f"Jev recorded summary changed: {report['summary']}")
    if (
        report["fixture_status"] != "SYNTHETIC_ONLY_NOT_PRODUCTION"
        or report["recorded_response_status"] != "recorded_fixture_not_live_call"
        or report["model"] != "jev-1.13.0"
        or report["input_fixture_sha256"]
        != "cf03bab36b8914a4393f79f402541c2c0f84c24791368749d734c532743904d5"
        or report["recorded_fixture_sha256"]
        != hashlib.sha256(recorded_path.read_bytes()).hexdigest()
        or report["provisional_thresholds"] != {"probability": 0.85, "confidence": 0.65}
        or report["offline"] is not True
        or report["network_calls"] != 0
        or report["external_write"] is not False
    ):
        raise AssertionError("Jev offline boundary or fixture metadata changed")

    rows_by_id = {row["id"]: row for row in report["cases"]}
    expected_review_ids = {
        "jp-unrelated",
        "jp-mixed-login-price",
        "jp-invoice-access",
        "jp-vague",
        "jp-two-requests",
        "jp-injection",
    }
    if {case["id"] for case in cases} != set(rows_by_id):
        raise AssertionError("Jev case IDs do not reconcile")
    if any(rows_by_id[case_id]["action"] != "review" for case_id in expected_review_ids):
        raise AssertionError("Jev review cases were automatically routed")

    changed = json.loads(recorded_path.read_text(encoding="utf-8"))
    changed["cases"][0]["answer"]["choice"] = "billing"
    with TemporaryDirectory(prefix="jev-triage-invalid-") as directory:
        invalid = Path(directory) / "observed-answers.json"
        invalid.write_text(json.dumps(changed), encoding="utf-8")
        _must_refuse(lambda: recipe.reproduce(cases_path, invalid))

    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    environment.pop("TYPESAFE_API_KEY", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    offline = subprocess.run(
        [sys.executable, "-B", "recipes/jev-support-triage/triage.py", "--offline"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if offline.returncode:
        raise AssertionError(f"Jev offline README command failed: {offline.stdout}{offline.stderr}")
    cli_report = json.loads(offline.stdout)
    if cli_report["summary"] != expected_summary or cli_report["network_calls"] != 0:
        raise AssertionError("Jev offline CLI output did not reconcile")

    live_without_key = subprocess.run(
        [sys.executable, "-B", "recipes/jev-support-triage/triage.py", "--live"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if live_without_key.returncode == 0 or "TYPESAFE_API_KEY" not in live_without_key.stdout:
        raise AssertionError("Jev live mode did not fail closed without its environment key")

    payload = recipe.question_payload(cases[0]["message"])
    if payload["model"] != "jev-1.13.0" or payload["state"] != {"message": cases[0]["message"]}:
        raise AssertionError("Jev live payload contract changed")
    return {
        "cases": 16,
        "routable_correct_auto": 10,
        "review_gated": 5,
        "network_calls": 0,
        "external_write": False,
    }


def _verify_jev_csv_exception_recipe(root: Path) -> dict:
    recipe = _load_jev_csv_exception_recipe(root)
    recipe_root = root / "recipes" / "jev-csv-exception-routing"
    cases_path = recipe_root / "cases.json"
    recorded_path = recipe_root / "recorded-answers.json"
    cases = recipe.load_cases(cases_path)
    report = recipe.reproduce(cases_path, recorded_path)
    expected_baseline = {
        "processed_count": 24,
        "auto_candidate_count": 15,
        "review_count": 5,
        "unclassifiable_count": 4,
        "review_or_hold_count": 9,
        "review_rate": 0.375,
        "correct_auto_count": 12,
        "false_auto_count": 3,
        "dangerous_false_auto_count": 3,
        "missed_candidate_count": 0,
    }
    expected_jev = {
        "processed_count": 24,
        "auto_candidate_count": 11,
        "review_count": 12,
        "unclassifiable_count": 1,
        "review_or_hold_count": 13,
        "review_rate": 0.5417,
        "correct_auto_count": 11,
        "false_auto_count": 0,
        "dangerous_false_auto_count": 0,
        "missed_candidate_count": 1,
    }
    if report["fixture_count"] != len(cases) or len(cases) != 24:
        raise AssertionError("CSV exception fixture count changed")
    if report["baseline"] != expected_baseline or report["jev"] != expected_jev:
        raise AssertionError("CSV exception routing metrics changed")
    if report["input_fixture_sha256"] != hashlib.sha256(cases_path.read_bytes()).hexdigest():
        raise AssertionError("CSV exception input fixture hash does not reconcile")
    if (
        report["recorded_fixture_sha256"]
        != "31fb5dc7dc5dfb6a26e4d65bdd57a89dc8bf3ca52f12c17487a718bcb18d43a3"
        or report["recorded_response_status"] != "recorded_choice_fixture_not_live_call"
        or report["model"] != "jev-1.13.0"
        or report["observed_at"] is not None
        or report["thresholds"] != {"probability": 0.85, "confidence": 0.65}
        or report["measurement"]
        != {
            "provider_observation": "not_run",
            "provider_calls": 0,
            "provider_body_saved": False,
            "elapsed_ms": None,
            "input_tokens": None,
            "cost_estimate_usd": None,
            "cost_basis": "not measured; no live provider call",
        }
        or report["offline"] is not True
        or report["network_calls"] != 0
        or report["external_write"] is not False
    ):
        raise AssertionError("CSV exception offline boundary or measurement metadata changed")
    if report["comparison"] != {
        "same_fixture": True,
        "baseline_false_auto_count": 3,
        "jev_false_auto_count": 0,
        "baseline_dangerous_false_auto_count": 3,
        "jev_dangerous_false_auto_count": 0,
        "false_auto_reduction_count": 3,
        "auto_candidate_recommendation": "DO_NOT_RECOMMEND_AUTO_ROUTING",
    }:
        raise AssertionError("CSV exception comparison or safety recommendation changed")
    if sum(case["group"] == "review" for case in cases) < 6:
        raise AssertionError("CSV exception fixture lost required review examples")

    changed = json.loads(recorded_path.read_text(encoding="utf-8"))
    changed["cases"][0]["answer"]["choice"] = "billing"
    with TemporaryDirectory(prefix="jev-csv-exception-invalid-") as directory:
        invalid = Path(directory) / "recorded-answers.json"
        invalid.write_text(json.dumps(changed), encoding="utf-8")
        _must_refuse(lambda: recipe.reproduce(cases_path, invalid))

    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    environment.pop("TYPESAFE_API_KEY", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    offline = subprocess.run(
        [
            sys.executable,
            "-B",
            "recipes/jev-csv-exception-routing/route.py",
            "--offline",
        ],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if offline.returncode:
        raise AssertionError(
            f"CSV exception offline README command failed: {offline.stdout}{offline.stderr}"
        )
    cli_report = json.loads(offline.stdout)
    if cli_report["baseline"] != expected_baseline or cli_report["jev"] != expected_jev:
        raise AssertionError("CSV exception offline CLI output did not reconcile")
    return {
        "cases": 24,
        "baseline_false_auto": 3,
        "jev_false_auto": 0,
        "review_or_hold": {"baseline": 9, "jev": 13},
        "unclassifiable": {"baseline": 4, "jev": 1},
        "network_calls": 0,
        "external_write": False,
    }


def verify(
    root: Path | None = None,
    *,
    transcript: object = _MISSING,
    model_output: object = _MISSING,
    human_review: object = _MISSING,
) -> dict:
    root = (root or Path(__file__).resolve().parent).resolve()
    _assert_candidate_boundary(root)
    csv_summary = _verify_csv_report(root)
    line_judgment_summary = _verify_meeting_line_judgment(root)
    jev_summary = _verify_jev_recipe(root)
    jev_csv_exception_summary = _verify_jev_csv_exception_recipe(root)
    demo_forge_summary = _verify_demo_forge(root)

    supplied_inputs = (
        transcript is not _MISSING,
        model_output is not _MISSING,
        human_review is not _MISSING,
    )
    if any(supplied_inputs):
        if not all(supplied_inputs):
            raise Refused("Custom verification requires transcript, model output, and human review")
        plan = prepare(transcript, model_output, human_review=human_review)
        validate_plan(plan, human_review=human_review)
        return {
            "files": len(EXPECTED_FILES),
            "prepared_tasks": len(plan["tasks"]),
            "csv_report": csv_summary,
            "line_judgment": line_judgment_summary,
            "jev_report": jev_summary,
            "jev_csv_exception_report": jev_csv_exception_summary,
            "demo_forge": demo_forge_summary,
            "external_write": False,
        }

    transcript = read_json(root / "fixtures" / "synthetic_meeting.json")
    model_output = read_json(root / "fixtures" / "selected_model_output.json")
    human_review = read_json(root / "fixtures" / "human_review.json")
    metadata = model_output["fixture_metadata"]
    if metadata["label"] != "SYNTHETIC_ONLY_NOT_PRODUCTION":
        raise AssertionError("synthetic fixture label is missing")
    plan = prepare(transcript, model_output, human_review=human_review)
    if plan != prepare(transcript, model_output, human_review=human_review):
        raise AssertionError("prepare is not deterministic")
    reviewed_line_ids = set(human_review["human_confirmed_action_line_ids"])
    if any(
        evidence["line_id"] not in reviewed_line_ids
        for task in plan["tasks"]
        for evidence in task["evidence"]
    ):
        raise AssertionError("a task uses evidence outside the human review input")

    _must_refuse(lambda: prepare(transcript, model_output))
    bad_review = deepcopy(human_review)
    bad_review["source_hash"] = "0" * 64
    _must_refuse(lambda: prepare(transcript, model_output, human_review=bad_review))

    bad_output = deepcopy(model_output)
    bad_output["proposal"]["tasks"][0]["owner"] = "根拠のない担当"
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))
    bad_output = deepcopy(model_output)
    bad_output["proposal"]["tasks"][0]["execute"] = "do not run"
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))

    bad_output = deepcopy(model_output)
    bad_output["human_review"] = human_review
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))
    bad_output = deepcopy(model_output)
    bad_output["proposal"]["human_confirmed_action_line_ids"] = ["L4"]
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))

    for line in transcript["lines"]:
        if line["id"] in reviewed_line_ids:
            continue
        bad_output = deepcopy(model_output)
        bad_output["proposal"]["tasks"] = [
            {
                "title": line["text"][:300],
                "owner": None,
                "due": None,
                "evidence": [{"line_id": line["id"], "quote": line["text"]}],
            }
        ]
        _must_refuse(
            lambda bad_output=bad_output: prepare(transcript, bad_output, human_review=human_review)
        )

    _must_refuse(lambda: validate_plan(plan))
    changed_review = deepcopy(human_review)
    changed_review["human_confirmed_action_line_ids"].append("L4")
    _must_refuse(lambda: validate_plan(plan, human_review=changed_review))
    approval = approve(plan, "synthetic-local-review", human_review=human_review)
    _must_refuse(lambda: approve(plan, "synthetic-local-review"))
    with TemporaryDirectory(prefix="meeting-to-tasks-verify-") as directory:
        target = Path(directory) / "tasks.sqlite3"
        missing_review_target = Path(directory) / "missing-review.sqlite3"
        _must_refuse(lambda: apply_local(plan, approval, missing_review_target))
        if missing_review_target.exists():
            raise AssertionError("missing human review created a target")
        _must_refuse(lambda: apply_local(plan, {}, target, human_review=human_review))
        first = apply_local(plan, approval, target, human_review=human_review)
        repeat = apply_local(plan, approval, target, human_review=human_review)
        changed = deepcopy(plan)
        changed["tasks"][0]["owner"] = "改変された担当"
        changed_target = Path(directory) / "changed.sqlite3"
        _must_refuse(
            lambda: apply_local(changed, approval, changed_target, human_review=human_review)
        )
        if changed_target.exists():
            raise AssertionError("changed plan created a target")
    expected = (2, 0, 2)
    actual = (first["inserted"], repeat["inserted"], repeat["total_stored"])
    if actual != expected:
        raise AssertionError(f"count reconciliation failed: {actual}")
    if first["external_write"] is not False or repeat["external_write"] is not False:
        raise AssertionError("external write boundary failed")
    return {
        "files": len(EXPECTED_FILES),
        "deterministic_prepare": True,
        "reviewed_action_line_ids": sorted(reviewed_line_ids),
        "csv_report": csv_summary,
        "line_judgment": line_judgment_summary,
        "jev_report": jev_summary,
        "jev_csv_exception_report": jev_csv_exception_summary,
        "demo_forge": demo_forge_summary,
        "first_inserted": first["inserted"],
        "repeat_inserted": repeat["inserted"],
        "stored": repeat["total_stored"],
        "external_write": False,
    }


def main() -> int:
    try:
        result = verify()
    except (AssertionError, OSError, ValueError) as exc:
        print(f"VERIFY_FAILED: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: candidate boundary and synthetic fixture labels; files={result['files']}")
    print("PASS: separate human-reviewed evidence boundary")
    print("PASS: deterministic prepare and schema validation")
    print("PASS: Jev line judgment fixture, abstention, keyless live refusal, and write boundary")
    print("PASS: CSV README command, edge cases, and narrative reconciliation")
    print("PASS: Jev recorded fixture, provisional abstention gate, and offline/live boundary")
    print(
        "PASS: Demo Forge CLI, GIF artifact, success contract, localhost scope, "
        "and no external write; "
        "steps={steps}; gif={gif_artifact}".format(**result["demo_forge"])
    )
    print(
        "PASS: Jev CSV exception comparison; cases={cases}; "
        "baseline_false_auto={baseline_false_auto}; jev_false_auto={jev_false_auto}".format(
            **result["jev_csv_exception_report"]
        )
    )
    print(
        "PASS: first_run.inserted={first_inserted}; "
        "repeat_run.inserted={repeat_inserted}; "
        "repeat_run.total_stored={stored}; external_write={external_write}".format(**result)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
