# Bloggr: inspect local recovery after a lost rename response

The common State Lens0.4.1 helper was added to one existing [Bloggr browser regression](https://github.com/Antibody/bloggr/blob/cf95e5ca8e44cca1dab52396cc0d1380e7d1799a/tests/browser/workspace.spec.ts#L355): a permalink change commits, its response is lost, and later edits must survive reconciliation and recovery.

[Open the recorded local timeline](state-lens-bloggr-recovery.html) · [Measurements](state-lens-bloggr-measurements.json) · [Reproducer](state-lens-bloggr-consumer.mjs) · [TypeScript setup](state-lens-typescript.md).

## Result and provenance

| Check | Observed result |
|---|---|
| Original selected test, source `cf95e5c` | 1 passed |
| Added common0.4 | Browser test passed; unchanged typecheck failed TS2353 |
| Added common0.4.1 and matching types | Browser test and unchanged typecheck passed |
| Timeline | 8 checkpoints, 3 selected keys, 24 observations |
| Final selected values | 3 of 3 matched subsequent direct localStorage reads |

The final local copies retained `Text kept after rename loss`. These observations show selected stored values beside the existing actions. The original assertions still decide whether the UI recovery succeeds. The direct reads were later sequential observations, not atomic capture or causal proof. Normal Trace remains available; added reads/screenshots/awaits can change timing.

This was an operator run on macOS with Node24.22.1, Playwright1.64.1 and TypeScript5.9.3, using the upstream local development-server configuration and synthetic route responses. The real Supabase backend, production build and full app suite were not exercised. This is not an upstream bug report or independent user. Initial command selection matched zero tests because of an anchored grep; that attempt was retained and corrected before the reported one-test baseline.

The pinned app/runtime code, original test and compiler settings stayed unchanged. Comparing 115 original non-env files found only Next's generated `next-env.d.ts` switching two route-type imports to `.next/dev/types`. Env files were excluded without reading them. The consumer is a separate file with the same public fixture and original action/assertion order; it imports the unchanged shared0.4.1 module rather than a fork of the library.

## Reproduce in a fresh public-source copy

1. Review [Bloggr at the recorded commit](https://github.com/Antibody/bloggr/tree/cf95e5ca8e44cca1dab52396cc0d1380e7d1799a). Use Node24 as required by that app and a fresh copy without private env overrides. Install its lockfile dependencies with `npm ci --ignore-scripts`. The selected browser case uses its synthetic routes; no backend setup command is needed.
2. Run the original selected test first:

```sh
CI=1 ./node_modules/.bin/playwright test tests/browser/workspace.spec.ts \
  --grep 'a lost rename response can reconcile the old address and preserve new text$' \
  --trace=on
```

3. Review/download the [reproducer](state-lens-bloggr-consumer.mjs), [common module](state-lens-v0.4.1-experimental.1.mjs), [matching declarations](state-lens-v0.4.1-experimental.1.d.mts) and their checksums. With those files together, run:

```sh
node /path/to/state-lens-bloggr-consumer.mjs \
  --project /path/to/pinned-bloggr \
  --module /path/to/state-lens-v0.4.1-experimental.1.mjs
```

The reproducer verifies pinned source-file identities and both common-file checksums. It creates a new `tests/browser/state-lens-recovery` directory and refuses an existing one. It does not install or run the app.

4. From that Bloggr copy, keep the normal checks:

```sh
npm run typecheck
CI=1 ./node_modules/.bin/playwright test tests/browser/state-lens-recovery/rename.spec.ts \
  --grep 'a lost rename response can reconcile the old address and preserve new text$' \
  --trace=on
```

The selected-state HTML and JSON are attached locally alongside the normal Trace. The adapter keeps original assertion failures and records a reporting error separately if the original action has already failed. It observes only these synthetic recovery keys: `bloggr-draft:fixture-owner:a-story`, `bloggr-draft:fixture-owner:id:11111111-1111-4111-8111-111111111111`, and `bloggr-draft:fixture-owner:renamed-story`. For another app, use the [common installation guide](state-lens-install.md) with its own existing test and known synthetic keys.

The upstream fixture and assertions are by Maxim Bespalov / Antibody, distributed under [Bloggr's MIT license](https://github.com/Antibody/bloggr/blob/cf95e5ca8e44cca1dab52396cc0d1380e7d1799a/LICENSE). The generated consumer carries that license. State Lens is MIT too. A maintainer independently using the common module in real project work would be separate evidence; this operator reproduction does not add to the adoption counter.
