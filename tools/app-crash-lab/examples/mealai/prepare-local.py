"""Prepare a disposable MealAI copy with local Tailwind assets; no network calls."""

import argparse
import hashlib
from pathlib import Path
import re
import shutil


HASHES = {
    "index.html": "b0b1e52303214ba2f0fc20ab84063377c18756144652518c90fbe2c9e2a38313",
    "js/app.js": "ed8b80bcc6950e14096ee5b00ee96196ccdd96141b29432c725ec7800e0fd3e7",
    "js/data.js": "d1dbe159353b8f509443fd363a015f38742b3fa75647804b41c233c12f355568",
    "js/calculator.js": "77fdebb39c70376daa048ce5d998dce4655928388e60cd36d470ea22dec9f1fc",
    "css/style.css": "608b2a4ee3c2b536e2241bdef7296fcd07f15d6d280d788d9198e5d47de90315",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Your disposable MealAI source root")
    parser.add_argument("output", type=Path, help="A new directory; existing paths are refused")
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    if output.exists():
        parser.error("Output already exists. Choose a new directory.")
    for relative, expected in HASHES.items():
        path = source / relative
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            parser.error(f"Source differs from the tested snapshot: {relative}. Review it first.")

    html = (source / "index.html").read_text(encoding="utf-8")
    cdn = '<script src="https://cdn.tailwindcss.com"></script>'
    theme = re.search(r"<script>\s*tailwind\.config = (\{.*?\})\s*</script>", html, re.S)
    if html.count(cdn) != 1 or theme is None:
        parser.error("Expected Tailwind setup not found.")
    # The exact HTML hash above is checked before copying its theme into CLI config.
    config = 'module.exports = { content: ["./index.html", "./js/*.js"], ...'
    config += theme.group(1) + " };\n"
    html = html.replace(cdn, '<link rel="stylesheet" href="css/tailwind-local.css">')
    html = html.replace(theme.group(0), "<!-- Tailwind theme moved to local CLI config. -->")

    output.mkdir(parents=True, exist_ok=False)
    for relative in HASHES:
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, target)
    (output / "index.html").write_text(html, encoding="utf-8")
    (output / "tailwind.config.cjs").write_text(config, encoding="utf-8")
    (output / "tailwind-input.css").write_text(
        "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n", encoding="utf-8"
    )
    print(f"Prepared {output}. Build Tailwind CSS there using the README command, then serve it.")


if __name__ == "__main__":
    main()
