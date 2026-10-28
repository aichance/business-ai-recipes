# Leak Regression Lab 0.1.0 — measured controls

These original recordings and archives are preserved. The current [v0.1.1 supplied-session input and additional controls](./leak-regression-lab-session-results.md) are separate evidence.

These are operator-created synthetic controls, not independent adoption, a scan of someone else's application, or a newly discovered Supabase vulnerability. The interactive [recorded replay](./leak-regression-lab.html) renders the [complete sanitized measurements](./leak-regression-lab-measurements.json).

The **downloaded-format source ZIP was extracted into a fresh directory**, then the unmodified extracted checker ran against real local Supabase Auth, PostgREST and Storage. One disposable stack, two ordinary identities, two authored ownership layouts (direct-user and team-membership), six states each. Layout differences are configuration-only; there is no separate checker per app. Each run plans 14 read checks and performs two sign-ins. Across 12 runs, 160 HTTP read responses were obtained; eight dependent checks were not attempted because their owner controls were unavailable. Those eight stay INCONCLUSIVE. CLI 2.24.3, Node 22.23.4, macOS with local Docker. Latest hosted gateways, publishable keys and native Windows have not been certified by these controls.

For **each** ownership layout:

| Authored fixture state | Overall | PASS | FAIL | INCONCLUSIVE | Exit |
| --- | --- | ---: | ---: | ---: | ---: |
| Correct owner policies, private buckets | PASS | 14 | 0 | 0 | 0 |
| DB read policy admits other/anonymous actors | FAIL | 10 | 4 | 0 | 2 |
| Storage read policy admits other/anonymous actors | FAIL | 10 | 4 | 0 | 2 |
| Buckets changed to public | FAIL | 8 | 6 | 0 | 2 |
| DB owner reads denied to everyone | INCONCLUSIVE | 8 | 0 | 6 | 3 |
| Correct policies and private buckets restored | PASS | 14 | 0 | 0 | 0 |

All 168 recorded case results (including the eight unattempted dependent checks) were asserted individually against their intended surface/actor/route. The public-bucket state leaves all six DB observations passing while exposing six private-file probes. The private-bucket/open-object-policy state exposes four object probes while the public route remains denied. The DB-deny-all state leaves Storage passing, but all six DB observations inconclusive because the owner positive controls are unavailable. This does **not** imply a successful repair.

Comparing the same direct-owner contract from secure → public-bucket yields six regressions; public-bucket → repaired yields six resolved cases with no incomplete observation. The common comparator rejects changed fingerprints, omitted/duplicate case sets, empty reports and inconsistent report status. Its reports are evidence for the selected contract, not a tamper-proof attestation.

The npm-style tarball was separately executed from a fresh isolated offline npm cache. Help, no-`--live` refusal and an actual secured 14-observation check using `--env` all passed. The 15 installed files match the source ZIP byte-for-byte. The package has no dependencies or installation hooks. The [ZIP](./leak-regression-lab-v0.1.0.zip) and [tarball](./leak-regression-lab-v0.1.0.tgz) hashes are included in the measurement JSON and their SHA-256 sidecars.

## Reproduce the controls

The [fixture source](https://github.com/aichance/business-ai-recipes/tree/main/tools/leak-regression-lab/fixtures) is separate from ordinary user checks. It creates synthetic accounts, rows and objects and changes policies using local administration. It intentionally accepts only a newly owned disposable loopback stack on ports 56521/56522; never point it at an application or remote project. Check the installed CLI's Docker port bindings before creating data; default bindings may listen beyond loopback. The regular checker uses only a public client key and two normal accounts, and never needs this setup process.

With that disposable stack's local-only status JSON kept private:

```sh
node fixtures/run.mjs --status /private/local-status.json --out ./new-fixture-results
```

The initial fixture refuses existing resources. Keep its generated environment/configuration private. Its machine-specific paths, account emails, tokens, service key, object paths and raw responses are not included in the public measurement file.

## What this adds to existing tests

SQL/pgTAP policy tests remain useful for database permissions. This tool checks a narrow complementary contract through the actual HTTP entry points with two normal sign-ins, including private object download and public object URL access. No database administration credential is needed for **checking your existing fixtures**. A generic security scanner or missing-RLS check does not establish that the intended owner can retrieve an exact file while a different actor cannot.

Private resources are declared, not discovered; public buckets expose downloads by design ([official documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals)). Deliberately public files do not belong in this contract. An anon/publishable client key is not itself a leaked secret.

Not tested: writes/deletes, signed URLs, transforms, cache persistence, Realtime, RPC, business roles, browser sessions, arbitrary tables or all bucket contents. Use small synthetic objects (responses ≤1MiB). Exact row-ID matching currently targets UUID/text IDs. The checker cannot infer ownership intent or certify general application safety. See the [setup and scope](https://github.com/aichance/business-ai-recipes/tree/main/tools/leak-regression-lab).

Authentication guard: opaque publishable keys are sent only in `apikey`, while user JWTs and legacy anon JWTs use `Authorization`. HTTP401 and embedded401 remain INCONCLUSIVE. These two regression controls are modeled offline tests, not a live hosted publishable-key certification; the real local matrix above uses legacy anon credentials. [Official limitations](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations).
