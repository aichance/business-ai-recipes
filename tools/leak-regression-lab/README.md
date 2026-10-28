# Leak Regression Lab

**Your own data should work. Someone else's private rows and attachments should not.**

A dependency-free Node22 checker for Supabase test environments. Two normal users, known synthetic rows and private files, one reusable check contract. It tests the real Auth/PostgREST/Storage HTTP paths and produces a local JSON/HTML report you can rerun after changing your app or policies.

No inference bill, telemetry, service-role key or package dependencies. The checker makes read requests plus ordinary password-grant sign-ins. It does not create/change application data, repair policies, upload files or delete anything. Use authorized test projects/accounts and small synthetic data.

## What is checked

For each user's known test row: their own read must return the expected test data, the other user must not receive it, and anonymous access must not receive it. For each known private file: the owner must download the expected bytes; the other user, anonymous authenticated-object access and anonymous public-object access must not receive them. Anonymous probes use the API's anon/publishable credential, not an authenticated user. Opaque publishable keys go only in `apikey`; user JWTs and legacy anon JWTs use `Authorization: Bearer`. HTTP401 and embedded authentication errors remain inconclusive, never a security pass. See the [official key limitations](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations).

This catches an accidentally public bucket even when database row tests pass. Public downloads bypass access control by design: [Supabase bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals). Do not put deliberately public files in this private-resource contract. An anon/publishable API key is expected client configuration, not itself a leaked secret.

`PASS` is scoped evidence for these exact reads, data and configuration. `FAIL` means expected private test content was returned to a forbidden actor/route. `INCONCLUSIVE` means a required observation was missing. Auth errors, wrong/missing fixtures, timeouts, unexpected responses and owner-denied access are not a security pass. A confirmed FAIL remains visible if another surface is inconclusive.

Writes/deletes, signed links, image transforms, cached copies, Realtime, RPCs, business roles, browser sessions and general application security are not tested. Responses above1MiB remain inconclusive; use small synthetic files. Only the declared exact records and object paths are probed, not your whole database or bucket.

## Test your environment

You need Node22+, a working Supabase **test** project, two distinct ordinary test accounts, and one private synthetic row plus file belonging to each. You choose the intended ownership; the tool does not infer it or discover production data.

1. Copy `examples/test-config.json` to private local `test-config.json`. Set the test origin, table/record IDs, expected synthetic row contents, bucket/object paths and file SHA-256 values. Keep `owner` as `a` or `b`. Change this configuration for another schema or team ownership layout, not checker code. Replace all uppercase placeholders.
2. Copy `examples/env.example` to `.env.test` outside tracked source. Fill the five values locally with an anon/publishable key and the two ordinary accounts. **Never use a service-role/secret key.** Do not send credentials or raw configuration to the author. Existing process environment values take precedence over `.env.test`. The tool option is `--env`; Node's separate `--env-file` flag can load a file before the program starts.
3. From the extracted tool directory, run:

```sh
node cli.mjs check --env .env.test --config test-config.json --out ./leak-check-before --live
```

The output directory must be new and its parent must exist. The sample contract makes up to14 read requests and2 sign-ins. Normal provider test-project quotas apply. Missing/invalid environment values stop before application probes. Resource IDs are aliases you choose; keep them non-confidential.

Open `leak-check-before/index.html` or inspect `report.json`. Exit0=all scoped controls pass;2=observed exposure;3=inconclusive;1=input/setup refusal. Report files are owner-readable by default. Credentials, identity values, origins, private paths, raw row/file contents and server diagnostics are omitted; aliases, statuses, HTTP statuses, reasons and a contract hash remain.

### File hashes

Use `shasum -a 256 file.txt` on macOS/Linux, or `Get-FileHash -Algorithm SHA256 file.txt` on PowerShell. A final newline changes the hash. Replace the sample placeholder with the actual lowercase hash. Incorrect hashes leave the owner control inconclusive, never PASS.

### After a change

Keep the same test data/contract and rerun into another new directory:

```sh
node cli.mjs check --env .env.test --config test-config.json --out ./leak-check-after --live
node cli.mjs compare --before ./leak-check-before/report.json --after ./leak-check-after/report.json
```

Changing expected resources/content changes the contract fingerprint. Different contracts, omitted cases and incomplete observations cannot silently certify a repair. Comparison is local with no network or model call.

## Validation status

Operator controls use one owned local Supabase stack, CLI2.24.3, Node22.23.4, real Auth/PostgREST/Storage services and synthetic data. Direct-user ownership and team-membership ownership use the **same checker with configuration-only differences**. These are two authored fixture layouts, not independent production apps or adopters. Latest hosted services, publishable-key gateways and Windows execution are not yet certified by those controls.

Fixtures include secured, row-leak, object-policy-leak, public-bucket, deny-all and repaired states. Keeping owner access is a control; blocking everyone is not a secure PASS. The separate `fixtures/run.mjs` creates and modifies a disposable fixture with local administration and must never target your app. It only accepts the documented new loopback stack on56521/56522. Ordinary checks do not need this fixture workflow.

## Offline protocol tests

```sh
node --test test/*.test.mjs
```

These use a scripted HTTP model plus a real local redirect-refusal control, not a Supabase compatibility substitute. Real fixture runs are separate evidence. There are no package dependencies or install hooks.

License: MIT; see the repository root or archive LICENSE. A report supports engineering review and is not a security certification.
