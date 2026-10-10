# Check a JSON importer: Tunoron

[Tunoron](https://tunoron.vercel.app/) is a browser music app that can import
song JSON and save sketches locally. This example runs two checks against an
unchanged local copy of its public HTML. It needs **App Crash Lab 0.2.0+**.
It is our compatibility test, not adoption or endorsement by Tunoron's author.

| Check | Operation | Values that must survive |
| --- | --- | --- |
| Reload | Import a synthetic two-note song, wait for persistence, reload | Current song ID and complete saved song JSON |
| Rejected update | Import the same good song, then malformed JSON; confirm the error | The same ID and complete saved song JSON |

The contract explicitly selects English through the app's Settings, so the
rejection text is independent of the machine's default language. Each check
starts in a fresh browser context. No existing browser profile, song collection,
microphone, audio recording or API key is used.

## Start an isolated local copy

If you maintain the app, serve your development build on loopback and use its
origin in the command below. To reproduce our public-HTML compatibility check,
from the App Crash Lab package directory, in a separate terminal:

```sh
mkdir -p .crash-lab/tunoron-app
curl --fail --location https://tunoron.vercel.app/ -o .crash-lab/tunoron-app/index.html
python3 -m http.server 4398 --bind 127.0.0.1 --directory .crash-lab/tunoron-app
```

The download is from the author's site; we do not bundle or redistribute the
application. The current site may change. Our tested snapshot, downloaded on
2026-10-10, was 958,585 bytes with SHA-256:

```text
3ad96ab1e714750192536fa53759ec22d86367612055645143023de6cb7764e4
```

Only the chosen loopback origin is allowed during the browser checks. External
services and service workers are blocked. These operations work without audio
playback or the site's analytics script. Stop the local server with Ctrl+C
after the following commands finish.

## Run both checks and the generated tests

Install the package dependencies and Chromium using the main README first.
With the app still running, from this package directory:

```sh
node cli.mjs run examples/tunoron.json --base-url http://127.0.0.1:4398 --out .crash-lab/tunoron-first-run
npx playwright test --config .crash-lab/tunoron-first-run/playwright.config.mjs
```

Open `.crash-lab/tunoron-first-run/index.html` for the snapshots and verdicts.
Use a new output directory for a new CLI run. The generated test embeds the
chosen port; keep that server running when replaying it.

Against the snapshot above, both CLI checks passed and both generated tests
passed on 2026-10-10. Each baseline had two notes (MIDI pitches 60 and 64),
tempo 145 and the name `Crash Lab synthetic melody`. The full saved record,
including its generated ID and other fields, matched after each operation.

## Adapt the useful part to another app

Copy [`tunoron.json`](tunoron.json), then replace its selectors, input format,
storage names and rejection message with those from your app:

- `setFile` provides literal UTF-8 synthetic contents to the file input. It
  does not read a path from your machine. The malformed test input is deliberate.
- `keyFrom: "fushi.cur"` reads the current song ID; `keyPrefix: "fushi.p."`
  finds its saved record. The pointer is resolved again for every observation.
- Observe both the full record and its pointer. Equal content under a different
  selected ID should not silently count as preserving this song.
- The expected name, tempo and notes wait for the app's delayed save before
  taking a baseline. A missing JSON path is retried only within the configured
  timeout; if still missing, the result is inconclusive, not a pass.

The status message is a rejection signal, not saved state. A changing recent
items timestamp is outside this contract. We check stored JSON, not rendered
score pixels, playback fidelity, MIDI/WAV round trips, all possible malformed
files or IndexedDB audio clips. The selected values are sampled for 500 ms
after a match; this is not proof against every transient write or later change.

The separate automated tests use an authored importer with deliberate reload,
rejection and pointer faults to verify failure detection. We did not alter
Tunoron to manufacture a failure or claim that these defects exist in it.

If a later version changes the storage layout or UI, inspect the new behavior
and update the contract. Do not weaken expected values to force a pass.
