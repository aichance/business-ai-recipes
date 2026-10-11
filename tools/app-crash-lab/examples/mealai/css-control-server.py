"""Serve a prepared MealAI copy, optionally withholding one CSS response."""

import argparse
import functools
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

FILES = {
    "/index.html": "text/html; charset=utf-8",
    "/css/style.css": "text/css; charset=utf-8",
    "/css/tailwind-local.css": "text/css; charset=utf-8",
    "/js/app.js": "text/javascript; charset=utf-8",
    "/js/calculator.js": "text/javascript; charset=utf-8",
    "/js/data.js": "text/javascript; charset=utf-8",
}
CSS = "/css/tailwind-local.css"


class Handler(BaseHTTPRequestHandler):
    def __init__(self, *args, files, withheld, **kwargs):
        self.files = files
        self.withheld = withheld
        super().__init__(*args, **kwargs)

    def do_GET(self):
        self.respond(send_body=True)

    def do_HEAD(self):
        self.respond(send_body=False)

    def respond(self, *, send_body):
        path = urlsplit(self.path).path
        if path == "/":
            path = "/index.html"
        if path not in self.files or (self.withheld and path == CSS):
            self.send_error(404, "Asset absent or deliberately withheld by local experiment")
            return
        data = self.files[path]
        self.send_response(200)
        self.send_header("Content-Type", FILES[path])
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if send_body:
            self.wfile.write(data)

    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "app", type=Path, help="Disposable app prepared with prepare-local.py and built CSS"
    )
    parser.add_argument("--port", type=int, default=54198, help="Loopback-only local port")
    parser.add_argument(
        "--withhold-css", action="store_true", help="Return 404 only for css/tailwind-local.css"
    )
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port from 1024 through 65535.")
    root = args.app.resolve()
    files = {}
    for path in FILES:
        source = (root / path.lstrip("/")).resolve()
        if not source.is_relative_to(root) or not source.is_file():
            parser.error(f"Missing or out-of-directory asset: {path}")
        files[path] = source.read_bytes()
    if not files[CSS].strip():
        parser.error("Build css/tailwind-local.css before running this experiment.")

    # Snapshot the named assets once; do not serve other files from this directory.
    handler = functools.partial(Handler, files=files, withheld=args.withhold_css)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    try:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        mode = "withheld" if args.withhold_css else "available"
        print(f"CSS {mode}: http://127.0.0.1:{args.port}", flush=True)
        print("Ctrl+C stops the local server. Only six named app assets are served.", flush=True)
        stop.wait()
    finally:
        if thread.is_alive():
            server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
