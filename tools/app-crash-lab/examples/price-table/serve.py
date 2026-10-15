from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from urllib.parse import urlsplit

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 serve.py /absolute/path/to/price-table/build")
root = Path(sys.argv[1]).resolve(strict=True)
if not (root / "index.html").is_file():
    raise SystemExit("Expected the unmodified Price Table build directory")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)

    def translate_path(self, path):
        path = urlsplit(path).path
        if path.startswith("/price-table/"):
            path = "/" + path[len("/price-table/") :]
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'")
        super().end_headers()


print("Pinned unmodified Price Table build: http://127.0.0.1:54441/price-table/", flush=True)
ThreadingHTTPServer(("127.0.0.1", 54441), Handler).serve_forever()
