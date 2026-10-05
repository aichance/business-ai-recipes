#!/usr/bin/env python3
"""Small second localhost app used to test Demo Forge input portability."""

from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "index.html"
STATE = {"saves": 0, "status": "Ready to save", "last_title": None}


class BriefHandler(BaseHTTPRequestHandler):
    server_version = "BriefApp/0.1"

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
        if self.path == "/":
            body = INDEX.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/api/state":
            self.send_json(dict(STATE))
            return
        self.send_json({"error": "not_found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/save":
            self.send_json({"error": "not_found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length) or b"{}")
            title = str(request.get("title", "")).strip()
        except (ValueError, json.JSONDecodeError):
            self.send_json({"error": "invalid_json"}, 400)
            return
        if not title:
            self.send_json({"error": "title_required"}, 400)
            return
        STATE["saves"] += 1
        STATE["status"] = "Saved"
        STATE["last_title"] = title
        self.send_json({"title": f"{title} is ready", "summary": "Brief saved locally"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the alternate Demo Forge localhost app")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), BriefHandler)
    _, port = server.server_address
    print(f"DEMO_FORGE_READY pid={os.getpid()} port={port}", flush=True)
    try:
        server.serve_forever(poll_interval=0.05)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
