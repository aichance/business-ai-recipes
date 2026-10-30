# State Lens 0.4.1: keep the test and the typecheck working

Adding the common0.4 file to one real Next.js/Playwright regression passed the browser test but failed the project's unchanged `npm run typecheck`:

```text
TS2353: 'probes' does not exist in type
{ timeoutMs?: number; screenshots?: boolean; title?: string; }
```

This was a problem in our JavaScript API inference. A missing declaration also reproduced TS7016 in a minimal strict consumer with `allowJs: false`. An attempted `probes = []` default produced `never[]`; that candidate was rejected. Version0.4.1 uses explicit input JSDoc, retaining the executable function body, validation and schema3. It also supplies a type-only companion. The reported library version changes; pinned0.4 and earlier downloads remain unchanged.

## Use the existing compiler settings

- JavaScript projects use the [0.4.1 common file](state-lens-v0.4.1-experimental.1.mjs).
- A strict project that infers JavaScript (`allowJs: true`, `checkJs: false` in the measured consumer) can read its input JSDoc.
- Projects needing declarations can put [state-lens-v0.4.1-experimental.1.d.mts](state-lens-v0.4.1-experimental.1.d.mts) beside that `.mjs`. Keep both versioned basenames. Verify the [module checksum](state-lens-v0.4.1-experimental.1.mjs.sha256) and [declaration checksum](state-lens-v0.4.1-experimental.1.d.mts.sha256).
- The versioned package has a `types` export. Its declaration imports no Playwright or runtime dependency.

```ts
import { createStateLens } from './state-lens-v0.4.1-experimental.1.mjs';
const lens = createStateLens(page, {
  probes: [{ name: 'draft', source: 'localStorage', key: 'draft', json: true }],
});
```

Keep your normal test and typecheck commands. The runtime still checks 1–16 selected probes, valid sources/keys and the timeout range. The declaration is a developer aid, not a successful observation or a substitute for those runtime checks. Report values remain annotated JSON projections and unavailable reads stay inconclusive. These checks do not cover every compiler version or `checkJs: true` for the helper implementation.

## Measured checks

The [pinned Bloggr case](state-lens-bloggr-native.md) uses Node24.22.1, Playwright1.64.1 and TypeScript5.9.3 on macOS. Its original mock-backed browser test passed. Common0.4 passed the browser test and failed TS2353; common0.4.1 passed both. The app, original test and `tsconfig.json` remained unchanged. Next's development server regenerated two `next-env.d.ts` references from `.next/types` to `.next/dev/types`; that framework-generated difference is recorded separately.

In the tool source, `npm run test:types` checks package/relative imports with strict `allowJs: false` and `allowJs: true`, plus a declaration-free temporary one-file consumer. Positive calls include all three storage sources and readonly probe lists. Negative compile cases check key/source/store/timeout constraints and callback result types. `npm test` retains 27 runtime tests. Compiler/type packages are pinned development dependencies; they are not runtime dependencies of the shared helper.

These are operator measurements. No independent adoption, general platform support, production behavior or time saving is claimed.
