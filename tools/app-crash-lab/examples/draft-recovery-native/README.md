# Keep a newer source draft when cleaning up its restored copy

This single [Node test file](draft-recovery-cleanup.test.mjs) exercises the original `DraftGuard` browser module used by [Simon's Wanderlust](https://github.com/laboef1900/simonswanderlust). It uses only Node's built-in test runner and `vm`: no new npm package, browser installation, App Crash Lab runner, account or database is required.

The relevant author request is [issue #306](https://github.com/laboef1900/simonswanderlust/issues/306), which asks for recoverable drafts and meaningful regression coverage. Its implementation contract still requires the author's approval. This example does not implement that contract or open an upstream PR.

## Run against your existing checkout

Review this file, save it outside your Vitest test-discovery directory, then run from the upstream `uploader/` directory:

```sh
node --test /path/to/draft-recovery-cleanup.test.mjs
```

The default source is the unchanged `public/draft-guard.js` in that working directory. To choose another local copy explicitly:

```sh
DRAFT_GUARD_SOURCE=/path/to/uploader/public/draft-guard.js node --test /path/to/draft-recovery-cleanup.test.mjs
```

Use the upstream project's supported Node version (currently **Node 26+**) when working in that project. Our isolated, dependency-free module check was measured with Node 24.19.0 and Node 22.16.0; we did not start the Node-26 application with either older runtime. Do not downgrade the application or install its dependencies for this check.

## What happens

1. Source context A stashes a complete synthetic German/English form.
2. Recovery context B adopts that stash under its own key.
3. A edits and actually writes a distinguishable newer complete stash to the shared storage.
4. B calls the module's successful-save cleanup callback for the older adopted copy.
5. The test compares A's entire committed raw record and decoded form before and after that cleanup.

On the unmodified [dev pin `9e400f977100f11808ef1d92f1e9880469c12dd8`](https://github.com/laboef1900/simonswanderlust/blob/9e400f977100f11808ef1d92f1e9880469c12dd8/uploader/public/draft-guard.js):

| Case | Observed result |
| --- | --- |
| An unchanged adopted source is removed after successful cleanup | PASS |
| Cleaning a separately created draft preserves the other complete stash | PASS |
| A source edited after adoption remains recoverable after B's cleanup | **PRESERVATION FAIL**: A's newer stash is removed |

Expect exit **1**, two passing controls and one failed preservation test on that pin. Source-not-found or setup errors are not evidence of the preservation failure. Nothing is skipped or marked as an expected failure. A separate local hypothetical guard that deletes the adopted source only while it is unchanged made all three tests pass; that is not an upstream fix or author adoption.

## Scope and limits

- Both `vm` contexts execute the original, unmodified browser IIFE. A shared Map models localStorage; pending timers are not advanced. Each write is explicitly completed and read before cleanup. The sequence is deterministic and does not rely on sleeps.
- The full synthetic payload includes both language versions, bodies, image references, tags, coordinates and stops. Image references are inert example strings; no images or other data are uploaded or fetched.
- This proves removal of a newer **recovery stash** at the module boundary. It does not show deletion of a server-saved post, prove permanent loss of the still-open tab's in-memory form, or exercise the full editor UI.
- There is no browser, real localStorage, authentication, server response, network, real save request, crash, user-account isolation or disk-quota simulation. Calling `markClean` models the caller signalling completion; it is not proof that an HTTP write occurred.
- Existing browser/two-tab/409 and server tests remain necessary for the complete issue. Keep your project's Vitest tests and approval process. The file is deliberately separate from Vitest discovery because it uses `node:test`.
- Only the authored test and result metadata are distributed here. The upstream module is read from your checkout, not copied into this repository.

If you run this App Crash Lab native example on your own checkout, a useful [result report](https://github.com/aichance/business-ai-recipes/issues/new?title=Draft%20recovery%20native%20check%20result) includes your source version, the three results and any setup problem. Following or starring the repository to keep the regression examples for a future release is optional.
