#!/usr/bin/env python3
"""Small localhost app used by the first Demo Forge recording."""

from __future__ import annotations

import argparse
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "app" / "index.html"
STATE = {
    "runs": 0,
    "status": "Ready to launch",
    "last_name": None,
    "last_result": None,
}
STATE_LOCK = threading.Lock()


def slugify(value: str) -> str:
    return quote(re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "launch-kit")


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "DemoForge/0.1"

    def log_message(self, format: str, *args: object) -> None:
        return

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/state":
            with STATE_LOCK:
                self.send_json(dict(STATE))
            return
        if self.path in {"/", "/index.html"}:
            body = INDEX.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_json({"error": "not_found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/launch":
            self.send_json({"error": "not_found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length) or b"{}")
            name = str(request.get("name", "")).strip()
        except (ValueError, json.JSONDecodeError):
            self.send_json({"error": "invalid_json"}, 400)
            return
        if not name:
            self.send_json({"error": "name_required"}, 400)
            return

        with STATE_LOCK:
            STATE["runs"] += 1
            STATE["status"] = "Ready to share"
            STATE["last_name"] = name
            STATE["last_result"] = {
                "name": name,
                "share_url": f"http://localhost/demo/{slugify(name)}",
                "summary": "Launch checklist completed",
            }
            result = dict(STATE["last_result"])
        self.send_json(result)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Demo Forge localhost app")
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), DemoHandler)
    host, port = server.server_address
    print(f"DEMO_FORGE_READY pid={os.getpid()} port={port}", flush=True)
    try:
        server.serve_forever(poll_interval=0.05)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
