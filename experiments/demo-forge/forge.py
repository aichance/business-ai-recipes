#!/usr/bin/env python3
"""Run one declarative Demo Forge operation and record shareable browser media."""

from __future__ import annotations

import argparse
import importlib.metadata
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
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DEFAULT_SERVER = ROOT / "server.py"
DEFAULT_SPEC = ROOT / "operation.json"
READY_RE = re.compile(r"DEMO_FORGE_READY pid=(\d+) port=(\d+)")
MEDIA_NAMES = ("demo-forge.webm", "demo-forge.mp4", "demo-forge.gif", "cover.png")


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
    elif kind == "scroll_into_view":
        assert locator is not None
        locator.scroll_into_view_if_needed()
    elif kind == "wait_for_selector":
        assert locator is not None
        timeout_ms = step.get("timeout_ms", 5000)
        if type(timeout_ms) is not int or not 1 <= timeout_ms <= 60000:
            raise ValueError("timeout_ms must be an integer from 1 to 60000")
        locator.wait_for(state="visible", timeout=timeout_ms)
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


def local_app_url(value: str) -> str:
    """Require one explicit, unauthenticated loopback HTTP application."""
    try:
        parts = urlsplit(value)
        valid = (
            parts.scheme == "http"
            and parts.hostname == "127.0.0.1"
            and parts.port is not None
            and 1 <= parts.port <= 65535
            and parts.username is None
            and parts.password is None
            and not parts.fragment
            and not any(c.isspace() for c in value)
        )
    except ValueError:
        valid = False
    if not valid:
        raise argparse.ArgumentTypeError(
            "use http://127.0.0.1:PORT/path for your own running local app"
        )
    return value


def same_app_request(url: str, app_url: str) -> bool:
    try:
        parts, app = urlsplit(url), urlsplit(app_url)
        return (
            parts.scheme == app.scheme == "http"
            and parts.hostname == app.hostname == "127.0.0.1"
            and parts.port == app.port
            and parts.username is None
            and parts.password is None
        )
    except ValueError:
        return False


def route_local_request(route, app_url: str) -> None:
    """Fetch one local response without following redirects outside the guard."""
    if not same_app_request(route.request.url, app_url):
        route.abort("blockedbyclient")
        return
    response = route.fetch(max_redirects=0)
    if 300 <= response.status < 400:
        route.abort("blockedbyclient")
        return
    route.fulfill(response=response)


