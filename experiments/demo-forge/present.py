#!/usr/bin/env python3
"""Frame a successful Demo Forge recording with author-written explanations."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    return json.loads(result.stdout)


def validate_story(story: object, duration: float) -> list[dict]:
    if not math.isfinite(duration) or not 0 < duration <= 120:
        raise ValueError("recording must be between 0 and 120 seconds")
    if not isinstance(story, dict):
        raise ValueError("story must be a JSON object")
    label = story.get("label")
    if not isinstance(label, str) or not 1 <= len(label.strip()) <= 48:
        raise ValueError("label must contain 1–48 characters")
    cues = story.get("cues")
    if not isinstance(cues, list) or not 1 <= len(cues) <= 8:
        raise ValueError("provide 1–8 cues")
    validated = []
    previous = -1.0
    for index, cue in enumerate(cues):
        if not isinstance(cue, dict):
            raise ValueError("each cue must be an object")
        at, text = cue.get("at"), cue.get("text")
        if isinstance(at, bool) or not isinstance(at, (int, float)):
            raise ValueError("cue.at must be a number of seconds")
        if not math.isfinite(at) or not previous < at < duration or (index == 0 and at != 0):
            raise ValueError("cues must start at zero and increase within the recording")
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 90:
            raise ValueError("cue.text must contain 1–90 characters")
        aligned = round(float(at) * 25) / 25
        if (validated and aligned <= validated[-1]["at"]) or aligned >= duration:
            raise ValueError("each cue needs its own frame at 25 fps")
        validated.append({"at": aligned, "text": text})
        previous = at
    return validated


def card_html(label: str, text: str, index: int, total: int) -> str:
    return f"""<!doctype html><html><meta charset="utf-8"><style>
*{{box-sizing:border-box}}body{{margin:0;background:#08101e;color:#f1f5ff;
font-family:system-ui,sans-serif;width:1280px;height:720px;padding:20px 64px}}
.meta{{display:flex;justify-content:space-between;color:#9caed0;font-size:16px;
letter-spacing:.07em}}h1{{font-size:36px;line-height:1.14;font-weight:650;
margin:12px 0 0;max-height:84px;overflow:hidden;overflow-wrap:anywhere}}
.step{{color:#77e0b4}}.line{{position:absolute;left:0;top:138px;height:3px;
width:{100 * (index + 1) / total:g}%;background:#77e0b4}}
</style><div class="meta"><span>{html.escape(label)}</span>
<span class="step">{index + 1:02d} / {total:02d}</span></div>
<h1>{html.escape(text)}</h1><div class="line"></div></html>"""


def render_cards(story: dict, cues: list[dict], directory: Path) -> list[Path]:
    from playwright.sync_api import sync_playwright

    cards = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 720}, service_workers="block"
        )
        context.route("**/*", lambda route: route.abort())
        page = context.new_page()
        for index, cue in enumerate(cues):
            page.set_content(card_html(story["label"], cue["text"], index, len(cues)))
            # CSS line-height can round scrollHeight one pixel above clientHeight.
            if page.locator("h1").evaluate("e => e.scrollHeight > e.clientHeight + 1"):
                raise ValueError("caption is too tall; shorten its text")
            path = directory / f"card-{index}.png"
            page.screenshot(path=str(path))
            cards.append(path)
        context.close()
        browser.close()
    return cards


def compose_command(
    video: Path, cards: list[Path], cues: list[dict], duration: float, output: Path
) -> list[str]:
    command = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(video)]
    filters = []
    for index, card in enumerate(cards):
        end = cues[index + 1]["at"] if index + 1 < len(cues) else duration
        length = end - cues[index]["at"]
        command.extend(["-loop", "1", "-framerate", "25", "-i", str(card)])
        filters.append(f"[{index + 1}:v]trim=duration={length:.6f},setpts=PTS-STARTPTS[c{index}]")
    inputs = "".join(f"[c{i}]" for i in range(len(cards)))
    filters.append(f"{inputs}concat=n={len(cards)}:v=1:a=0[deck]")
    filters.append(
        "[0:v]scale=1024:576:force_original_aspect_ratio=decrease,"
        "pad=1024:576:(ow-iw)/2:(oh-ih)/2:color=0x08101e[movie]"
    )
    filters.append("[deck][movie]overlay=128:144:shortest=1[v]")
    command.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[v]",
            "-t",
            f"{duration:.6f}",
            "-r",
            "25",
            "-c:v",
            "libx264",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            str(output),
        ]
    )
    return command


def present(run_directory: Path, story_path: Path, output: Path) -> dict:
    if output.exists() or output.is_symlink():
        raise ValueError("output already exists; choose a new directory")
    video = run_directory / "demo-forge.mp4"
    report = run_directory / "run.json"
    if any(path.is_symlink() or not path.is_file() for path in (video, report)):
        raise ValueError("a local Demo Forge MP4 and run.json are required")
    run = json.loads(report.read_text())
    if (
        not isinstance(run, dict)
        or run.get("status") != "success"
        or run.get("scope") != "experiments/demo-forge"
    ):
        raise ValueError("only a successful Demo Forge run can be presented")
    media = probe(video)
    duration = float(media["format"]["duration"])
    story = json.loads(story_path.read_text())
    cues = validate_story(story, duration)
    source_hash = hashlib.sha256(video.read_bytes()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".demo-forge-story-", dir=output.parent))
    try:
        cards = render_cards(story, cues, stage)
        destination = stage / "explainer.mp4"
        subprocess.run(
            compose_command(video, cards, cues, duration, destination),
            check=True,
            capture_output=True,
            text=True,
            timeout=90,
        )
        rendered = probe(destination)
        actual_duration = float(rendered["format"]["duration"])
        if abs(actual_duration - duration) > 0.08:
            raise ValueError("rendered duration differs from the source")
        result = {
            "status": "success",
            "scope": "experiments/demo-forge/present",
            "source_sha256": source_hash,
            "source_duration_seconds": duration,
            "duration_seconds": actual_duration,
            "label": story["label"],
            "cues": cues,
            "caption_source": "author-written, not verified by the app assertions",
            "caption_timing": "rounded to the nearest frame at 25 fps",
            "editing": "fit original recording without crop or speed changes; no audio",
            "artifacts": {"mp4": "explainer.mp4"},
        }
        if hashlib.sha256(video.read_bytes()).hexdigest() != source_hash:
            raise ValueError("source changed while rendering")
        (stage / "presentation.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        )
        for card in cards:
            card.unlink()
        # Claim the destination exclusively before publishing either file.
        # presentation.json is linked last and acts as the completion marker.
        if output.exists() or output.is_symlink():
            raise ValueError("output appeared while rendering; choose a new directory")
        output.mkdir()
        published = []
        try:
            for name in ("explainer.mp4", "presentation.json"):
                target = output / name
                target.hardlink_to(stage / name)
                published.append(target)
        except OSError:
            for target in published:
                target.unlink()
            if not any(output.iterdir()):
                output.rmdir()
            raise
        return result
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--story", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = present(args.run_dir, args.story, args.output)
    except Exception as error:  # Include missing browser dependencies in the failure report.
        print(json.dumps({"status": "failed", "error": str(error)}))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
