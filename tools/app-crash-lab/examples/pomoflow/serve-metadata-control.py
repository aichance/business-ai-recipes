"""Deliberately alter one synthetic task timestamp on reload; loopback only."""

import argparse
import functools
import http.server
from pathlib import Path
from urllib.parse import urlsplit

FAULT = """<script>
if (sessionStorage.getItem('acl-deliberate-metadata-control') === 'ready') {
  const tasks = JSON.parse(localStorage.getItem('pomodoro_tasks') || '[]');
  const deleted = tasks.find(task => task.title === 'ACL deleted task'
    && Number.isFinite(task.deletedAt) && Number.isFinite(task.updatedAt));
  if (deleted) {
    deleted.updatedAt += 1000;
    localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
  }
} else sessionStorage.setItem('acl-deliberate-metadata-control', 'ready');
</script>"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dist", type=Path, help="Disposable Pomoflow build directory")
    parser.add_argument("--port", type=int, default=3001)
    args = parser.parse_args()
    dist = args.dist.resolve(strict=True)
    if not (dist / "index.html").is_file():
        parser.error("The build directory must contain index.html")
    if not 1024 <= args.port <= 65535:
        parser.error("Choose an unprivileged port between 1024 and 65535")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if urlsplit(self.path).path == "/":
                payload = (
                    (dist / "index.html").read_text().replace("</head>", FAULT + "</head>").encode()
                )
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(payload)
                return
            return super().do_GET()

    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", args.port), functools.partial(Handler, directory=str(dist))
    )
    print(f"DELIBERATE METADATA FAULT at http://127.0.0.1:{args.port}; not an app bug", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
