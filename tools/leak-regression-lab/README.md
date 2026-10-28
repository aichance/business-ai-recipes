# Leak Regression Lab

**Your own data should work. Someone else's private rows and attachments should not.**

A dependency-free Node22 checker for Supabase test environments. Two normal users, known synthetic rows and private files, one reusable check contract. It tests the real Auth/PostgREST/Storage HTTP paths and produces a local JSON/HTML report you can rerun after changing your app or policies.

No inference bill, telemetry, service-role key or package dependencies. Choose ordinary password-grant sign-ins or supply existing Supabase test-user access tokens. The latter uses only GET requests. The checker does not create/change application data, repair policies, upload files or delete anything. Use authorized test projects/accounts and small synthetic data.

## What is checked

For each user's known test row: their own read must return the expected test data, the other user must not receive it, and anonymous access must not receive it. For each known private file: the owner must download the expected bytes; the other user, anonymous authenticated-object access and anonymous public-object access must not receive them. Anonymous probes use the API's anon/publishable credential, not an authenticated user. Opaque publishable keys go only in `apikey`; user JWTs and legacy anon JWTs use `Authorization: Bearer`. Authentication errors remain inconclusive, never a security pass. There is one documented anonymous-row privilege exception below. See the [official key limitations](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations).

Since0.1.2, the checker requests only each row's `id_column` and the fields declared in `expect`, with duplicate names removed. It does not request `SELECT *` or require access to unrelated columns. Keep your existing grants; a missing permission on a declared field still makes the owner control inconclusive. Choose fields that the intended owner should read and that the forbidden actors must not receive. Undeclared fields and the complete column-permission matrix are outside this check.

