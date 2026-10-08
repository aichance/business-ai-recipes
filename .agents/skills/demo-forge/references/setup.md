# Setup for the bundled recorder

The paths below assume the skill is installed at `.agents/skills/demo-forge`
inside the user's app project, and commands start in that project. If it is
installed elsewhere, resolve `scripts/forge.py` relative to this skill's
SKILL.md and use its absolute path. Do not look for another repository.

Use Python 3.11+ and FFmpeg on PATH for recording, and ffprobe for the final
media inspection. Check `ffprobe -version` separately; the recorder's doctor
checks ffmpeg but does not check ffprobe. Playwright and its Chromium belong
in a project virtual environment. First inspect an existing environment; do
not overwrite it or install into system Python. If setup is needed and
authorized, this macOS/Linux command shape creates a local environment:

```bash
python3 -m venv .demo-forge-venv
.demo-forge-venv/bin/python -m pip install playwright==1.63.0
.demo-forge-venv/bin/python -m playwright install chromium
.demo-forge-venv/bin/python .agents/skills/demo-forge/scripts/forge.py --doctor --narrate
```

Linux may require additional Playwright system dependencies. Follow the
doctor's specific result; do not claim readiness if a requirement is missing.
Ordinary recording needs Playwright 1.48+; chapter recording needs 1.59+.
The project has tested 1.63.0 on macOS/Chromium. Other platforms are not proven
by those tests. `--narrate` adds authored chapter text, not generated speech.

If the user wants a synthetic trial without an app URL, the bundled server
and operation start and stop together:

```bash
.demo-forge-venv/bin/python .agents/skills/demo-forge/scripts/forge.py \
  --narrate \
  --operation .agents/skills/demo-forge/scripts/operation.narrated.json \
  --tail-seconds 3 \
  --output .demo-forge-output/first-run
```

For the user's running app, add `--url http://127.0.0.1:PORT/` and provide its
own operation JSON. A fresh browser can access only HTTP on that loopback
port. External APIs, logged-in profiles and unsupported actions do not fit.
URL mode leaves the app running. The optional `--server` mode is for a Python
server that emits the documented `DEMO_FORGE_READY` line; do not invent this
contract for an arbitrary application.

Keep user operation JSON and media outside the installed skill. Add those
output folders to the app's ignore rules when authorized; never commit real
user inputs by accident. Do not overwrite unrelated output. Require the new
run.json to pass and inspect the actual final frame before returning the MP4,
GIF, cover and rerun command. Browser Studio at
https://aichance.github.io/business-ai-recipes/studio.html can annotate an
existing video but does not provide the recorder's UI checks.
