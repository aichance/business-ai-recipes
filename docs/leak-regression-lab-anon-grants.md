# An anonymous 401 can be a real privilege denial

Version0.1.3 distinguishes one documented PostgreSQL privilege denial from an authentication failure. It does not accept every401, and it does not require granting anonymous users table access.

## What was reproduced

One owned loopback Supabase stack, Node22.23.4, synthetic data, two distinct ordinary users, known private rows and actual private files. Both users were signed in once for setup; each checker run verified the supplied sessions with Auth GET before its read probes. This is operator verification, not independent adoption or a scan of another developer's app.

With SELECT granted only to authenticated users, PostgREST returned HTTP401 with code`42501` to the anonymous row probes. The old0.1.2 checker left those two observations inconclusive. The same status with code`PGRST301` followed an intentionally invalid anonymous signature; that is an authentication failure and remains inconclusive in0.1.3.

| Checker / controlled state | PASS | FAIL | INCONCLUSIVE |
| --- | ---: | ---: | ---: |
|0.1.3 / original grants |14|0|0|
|0.1.2 / no anonymous table grant |12|0|2|
|0.1.3 / same grants and policies |14|0|0|
|0.1.3 / invalid anonymous signature |12|0|2|
|0.1.3 / same grants, row policy intentionally open |12|2|0|
|0.1.3 / row policy restored |14|0|0|
|0.1.3 / owner table grant also removed |8|0|6|
|0.1.3 / original grants restored |14|0|0|

The open row policy exposed two other-user reads; anonymous users still had no SELECT grant. Restoring RLS resolved those two observed regressions within0.1.3. Removing the owner grant left six row cases inconclusive, including four dependent probes that were not attempted. Neither an unavailable owner control nor an invalid signature became a security PASS.

Totals: eight runs,112 planned application read cases,108 completed HTTP responses, four unattempted dependent probes,16 checker Auth GETs and zero checker password sign-ins. The separate setup made two ordinary password sign-ins. The checker made no application mutations. The operator changed only the disposable fixture's grants and policy; the original ACL set and RLS policies were restored and checked.

## Recognition rule

[PostgREST's error mapping](https://docs.postgrest.org/en/v14/references/errors.html#http-status-codes) and [Supabase's mapping](https://supabase.com/docs/guides/api/rest/postgrest-error-codes) assign42501 to401 for a non-authenticated role, or403 for an authenticated role.

The new exception is limited to an **anonymous row probe after owner success**, with HTTP401, exact code`42501`, a nonempty message, and no `error`, `error_description`, `statusCode` or `httpStatusCode` wrapper fields. Owner/other-user401s, Storage401s, JWT errors, unknown codes and malformed bodies remain inconclusive. A legacy anonymous API JWT can have an Authorization header; that does not turn the probe into an ordinary authenticated user. Supabase anonymous-sign-in users have authenticated user sessions and are a separate concept.

The offline protocol tests include legacy/publishable key transport, malformed and contradictory envelopes, owner/peer/Storage boundaries, mixed leaks plus incomplete observations, and comparison behavior. Scripted transport tests do not certify a hosted gateway.

## Fresh archive CLI controls

The final0.1.3 ZIP and tarball each contain18 files byte-for-byte equal to the release source; older archive bytes are unchanged. The newly extracted ZIP's CLI was separately run with ordinary password inputs against the same no-anonymous-grant fixture:14PASS, then12PASS/2FAIL after opening RLS, then14PASS after restoring it. These three runs completed42 application read responses and six ordinary password-auth POSTs. A metadata-only fetch delegate recorded method/status/code without changing requests or responses or retaining credentials.

The packaged compare command returned exit2 with two regressions, then exit0 with two resolved cases. Comparing the old0.1.2 report to the new baseline returned exit1/`DIFFERENT_CHECK_CONTRACT`. Original ACLs and RLS were restored again. These are three additional operator runs on the same stack, not independent users or another application.

## Upgrade and reproduce

Use the common0.1.3 source ZIP and [standard setup](../tools/leak-regression-lab/README.md#test-your-environment). Keep the intended app's grants intact. Use two ordinary test accounts with private synthetic rows and files they may read themselves and may not read across accounts. Take a new0.1.3 baseline, then rerun after an actual app or policy change.

The denial-policy identifier changes the contract fingerprint. Comparing an old0.1.2 report to0.1.3 returns `DIFFERENT_CHECK_CONTRACT`; an old inconclusive observation becoming a new PASS is a checker correction, not an app-security repair. The0.1.2 and earlier archives are preserved.

These controls used one local stack and supplied password-issued sessions. Latest hosted Supabase/publishable-key routing, Google/OAuth browser flows, native Windows, signed-URL creation/expiry, writes/deletes and whole-app security remain unverified or outside scope. PASS covers the declared read paths only.

Machine-readable measurements: [anonymous-grant controls](leak-regression-lab-anon-measurements.json).
