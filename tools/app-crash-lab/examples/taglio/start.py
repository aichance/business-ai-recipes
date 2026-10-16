#!/usr/bin/env python3
"""Start a fresh, disposable WordPress/Taglio fixture on IPv4 loopback only."""

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import socket
import subprocess
import urllib.request
import zipfile


HERE = Path(__file__).resolve().parent
ARCHIVES = (
    (
        "wordpress-7.1.3.zip",
        "https://wordpress.org/wordpress-7.1.3.zip",
        "eb58a90ed55147f90f7bd55d0d3334960a69b7e8a4cc142c8ddfea8965218227",
    ),
    (
        "taglio-1.0.1.zip",
        "https://downloads.wordpress.org/plugin/taglio-smart-tag-finder.1.0.1.zip",
        "4e9c1334c0faba92715ab4a67df49a9bd826db7a6544dab05a5fc84bfaa5a16a",
    ),
)


def acquire(url, destination, digest):
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(50 * 1024 * 1024 + 1)
    if len(data) > 50 * 1024 * 1024:
        raise RuntimeError("Archive exceeds the fixture's 50 MiB limit")
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError("Official archive hash changed; review before using it")
    destination.write_bytes(data)


def extract(archive, destination):
    with zipfile.ZipFile(archive) as source:
        members = source.infolist()
        if len(members) > 10000 or sum(m.file_size for m in members) > 200 * 1024 * 1024:
            raise RuntimeError("Archive exceeds the fixture extraction limits")
        for member in members:
            path = PurePosixPath(member.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in member.filename:
                raise RuntimeError("Unsafe archive path")
            if (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise RuntimeError("Archive symlinks are not supported")
        source.extractall(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=54814)
    parser.add_argument("--state", type=Path, help="New empty output path; existing paths are refused")
    parser.add_argument("--node", default="node", help="Existing Node24.18+ executable")
    args = parser.parse_args()
    if os.name != "posix":
        parser.error("This disposable fixture launcher supports POSIX macOS/Linux only; Windows-native is not supported")
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port between 1024 and 65535")
    node = shutil.which(args.node)
    npm = shutil.which("npm")
    if not node or not npm:
        parser.error("Existing Node24.18+ and npm11.16+ are required; nothing is installed globally")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if tuple(map(int, version.lstrip("v").split(".")[:3])) < (24, 18, 0):
        parser.error("Pinned Playground dependencies require Node24.18+; the App Crash Lab runner itself remains Node22+")
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("127.0.0.1", args.port))
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    workspace = HERE.parents[1] if HERE.parent.name == "examples" and HERE.parents[1].name == "app-crash-lab" else HERE.parent
    state = (args.state or workspace / ".crash-lab" / ("taglio-" + stamp)).resolve()
    state.mkdir(parents=True, exist_ok=False)
    for directory in ("tmp", "npm-cache", "runtime", "site"):
        (state / directory).mkdir()
    for name, url, digest in ARCHIVES:
        acquire(url, state / name, digest)
    extract(state / ARCHIVES[0][0], state / "site")
    plugins = state / "site/wordpress/wp-content/plugins"
    extract(state / ARCHIVES[1][0], plugins)
    content = state / "site/wordpress/wp-content"
    (content / "mu-plugins").mkdir(exist_ok=True)
    shutil.copy2(HERE / "classic-editor.php", content / "mu-plugins/aclf-fixture.php")
    shutil.copy2(HERE / "fixture-reset.php", content / "aclf-reset.php")
    for name in ("package.json", "package-lock.json"):
        shutil.copy2(HERE / name, state / "runtime" / name)
    (state / "empty-npm-global.npmrc").write_text("")
    env = {k: v for k, v in os.environ.items() if not k.lower().startswith("npm_config_")}
    for key in ("GH_TOKEN", "GITHUB_TOKEN", "NODE_AUTH_TOKEN", "NPM_TOKEN"):
        env.pop(key, None)
    env.update({
        "PATH": str(Path(node).parent) + os.pathsep + env.get("PATH", ""),
        "TMPDIR": str(state / "tmp"),
        "npm_config_userconfig": os.devnull,
        "npm_config_globalconfig": str(state / "empty-npm-global.npmrc"),
        "npm_config_cache": str(state / "npm-cache"),
        "npm_config_registry": "https://registry.npmjs.org/",
        "npm_config_engine_strict": "true",
        "DO_NOT_TRACK": "1",
        "CI": "1",
    })
    npm_version = subprocess.check_output([npm, "--version"], env=env, text=True).strip()
    if tuple(map(int, npm_version.split(".")[:3])) < (11, 16, 0):
        parser.error("Pinned Playground dependencies require npm11.16+")
    subprocess.run([npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
                   cwd=state / "runtime", env=env, check=True)
    blueprint = {
        "preferredVersions": {"php": "8.3", "wp": "7.1.3"},
        "landingPage": "/wp-admin/post.php?post=100&action=edit",
        "login": True,
        "constants": {"DISABLE_WP_CRON": True, "AUTOMATIC_UPDATER_DISABLED": True,
                      "DISALLOW_FILE_MODS": True},
        "steps": [
            {"step": "activatePlugin", "pluginPath": "taglio-smart-tag-finder/taglio-smart-tag-finder.php"},
            {"step": "runPHP", "code": (HERE / "seed.php").read_text()},
        ],
    }
    (state / "blueprint.json").write_text(json.dumps(blueprint))
    env["NODE_OPTIONS"] = "--import=" + (HERE / "loopback-only.mjs").as_uri()
    command = [node, str(state / "runtime/node_modules/@wp-playground/cli/wp-playground.js"),
               "server", f"--port={args.port}", f"--site-url=http://127.0.0.1:{args.port}",
               "--php=8.3", "--wp=7.1.3", "--workers=1",
               "--wordpress-install-mode=install-from-existing-files",
               "--mount-dir-before-install", str(state / "site/wordpress"), "/wordpress",
               "--blueprint=" + str(state / "blueprint.json"), "--login"]
    print("Synthetic fixture output:", state, flush=True)
    print("Starting: wait for Playground's 'Ready! WordPress is running' line before opening the editor or running tests.", flush=True)
    print(f"Once ready, local editor: http://127.0.0.1:{args.port}/wp-admin/post.php?post=100&action=edit", flush=True)
    print("Stop with Ctrl-C. Only this new fixture's post 100 is reset by the test.", flush=True)
    child = subprocess.Popen(command, env=env, start_new_session=True)
    def stop_child(_signum, _frame):
        raise KeyboardInterrupt
    previous_term = signal.signal(signal.SIGTERM, stop_child)
    try:
        return child.wait()
    except KeyboardInterrupt:
        return 130
    finally:
        signal.signal(signal.SIGTERM, previous_term)
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGINT)
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=10)


if __name__ == "__main__":
    raise SystemExit(main())
