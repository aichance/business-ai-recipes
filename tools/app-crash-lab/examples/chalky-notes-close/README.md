# Chalky: a last edit can disappear when notes close quickly

A saved task is not a sufficient baseline if the last note edit never reached
storage. While configuring App Crash Lab for [Chalky](https://chalky.town), our
normal-save setup reopened an empty note. The CLI returned **INCONCLUSIVE,
phase `baseline`**, before testing reload. It did not report a reload failure
or a passing preservation check.

This small diagnostic uses a **real keyboard edit of an already saved note**
and compares an immediate close with a 350ms delayed close. It targets the
unmodified public source at
[`4bf2b174243b3c20e44ef3e7d612de410f44b4b1`](https://tangled.org/tyler.fun/chalky.town/commit/4bf2b174243b3c20e44ef3e7d612de410f44b4b1).
No Chalky source is bundled here. This is our local finding, not author
confirmation, endorsement or independent use of App Crash Lab.

## Run the two-condition diagnostic

Use a disposable local Chalky development copy. Do not sign in or connect a
PDS. Start it on `127.0.0.1:54196`. The pinned source uses this command:

```sh
npx --yes --package=pnpm@10.34.6 pnpm install --frozen-lockfile --ignore-scripts
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 54196 --strictPort
```

The pnpm version is explicit because a newer global pnpm rejected the source's
existing lockfile/overrides configuration. The source and lockfile were not
changed to make it run. See the [upstream source](https://tangled.org/tyler.fun/chalky.town)
for the app and its terms; this folder supplies our diagnostic only.

Download the [small diagnostic ZIP](https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/chalky-notes-close.zip),
extract it, then use a separate terminal in **the extracted folder**, with
Node 22+. A checkout of App Crash Lab is not required:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm test
```

The test opens a fresh browser context for each condition. It saves a
synthetic baseline, closes and reopens it, then selects the note's text and
types `x` using keyboard events. It confirms the editor displays `x`, closes,
reopens and reloads. Both checks require the note still to be `x`.

On the pinned source, our run produced:

| Condition | Measured edit-to-close interval | After reopen | After reload | Assertion |
| --- | ---: | --- | --- | --- |
| No added delay | 42ms | `Synthetic baseline` | `Synthetic baseline` | FAIL |
| Add 350ms | 377ms | `x` | `x` | PASS |

**One failure is the expected reproduction on that revision**, so `npm test`
exits nonzero. It is not an installation failure. Each test prints its measured
interval and observed strings. Screenshots and traces go to `test-results/`;
copy them elsewhere before rerunning if you need to keep them. With a corrected
app, both assertions should pass. We have not implemented or verified that fix.

Timing depends on the machine. If an immediate close takes 200ms or more,
that run may not exercise the suspected window. The fixed delay is an explicit
**diagnostic control**, not a proposed product fix or a reliable save-completion
signal. The two observed outcomes do not establish an exact threshold.

## Why this is worth checking

In the inspected source, `MarkdownNotes.svelte` receives serialized note text
through Milkdown's `markdownUpdated` listener. `DetailsPanel.svelte` commits
that bound value on blur/close. The installed Milkdown listener debounces the
callback for 200ms and cancels it on editor destruction. This is consistent
with an immediate close committing an older value. It remains a source-based
explanation; the public site and other revisions were not proven to share
this exact failure.

A potential fix should flush/read the current editor document before committing
and destroying it. Replacing this regression with an arbitrary wait would hide
the behavior instead of protecting the last edit. We did not modify upstream.

## The App Crash Lab baseline that exposed it

[`baseline.json`](baseline.json) creates a synthetic task with a note, an
incomplete child and a selected color, then closes/reopens the details before
running the reload check. On the same source, App Crash Lab 0.3.0 could not
establish the expected note and returned `INCONCLUSIVE` in `baseline`.

With the local app still running, in this folder:

```sh
npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.3.0/aichance-app-crash-lab-0.3.0.tgz app-crash-lab run baseline.json --out .crash-lab/chalky-first
```

Choose a fresh output directory each time. This contract does not include a
sleep to manufacture a successful baseline. On faster/slower environments the
observed timing can differ; inspect `phase`, `status` and the actual note.

## Scope

Verified locally on macOS / Node 22.16.0 / Playwright 1.64.0 / Chromium on
2026-10-11. Only one anonymous synthetic task is involved. Network requests
outside the configured loopback origin and service workers are blocked.
No authentication, PDS sync, offline startup, multiple tabs, rejected import,
quota, recurrence or raw IndexedDB equality is tested. This is a note-close
regression, not a machine-crash durability or security test.

AI-operated project under human ownership. [App Crash Lab](https://github.com/aichance/business-ai-recipes/tree/main/tools/app-crash-lab)
keeps normal-save failures separate from preservation failures.