def playwright_repair_steps() -> list[str]:
    """Return setup commands that keep installs out of system Python."""
    if sys.prefix == sys.base_prefix:
        return [
            "python3 -m venv .demo-forge-venv",
            ".demo-forge-venv/bin/python -m pip install 'playwright>=1.48'",
            ".demo-forge-venv/bin/python -m playwright install chromium",
        ]
    return [
        "python3 -m pip install 'playwright>=1.48'",
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
        version = importlib.metadata.version("playwright")
        version_parts = tuple(int(part) for part in version.split(".")[:2])
        requirements["playwright"] = {
            "status": "ok" if version_parts >= (1, 48) else "missing",
            "version": version,
            "required": ">=1.48",
        }
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


def archive_previous_run(output: Path) -> str | None:
    """Retain our previous run without leaving its media at the current paths."""
    paths = [output / name for name in (*MEDIA_NAMES, "run.json")]
    existing = [path for path in paths if path.exists() or path.is_symlink()]
    if not existing:
        return None
    if any(path.is_symlink() or not path.is_file() for path in existing):
        raise ValueError("output contains a symlink or non-file at a Demo Forge artifact path")
    report = output / "run.json"
    try:
        previous = json.loads(report.read_text())
    except (OSError, ValueError) as exc:
        raise ValueError("output has unrecognized files; choose another output directory") from exc
    if not isinstance(previous, dict) or previous.get("scope") != "experiments/demo-forge":
        raise ValueError("output has no Demo Forge report; choose another output directory")
    history = output / "previous-runs"
    if history.is_symlink():
        raise ValueError("previous-runs must not be a symlink")
    history.mkdir(exist_ok=True)
    archive = Path(tempfile.mkdtemp(prefix="run-", dir=history))
    moved: list[Path] = []
    try:
        for path in existing:
            path.rename(archive / path.name)
            moved.append(path)
    except OSError:
        for path in reversed(moved):
            (archive / path.name).rename(path)
        archive.rmdir()
        raise
    return str(archive)


def run(
    output: Path,
    server_path: Path,
    spec_path: Path,
    tail_seconds: float = 0.0,
    app_url: str | None = None,
) -> dict[str, object]:
    if app_url is not None:
        app_url = local_app_url(app_url)
    output.mkdir(parents=True, exist_ok=True)
    started = iso_now()
    started_monotonic = time.monotonic()
    process: subprocess.Popen[str] | None = None
    result: dict[str, object] = {
        "status": "failed",
        "started_at": started,
        "ended_at": None,
        "scope": "experiments/demo-forge",
        "operation": None,
        "input": None,
        "sources": {
            "server": str(server_path) if app_url is None else None,
            "operation": str(spec_path),
        },
        "presentation": {
            "tail_seconds": tail_seconds,
            "tail_mode": "clone_final_frame" if tail_seconds > 0 else "none",
        },
        "server": {},
        "browser": {"engine": "chromium", "headless": True, "viewport": "1280x720"},
        "artifacts": {},
        "errors": [],
    }
    try:
        result["previous_run_dir"] = archive_previous_run(output)
    except (OSError, ValueError) as exc:
        result["errors"] = [f"{type(exc).__name__}: {exc}"]
        result["ended_at"] = iso_now()
        result["report_saved"] = False
        return result
    result["status"] = "running"
    (output / "run.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    temp_dir: Path | None = None
    published: list[Path] = []
    try:
        spec = json.loads(spec_path.read_text())
        result["operation"] = spec["name"]
        result["input"] = spec["input"]
        temp_dir = Path(tempfile.mkdtemp(prefix="demo-forge-video-", dir=output))
        if app_url is None:
            process, server_pid, port, ready_line = start_server(server_path)
            app_url = f"http://127.0.0.1:{port}/"
            result["server"] = {
                "pid": server_pid,
                "port": port,
                "ready_line": ready_line,
                "managed_by_forge": True,
            }
        else:
            result["server"] = {
                "pid": None,
                "port": urlsplit(app_url).port,
                "managed_by_forge": False,
            }
        result["browser"] = {**result["browser"], "url": app_url}
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                record_video_dir=str(temp_dir),
                viewport={"width": 1280, "height": 720},
                device_scale_factor=1,
                service_workers="block",
            )
            context.route(
                "**/*",
                lambda route: route_local_request(route, app_url),
            )
            # Routed sockets are mocked unless connect_to_server() is called.
            # Closing during the opening callback can hang Chromium on startup.
            context.route_web_socket("**/*", lambda socket: None)
            page = context.new_page()
            page.goto(app_url, wait_until="networkidle")
            for step in spec["steps"]:
                perform_step(page, step)
            success = page.locator(spec["success"]["selector"])
            if success.count() != 1:
                raise AssertionError("success selector did not resolve to one element")
            actual_text = success.inner_text()
            expected_text = spec["success"]["text"]
            if expected_text not in actual_text:
                raise AssertionError(f"success text missing: {actual_text!r}")
            cover_path = temp_dir / "cover.png"
            # A full-page screenshot can resize a tall page while video is recording.
            page.screenshot(path=str(cover_path), full_page=False)
            video = page.video
            context.close()
            browser.close()
            assert video is not None
            recorded_path = Path(video.path())

        webm_path = temp_dir / "demo-forge.webm"
        mp4_path = temp_dir / "demo-forge.mp4"
        gif_path = temp_dir / "demo-forge.gif"
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
        result["verified"] = {
            "success_selector": spec["success"]["selector"],
            "success_text": actual_text,
            "operation_steps": len(spec["steps"]),
        }
        for name in MEDIA_NAMES:
            destination = output / name
            (temp_dir / name).rename(destination)
            published.append(destination)
        result["artifacts"] = {
            "webm": str(output / "demo-forge.webm"),
            "mp4": str(output / "demo-forge.mp4"),
            "gif": str(output / "demo-forge.gif"),
            "cover": str(output / "cover.png"),
            "ffmpeg_returncode": ffmpeg.returncode,
            "gif_ffmpeg_returncode": gif.returncode,
        }
        result["status"] = "success"
    except Exception as exc:  # record failure without claiming success
        result["status"] = "failed"
        result["errors"] = [f"{type(exc).__name__}: {exc}"]
        for path in published:
            path.unlink(missing_ok=True)
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        if temp_dir is not None:
            shutil.rmtree(temp_dir, ignore_errors=True)
        result["ended_at"] = iso_now()
        result["duration_seconds"] = round(time.monotonic() - started_monotonic, 3)
        (output / "run.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Record one Demo Forge browser operation")
    parser.add_argument("--output", type=Path)
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--server", type=Path, default=DEFAULT_SERVER)
    target.add_argument("--url", type=local_app_url, help="record your already-running local app")
    parser.add_argument("--operation", type=Path)
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
    if args.url and args.operation is None:
        parser.error("--operation is required with --url")
    result = run(
        args.output.resolve(),
        args.server.resolve(),
        (args.operation or DEFAULT_SPEC).resolve(),
        args.tail_seconds,
        args.url,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