A403/404 status alone does not qualify as a policy denial. Storage needs a recognized `AccessDenied`, `NoSuchKey`, `NoSuchBucket`, legacy `not_found` or `unauthorized` response with its matching denial status. The local fixture also returns HTTP400 with `statusCode:404` and the exact legacy error `Bucket not found`; that specific form is supported. Row denial is an empty successful result or explicit PostgreSQL42501/HTTP403. Unknown codes, invalid JWTs/signatures and service errors remain inconclusive. [Official Storage error codes](https://supabase.com/docs/guides/storage/debugging/error-codes).

**v0.1.3: no anonymous table grant is required.** PostgREST maps PostgreSQL `42501` (insufficient privilege) to HTTP401 for its anonymous role and403 for authenticated users. After the owner read succeeds, the anonymous **row** probe accepts401 only with exact code`42501`, a nonempty message and no authentication-error/status wrapper fields. This does not accept other-user, owner or Storage401 responses. JWT errors, missing/malformed bodies and unknown codes remain inconclusive. Do not add anonymous grants just to make the checker pass. [PostgREST error mapping](https://docs.postgrest.org/en/v14/references/errors.html#http-status-codes) · [Measured controls and limits](https://github.com/aichance/business-ai-recipes/blob/main/docs/leak-regression-lab-anon-grants.md).

This catches an accidentally public bucket even when database row tests pass. Public downloads bypass access control by design: [Supabase bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals). Do not put deliberately public files in this private-resource contract. An anon/publishable API key is expected client configuration, not itself a leaked secret.

`PASS` is scoped evidence for these exact reads, data and configuration. `FAIL` means expected private test content was returned to a forbidden actor/route. `INCONCLUSIVE` means a required observation was missing. Auth errors, wrong/missing fixtures, timeouts, unexpected responses and owner-denied access are not a security pass. A confirmed FAIL remains visible if another surface is inconclusive.

Writes/deletes, signed links, image transforms, cached copies, Realtime, RPCs, business roles, browser sessions and general application security are not tested. Responses above1MiB remain inconclusive; use small synthetic files. Only the declared exact records and object paths are probed, not your whole database or bucket.

## Test your environment

You need Node22+, a working Supabase **test** project, two distinct ordinary test accounts, and one private synthetic row plus file belonging to each. You choose the intended ownership; the tool does not infer it or discover production data.

1. Choose the password example `examples/test-config.json` plus `examples/env.example`, or the existing-session example `examples/test-session-config.json` plus `examples/session-env.example`. Copy them to private local `test-config.json` and `.env.test`. Set the test origin, table/record IDs, expected synthetic row contents, bucket/object paths and file SHA-256 values. Keep `owner` as `a` or `b`. Change configuration for another schema or team ownership layout, not checker code. Replace all uppercase placeholders.
2. Fill the chosen environment file locally with an anon/publishable key and either the two ordinary accounts or two current Supabase test-user access tokens. **Never use a service-role/secret key or production users.** Do not send credentials or raw configuration to the author. Existing process environment values take precedence over `.env.test`. The tool option is `--env`; Node's separate `--env-file` flag can load a file before the program starts.
3. From the extracted tool directory, run:

```sh
node cli.mjs check --env .env.test --config test-config.json --out ./leak-check-before --live
```

The output directory must be new and its parent must exist. The sample contract makes up to14 application read requests, plus2 Auth requests: password sign-ins or GET user verifications. Normal provider test-project quotas apply. Missing/invalid environment values stop before application probes. Resource IDs are aliases you choose; keep them non-confidential.

Open `leak-check-before/index.html` or inspect `report.json`. Exit0=all scoped controls pass;2=observed exposure;3=inconclusive;1=input/setup refusal. Report files are owner-readable by default. Credentials, identity values, origins, private paths, raw row/file contents and server diagnostics are omitted; aliases, statuses, HTTP statuses, reasons and a contract hash remain.

### Already using Google, magic links or anonymous sign-in?

You do not need to add password login. Sign in to **your test app** as each of two different test users using its existing flow. In your own trusted app/debug code, obtain the Supabase-issued `session.access_token` from that sign-in result or the existing Supabase client's `auth.getSession()` result. Put each value in its matching local environment variable from `examples/session-env.example`. Never print, post or send tokens, and do not use provider ID tokens, refresh tokens, anon API keys or privileged keys as user access tokens.

The config selects one method per actor; mixed password/session actors are allowed:

```json
"actors": {
  "a": {"access_token_env": "LEAK_LAB_A_TOKEN"},
  "b": {"access_token_env": "LEAK_LAB_B_TOKEN"}
}
```

The checker requires a current `authenticated` JWT, asks the **configured project's Auth server** to verify it, matches the returned user ID and role, and requires two different verified IDs before reading app data. Decoding a JWT alone is not authentication. Supabase's [getUser(jwt) verification](https://supabase.com/docs/reference/javascript/auth-getuser) describes the server check; [anonymous sign-in users](https://supabase.com/docs/guides/auth/auth-anonymous) have the `authenticated` role and are distinct from the tool's JWT-free anonymous probes.

The tool does not start OAuth, access browser storage, extract someone else's credentials, configure auth providers or refresh sessions. Obtain new test tokens locally if they expire; rerun into a new output directory with the same resource contract. Browser login, refresh, sign-out/revocation behavior and business-role rules remain outside coverage. Testing a supplied JWT does not certify the flow that issued it.

### File hashes

Use `shasum -a 256 file.txt` on macOS/Linux, or `Get-FileHash -Algorithm SHA256 file.txt` on PowerShell. A final newline changes the hash. Replace the sample placeholder with the actual lowercase hash. Incorrect hashes leave the owner control inconclusive, never PASS.

### After a change

Keep the same test data/contract and rerun into another new directory:

```sh
node cli.mjs check --env .env.test --config test-config.json --out ./leak-check-after --live
node cli.mjs compare --before ./leak-check-before/report.json --after ./leak-check-after/report.json
```

Changing expected resources/content changes the contract fingerprint. Different contracts, omitted cases and incomplete observations cannot silently certify a repair. Comparison is local with no network or model call.

**Upgrading from0.1.1 or0.1.2:** both the row projection and denial policy are part of the contract fingerprint. Old reports deliberately refuse comparison with0.1.3 (`DIFFERENT_CHECK_CONTRACT`), even with the same config. Take a fresh baseline with0.1.3 and use0.1.3 for subsequent checks. The old SELECT-all requests and anonymous401 classification must not silently compare with the new semantics. An old inconclusive result becoming a new PASS is a checker correction, not evidence that an app vulnerability was repaired.

## Validation status

Operator controls use one owned local Supabase stack, CLI2.24.3, Node22.23.4, real Auth/PostgREST/Storage services and synthetic data. Direct-user ownership and team-membership ownership use the **same checker with configuration-only differences**. These are two authored fixture layouts, not independent production apps or adopters. Latest hosted services, publishable-key gateways and Windows execution are not yet certified by those controls.

The0.1.3 anonymous-grant comparison recorded eight real runs:112 planned application reads,108 completed responses and four unattempted peer probes after failed owner controls. The same401 status carried42501 for an anonymous privilege denial and PGRST301 for an intentionally invalid signature. The latter stayed inconclusive; opening RLS still exposed two peer reads. Original grants and RLS were restored. These runs used password-issued ordinary sessions as supplied JWT inputs; they do not test a Google/OAuth browser flow.

Fixtures include secured, row-leak, object-policy-leak, public-bucket, deny-all and repaired states. Keeping owner access is a control; blocking everyone is not a secure PASS. The separate `fixtures/run.mjs` creates and modifies a disposable fixture with local administration and must never target your app. It only accepts the documented new loopback stack on56521/56522. Ordinary checks do not need this fixture workflow.

For the operator's existing disposable fixture, `--session-tokens` obtains two ordinary password-issued test JWTs once, then runs the same matrix with Auth GET verification. This checks the supplied-session input path, not an actual OAuth browser flow. Private fixture outputs include credentials; keep them outside source and never publish them.

## Offline protocol tests

```sh
node --test test/*.test.mjs
```

These use a scripted HTTP model plus a real local redirect-refusal control, not a Supabase compatibility substitute. Real fixture runs are separate evidence. There are no package dependencies or install hooks.

License: MIT; see the repository root or archive LICENSE. A report supports engineering review and is not a security certification.
