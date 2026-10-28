"""Create deterministic source ZIP and npm-exec tarball; no network or installation."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse
import gzip
import hashlib
import io
import json
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FILES = [
    "package.json", "AGENTS.md", "README.md", "cli.mjs", "package.py",
    "lib/config.mjs", "lib/probe.mjs", "lib/report.mjs", "test/probe.test.mjs", "test/cli.test.mjs",
    "fixtures/schema.sql", "fixtures/run.mjs", "examples/test-config.json", "examples/env.example",
    "test/session.test.mjs", "examples/test-session-config.json", "examples/session-env.example",
]
STEM = "leak-regression-lab-v0.1.3"


def build():
    sources = {name: (HERE / name).read_bytes() for name in FILES}
    sources["LICENSE"] = (ROOT / "LICENSE").read_bytes()
    payload = io.BytesIO()
    with ZipFile(payload, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(sources.items()):
            entry = ZipInfo("leak-regression-lab/" + name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = (0o100755 if name == "cli.mjs" else 0o100644) << 16
            archive.writestr(entry, content)
    tar = io.BytesIO()
    with tarfile.open(fileobj=tar, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, content in sorted(sources.items()):
            entry = tarfile.TarInfo("package/" + name)
            entry.size = len(content)
            entry.mode = 0o755 if name == "cli.mjs" else 0o644
            archive.addfile(entry, io.BytesIO(content))
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb", filename="", mtime=0) as archive:
        archive.write(tar.getvalue())
    return {"zip": payload.getvalue(), "tgz": compressed.getvalue()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    results = []
    for kind, data in build().items():
        target = ROOT / "docs" / f"{STEM}.{kind}"
        sidecar = target.with_suffix(target.suffix + ".sha256")
        digest = hashlib.sha256(data).hexdigest()
        checksum = f"{digest}  {target.name}\n".encode()
        if args.check:
            assert target.read_bytes() == data, target.name
            assert sidecar.read_bytes() == checksum, sidecar.name
        else:
            target.write_bytes(data)
            sidecar.write_bytes(checksum)
        results.append({"format": kind, "files": len(FILES) + 1, "bytes": len(data), "sha256": digest})
    print(json.dumps(results))


if __name__ == "__main__":
    main()
