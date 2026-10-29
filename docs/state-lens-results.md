# State Lens: selected values beside the UI steps

Version: **0.1.0-experimental.1**. [Recorded report and trial entry](https://aichance.github.io/business-ai-recipes/state-lens.html).

The use case is an existing Playwright test whose UI says Saved, but a later
operation changes a draft. Select known localStorage/IndexedDB values and wrap
the existing actions. One local HTML aligns screenshots and field differences.
Keep the test's normal assertions. This is an observation helper.

## Measured broken and normal controls

These are operator-authored, synthetic Draft Desk apps on loopback. They are
not a production app, an external user's result or a new vulnerability.

| Same save/reload flow | After save | After reload | Standard snapshot agrees |
| --- | --- | --- | --- |
| Authored reload-loss control | body `Keep this launch draft`, revision1 | body empty, revision2 | Yes |
| Normal control | body `Keep this launch draft`, revision1 | unchanged | Yes |

Both flows record four checkpoints. The broken report selects the body and
revision changes in both chosen stores. The normal report has no post-reload
field difference. [Machine-readable comparison](state-lens-measurements.json).

**Standard Trace and `storageState({ indexedDB: true })` already contain the
underlying data.** State Lens adds explicitly selected per-step field differences
and the captured viewport in one HTML. It does not discover hidden database
events, infer commit timestamps or guarantee a root cause. Developer time savings
and independent adoption have not been measured.

## Reproduce

From `tools/playwright-state-lens` in the source checkout:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run test:consumer
npm run demo -- /a/new/output/directory
```

Use a new output directory. The demo prints its location and writes both HTML
reports, their JSON, standard storage snapshots, standard traces and the
comparison. Opening the static public page replays those recorded observations;
it does not run against your browser's storage or another app.

The local checks used Node22.23.4 and Playwright1.64.0 with actual Chromium:
14 behavior tests and one ordinary Playwright-runner consumer test passed.
An extracted npm tarball omits package-lock by npm design; use
`npm install --ignore-scripts` there. An existing app can
[install the same common package directly](../tools/playwright-state-lens/README.md#add-it-to-your-existing-playwright-test).

## Limits and useful trial feedback

- Select known keys. There is no general store enumeration. Unsupported values,
  inaccessible stores and out-of-origin pages remain INCONCLUSIVE.
- Reads and screenshots are sequential. Action completion is not a PASS result.
  App assertions establish expected behavior separately.
- The local HTML contains selected data and screenshots. Review it before sharing.
  No account, telemetry, model call or API key is required by the library.
- The same library is used in all examples. Other browsers and Playwright
  versions have not been verified.

For an own-app trial, report the version, workflow, whether the result helped
compared with your normal trace, and any setup blocker. A sanitized summary is
enough; no private app data or source is needed. Demo runs and our own tests are
not counted as independent adoption.

[Report a result or blocker](https://github.com/aichance/business-ai-recipes/issues/new?title=%5BState%20Lens%5D%20Own-app%20trial).
