# v0.1.1 — check with existing Supabase test sessions

Apps using Google, magic links or anonymous sign-in can supply two existing **Supabase-issued test-user access JWTs**. They need not add password login. The same checker asks the configured Auth server to verify each JWT, matches the returned user ID and `authenticated` role, and requires different IDs before the existing row/private-file checks. No browser credential extraction, provider configuration, token refresh, service-role key or application write is added. [Setup](https://github.com/aichance/business-ai-recipes/tree/main/tools/leak-regression-lab#already-using-google-magic-links-or-anonymous-sign-in).

## Recorded local controls

The fresh v0.1.1 source archive ran against the same owned local Supabase stack as the preserved [v0.1.0 recording](./leak-regression-lab-results.md). Two authored ownership layouts, six states each, use the same checker and configuration-only schema differences. These are operator synthetic fixtures, **not external adoption** or a test of a prospect's application.

Each layout produced: secure14PASS; DB policy widened10PASS/4FAIL; object policy widened10PASS/4FAIL; public bucket8PASS/6FAIL; DB denied to all8PASS/6INCONCLUSIVE; repaired14PASS. Across12runs,168planned case outcomes contain160 completed application HTTP read responses and8 dependent checks not attempted because owner controls were unavailable. The session input used24 actual Auth user GET requests; obtaining the fixture tokens beforehand used2 ordinary password sign-ins. The checker made no password-grant calls in this matrix.

The [complete sanitized JSON](./leak-regression-lab-session-measurements.json) keeps these reports, actual request counts, additional authentication controls and archive hashes. Node22.23.4, Supabase CLI2.24.3 and the existing local Docker services on macOS. The offline suite has27protocol/CLI tests. Original v0.1.0 archives and measurements are unchanged.

Additional real local controls cover password-only and mixed inputs, same-user rejection, an invalid JWT signature rejected by Auth before app reads, and expired/privileged input refusal. Invalid tokens must never produce a security PASS. HTTP403/404 alone no longer means a policy denial: unknown codes and JWT/signature errors remain INCONCLUSIVE. The observed legacy private-bucket HTTP400/`statusCode:404`/`Bucket not found` response is supported explicitly.

This measures password-issued JWTs supplied through the new input path. **Actual Google/OAuth browser sign-in, anonymous-user creation, refresh/revocation behavior, hosted latest gateways and native Windows are not certified.** The offline anonymous-user claim control demonstrates role handling in a scripted transport only. An authenticated anonymous-sign-in user is separate from a JWT-free anonymous probe. Browser sessions, business roles, writes/deletes, signed URLs, cache, transforms, Realtime and RPC remain outside coverage.

## Reproduce with the owned disposable fixture

Ordinary users only need the [session example](https://github.com/aichance/business-ai-recipes/blob/main/tools/leak-regression-lab/examples/test-session-config.json), local environment values and their own authorized synthetic data. Do not run the fixture setup against an app. For the documented disposable loopback stack with an existing fixture only:

```sh
node fixtures/run.mjs --status /private/local-status.json \
  --existing-fixture /private/original-fixture \
  --out /private/new-session-results --session-tokens
```

The operator fixture issues two ordinary password sessions once, then uses Auth GET verification. Generated token/configuration files stay private. Fresh output directories are required; credentials, row/file contents and private paths must not be shared.

[ZIP](./leak-regression-lab-v0.1.1.zip) · [ZIP SHA-256](./leak-regression-lab-v0.1.1.zip.sha256) · [tarball](./leak-regression-lab-v0.1.1.tgz) · [interactive original recording and trial entry](./leak-regression-lab.html).
