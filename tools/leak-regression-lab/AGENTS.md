# Leak Regression Lab

Dependency-free Node22 read-isolation checker. `node --test test/*.test.mjs` runs local offline protocol/transport controls. Real compatibility needs the separately owned Supabase Auth/PostgREST/Storage fixture. Tests against a scripted HTTP server do not certify Supabase.

`lib/config.mjs` validates explicit test origin/resources and resolves allowlisted environment-variable references. `lib/probe.mjs` owns bounded same-origin requests, two distinct normal identities, owner positive controls and cross-account/anonymous observations. `lib/report.mjs` writes escaped shareable reports without credentials, raw records, identity values or object paths. CLI owns explicit --live and fresh output directories. Do not add service-role/secret keys, application writes, cleanup or telemetry to the checker. Fixture setup is a separate loopback-only operator workflow.

Unknown auth, timeout, route, malformed data, missing positive control and unexpected denial responses are INCONCLUSIVE. A useful observed FAIL must not be hidden by another incomplete surface. PASS is scoped read-isolation evidence, not whole-app security. Public fixture/operator measurements and independent user adoption are distinct.

Actors select password environment references or an existing Supabase test-user JWT environment reference. Supplied JWTs require server Auth user/subject/role verification and different verified IDs before app reads. Never trust decoding alone, automate credential extraction, add OAuth/provider configuration or imply browser-flow coverage. HTTP denial statuses without a recognized policy/missing-object response remain inconclusive.

Initial coverage is exact known test rows and private objects via authenticated/public REST routes; write/delete, signed URLs, image transforms, cache persistence, Realtime, RPC, arbitrary endpoints and browser session behavior are not certified. Use configuration-only changes for different ownership layouts rather than per-app checker code.
