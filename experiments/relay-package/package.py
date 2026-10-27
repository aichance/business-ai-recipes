"""Repackage the immutable common ZIP for npm exec; never rebuild tool source."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import stat
import tarfile
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
STEM = "agent-relay-check-v0.1.4"
ENTRY = f"{STEM}-npx1"
ZIP_SHA256 = "d21cf2f75c069b244b212f8988085d952b2159e4e07842ed806235c52998dcda"
LAUNCHER = b"""#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
// npm's bin is a symlink. The unchanged core expects its real file in argv[1].
process.argv[1] = fileURLToPath(new URL('./common/cli.mjs', import.meta.url));
await import('./common/cli.mjs');
"""


def package_bytes() -> bytes:
    source = (ROOT / "docs" / f"{STEM}.zip").read_bytes()
    if hashlib.sha256(source).hexdigest() != ZIP_SHA256:
        raise ValueError("common ZIP differs from the pinned v0.1.4 source")
    tar = io.BytesIO()
    with (
        ZipFile(io.BytesIO(source)) as archive,
        tarfile.open(fileobj=tar, mode="w", format=tarfile.USTAR_FORMAT) as output,
    ):
        members = archive.infolist()
        if len(members) != 24 or len({m.filename for m in members}) != 24:
            raise ValueError("expected exactly 24 unique common files")
        for member in sorted(members, key=lambda item: item.filename):
            path = PurePosixPath(member.filename)
            if (
                path.parts[0] != "agent-relay-check"
                or len(path.parts) < 2
                or ".." in path.parts
                or member.is_dir()
                or stat.S_ISLNK(member.external_attr >> 16)
            ):
                raise ValueError("unexpected archive member")
            content = archive.read(member)
            name = path.relative_to("agent-relay-check").as_posix()
            if name == "package.json":
                manifest = json.loads(content)
                if (
                    manifest["version"] != "0.1.4"
                    or manifest["bin"] != {"agent-relay-check": "cli.mjs"}
                    or manifest.get("dependencies")
                    or set(manifest.get("scripts", {})) != {"test"}
                ):
                    raise ValueError("unexpected package contract")
            entry = tarfile.TarInfo(f"package/common/{name}")
            entry.size = len(content)
            entry.mode = 0o755 if name == "cli.mjs" else 0o644
            output.addfile(entry, io.BytesIO(content))
        manifest = {
            "name": "@aichance/agent-relay-check-entry",
            "version": "0.1.4-npx.1",
            "private": True,
            "type": "module",
            "bin": {"agent-relay-check": "launcher.mjs"},
            "engines": {"node": ">=22"},
            "license": "MIT",
            "common_zip_sha256": ZIP_SHA256,
        }
        for name, content in [
            ("package.json", (json.dumps(manifest, indent=2) + "\n").encode()),
            ("launcher.mjs", LAUNCHER),
        ]:
            entry = tarfile.TarInfo(f"package/{name}")
            entry.size = len(content)
            entry.mode = 0o755 if name == "launcher.mjs" else 0o644
            output.addfile(entry, io.BytesIO(content))
    result = io.BytesIO()
    with gzip.GzipFile(fileobj=result, mode="wb", filename="", mtime=0) as stream:
        stream.write(tar.getvalue())
    return result.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify without writing")
    args = parser.parse_args()
    payload = package_bytes()
    target = ROOT / "docs" / f"{ENTRY}.tgz"
    checksum = f"{hashlib.sha256(payload).hexdigest()}  {target.name}\n".encode()
    sidecar = target.with_suffix(".tgz.sha256")
    if args.check:
        if target.read_bytes() != payload or sidecar.read_bytes() != checksum:
            raise ValueError("generated tarball or checksum differs")
    else:
        target.write_bytes(payload)
        sidecar.write_bytes(checksum)
    print(
        json.dumps(
            {
                "common_files": 24,
                "entry_files": 2,
                "bytes": len(payload),
                "sha256": checksum.decode().split()[0],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
