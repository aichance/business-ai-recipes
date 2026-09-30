#!/usr/bin/env python3
"""Run one declarative Demo Forge operation and record shareable browser media."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from selectors import EVENT_READ, DefaultSelector

ROOT = Path(__file__).resolve().parent
DEFAULT_SERVER = ROOT / "server.py"
DEFAULT_SPEC = ROOT / "operation.json"
READY_RE = re.compile(r"DEMO_FORGE_READY pid=(\d+) port=(\d+)")


def iso_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def start_server(server_path: Path) -> tuple[subprocess.Popen[str], int, int, str]:
    process = subprocess.Popen(
        [sys.executable, str(server_path), "--port", "0"],
        cwd=server_path.parent,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    selector = DefaultSelector()
    selector.register(process.stdout, EVENT_READ)
    deadline = time.monotonic() + 5
    lines: list[str] = []
    try:
        while time.monotonic() < deadline:
            events = selector.select(timeout=0.2)
            for key, _ in events:
                line = key.fileobj.readline().strip()
                lines.append(line)
                match = READY_RE.search(line)
                if match:
                    return process, int(match.group(1)), int(match.group(2)), line
            if process.poll() is not None:
                break
    finally:
        selector.close()
    output = "\n".join(lines)
    process.terminate()
    raise RuntimeError(f"server did not become ready: {output}")


def perform_step(page, step: dict[str, object]) -> None:
    kind = step["type"]
    selector = str(step.get("selector", ""))
    locator = page.locator(selector) if selector else None
    if kind == "fill":
        assert locator is not None
        locator.fill(str(step["value"]))
    elif kind == "click":
        assert locator is not None
        locator.click()
    elif kind == "wait_for_selector":
        assert locator is not None
        locator.wait_for(state="visible", timeout=5000)
    elif kind == "assert_text":
        assert locator is not None
        actual = locator.inner_text()
        expected = str(step["contains"])
        if expected not in actual:
            raise AssertionError(f"{selector} text {actual!r} does not contain {expected!r}")
    elif kind == "assert_attribute":
        assert locator is not None
        actual = locator.get_attribute(str(step["attribute"]))
        expected = str(step["equals"])
        if actual != expected:
            raise AssertionError(f"{selector} attribute {actual!r} != {expected!r}")
    else:
        raise ValueError(f"unsupported operation step: {kind}")
    page.wait_for_timeout(180)


def nonnegative_seconds(value: str) -> float:
    try:
        seconds = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a number of seconds") from exc
    if not math.isfinite(seconds) or seconds < 0:
        raise argparse.ArgumentTypeError("must be a finite, non-negative number of seconds")
    return seconds


def playwright_repair_steps() -> list[str]:
    """Return setup commands that keep installs out of system Python."""
    if sys.prefix == sys.base_prefix:
        return [
            "python3 -m venv .demo-forge-venv",
            ".demo-forge-venv/bin/python -m pip install playwright",
            ".demo-forge-venv/bin/python -m playwright install chromium",
        ]
    return [
        "python3 -m pip install playwright",
        "python3 -m playwright install chromium",
    ]


def doctor_result() -> dict[str, object]:
    """Check local prerequisites without starting the app or a browser."""
    requirements: dict[str, dict[str, object]] = {}
    python_ready = sys.version_info >= (3, 11)
    requirements["python"] = {
        "status": "ok" if python_ready else "missing",
        "version": platform.python_version(),
        "required": ">=3.11",
    }

    playwright_spec = importlib.util.find_spec("playwright")
    if playwright_spec is None:
        requirements["playwright"] = {
            "status": "missing",
            "detail": "Python package is not installed",
        }
        requirements["chromium"] = {
            "status": "missing",
            "detail": "Playwright package is unavailable, so its browser path cannot be checked",
        }
    else:
        requirements["playwright"] = {"status": "ok"}
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as playwright:
                executable = Path(playwright.chromium.executable_path)
            requirements["chromium"] = {
                "status": "ok" if executable.is_file() else "missing",
                "path": str(executable),
            }
            if not executable.is_file():
                requirements["chromium"]["detail"] = "Chromium executable is not installed"
        except Exception as exc:  # report a repairable prerequisite failure
            requirements["chromium"] = {
                "status": "missing",
                "detail": f"Could not inspect Chromium: {type(exc).__name__}: {exc}",
            }

    ffmpeg = shutil.which("ffmpeg")
    requirements["ffmpeg"] = {
        "status": "ok" if ffmpeg else "missing",
        "path": ffmpeg,
        "detail": None if ffmpeg else "ffmpeg is not available on PATH",
    }
    missing = [name for name, item in requirements.items() if item["status"] != "ok"]
    next_steps: list[str] = []
    if requirements["python"]["status"] != "ok":
        next_steps.append("Use Python 3.11 or newer.")
    if requirements["playwright"]["status"] != "ok":
        next_steps.extend(playwright_repair_steps())
    elif requirements["chromium"]["status"] != "ok":
        next_steps.append("python3 -m playwright install chromium")
    if requirements["ffmpeg"]["status"] != "ok":
        next_steps.append("Install ffmpeg and make it available on PATH.")
    return {
        "status": "ready" if not missing else "missing",
        "scope": "local-only",
        "python_environment": "virtualenv" if sys.prefix != sys.base_prefix else "system",
        "requirements": requirements,
        "missing": missing,
        "next_steps": next_steps,
    }


def build_ffmpeg_command(
    ffmpeg_binary: str,
    webm_path: Path,
    mp4_path: Path,
    tail_seconds: float,
) -> list[str]:
    command = [ffmpeg_binary, "-y", "-i", str(webm_path)]
    if tail_seconds > 0:
        command.extend(
            [
                "-vf",
                f"tpad=stop_mode=clone:stop_duration={tail_seconds:g}",
            ]
        )
    command.extend(
        [
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            str(mp4_path),
        ]
    )
    return command


def build_gif_command(
    ffmpeg_binary: str,
    mp4_path: Path,
    gif_path: Path,
) -> list[str]:
    """Convert the verified MP4 into a lightweight, looped share preview."""
    return [
        ffmpeg_binary,
        "-y",
        "-i",
        str(mp4_path),
        "-vf",
        "fps=10,scale=800:-1:flags=lanczos",
        "-loop",
        "0",
        "-an",
        str(gif_path),
    ]


def run(
    output: Path,
    server_path: Path,
    spec_path: Path,
    tail_seconds: float = 0.0,
) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    spec = json.loads(spec_path.read_text())
    started = iso_now()
    started_monotonic = time.monotonic()
    process: subprocess.Popen[str] | None = None
    result: dict[str, object] = {
        "status": "failed",
        "started_at": started,
        "ended_at": None,
        "scope": "experiments/demo-forge",
        "operation": spec["name"],
        "input": spec["input"],
        "sources": {"server": str(server_path), "operation": str(spec_path)},
        "presentation": {
            "tail_seconds": tail_seconds,
            "tail_mode": "clone_final_frame" if tail_seconds > 0 else "none",
        },
        "server": {},
        "browser": {"engine": "chromium", "headless": True, "viewport": "1280x720"},
        "artifacts": {},
        "errors": [],
    }
    temp_dir = Path(tempfile.mkdtemp(prefix="demo-forge-video-", dir=output))
    try:
        process, server_pid, port, ready_line = start_server(server_path)
        result["server"] = {"pid": server_pid, "port": port, "ready_line": ready_line}
        result["browser"] = {**result["browser"], "url": f"http://127.0.0.1:{port}/"}
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                record_video_dir=str(temp_dir),
                viewport={"width": 1280, "height": 720},
                device_scale_factor=1,
            )
            page = context.new_page()
            page.goto(f"http://127.0.0.1:{port}/", wait_until="networkidle")
            for step in spec["steps"]:
                perform_step(page, step)
            success = page.locator(spec["success"]["selector"])
            if success.count() != 1:
                raise AssertionError("success selector did not resolve to one element")
            actual_text = success.inner_text()
            expected_text = spec["success"]["text"]
            if expected_text not in actual_text:
                raise AssertionError(f"success text missing: {actual_text!r}")
            cover_path = output / "cover.png"
            page.screenshot(path=str(cover_path), full_page=True)
            video = page.video
            context.close()
            browser.close()
            assert video is not None
            recorded_path = Path(video.path())

        webm_path = output / "demo-forge.webm"
        mp4_path = output / "demo-forge.mp4"
        gif_path = output / "demo-forge.gif"
        ffmpeg_binary = shutil.which("ffmpeg")
        if ffmpeg_binary is None:
            raise RuntimeError("ffmpeg is required and must be available on PATH")
        shutil.copy2(recorded_path, webm_path)
        ffmpeg = subprocess.run(
            build_ffmpeg_command(ffmpeg_binary, webm_path, mp4_path, tail_seconds),
            check=True,
            capture_output=True,
            text=True,
        )
        gif = subprocess.run(
            build_gif_command(ffmpeg_binary, mp4_path, gif_path),
            check=True,
            capture_output=True,
            text=True,
        )
        result["status"] = "success"
        result["verified"] = {
            "success_selector": spec["success"]["selector"],
            "success_text": actual_text,
            "operation_steps": len(spec["steps"]),
        }
        result["artifacts"] = {
            "webm": str(webm_path),
            "mp4": str(mp4_path),
            "gif": str(gif_path),
            "cover": str(output / "cover.png"),
            "ffmpeg_returncode": ffmpeg.returncode,
            "gif_ffmpeg_returncode": gif.returncode,
        }
    except Exception as exc:  # record failure without claiming success
        result["errors"] = [f"{type(exc).__name__}: {exc}"]
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        shutil.rmtree(temp_dir, ignore_errors=True)
        result["ended_at"] = iso_now()
        result["duration_seconds"] = round(time.monotonic() - started_monotonic, 3)
        (output / "run.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Record one Demo Forge browser operation")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--server", type=Path, default=DEFAULT_SERVER)
    parser.add_argument("--operation", type=Path, default=DEFAULT_SPEC)
    parser.add_argument(
        "--doctor",
        action="store_true",
        help="check Python, Playwright, Chromium, and ffmpeg without starting a server",
    )
    parser.add_argument(
        "--tail-seconds",
        type=nonnegative_seconds,
        default=0.0,
        help="hold the verified final browser frame in the MP4 for share previews",
    )
    args = parser.parse_args()
    if args.doctor:
        result = doctor_result()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] == "ready" else 1
    if args.output is None:
        parser.error("--output is required unless --doctor is used")
    result = run(
        args.output.resolve(),
        args.server.resolve(),
        args.operation.resolve(),
        args.tail_seconds,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
