# Declared-field reads: v0.1.2 measurements

Version0.1.2 reads only the configured `id_column` and `expect` fields. Version0.1.1 requested `SELECT *`, including columns whose contents were not used by its comparison. A test app can intentionally grant access to selected fields while keeping other fields unreadable. The checker should not require broader grants to test those intended reads.

This release changes the request, not the application's permissions. It is **not a full column-permission audit**. Declare fields that the owner should read and that the other user/anonymous actor must not receive. Other columns, writes, signed URLs and business-role rules remain outside this contract.

## Actual column-grant control

One owned loopback Supabase stack, synthetic data, two ordinary test users and known private files. The same sessions and configured test records were used for both releases. Authentication was verified by the local Auth service before each run. No third-party application was scanned.

The column-restricted state removes table-level SELECT from `anon` and `authenticated`, grants only `id` and `body`, and leaves the RLS predicate's `owner_id` column unreadable. Existing RLS and Storage policies are retained. The checker still requires the declared owner reads to succeed.

| Checker / state | PASS | FAIL | INCONCLUSIVE | Observation |
| --- | ---: | ---: | ---: | --- |
| v0.1.1 / original table grant | 14 | 0 | 0 | Baseline works |
| v0.1.1 / only id + body granted | 8 | 0 | 6 | Both owner row reads return403; four dependent row probes are not attempted |
| v0.1.2 / same id + body grants | 14 | 0 | 0 | Declared owner fields work without granting owner_id |
| v0.1.2 / same grants, intentionally open row policy | 10 | 4 | 0 | Other-user and anonymous row reads expose expected content |
| v0.1.2 / same grants, original RLS restored | 14 | 0 | 0 | Four regressions resolve without broadening the column grants |

Totals: five runs,70 planned application read cases,66 completed HTTP read responses and four unattempted dependent cases. Two ordinary password sign-ins supplied sessions once; the checker then made10 Auth GET verifications and no password sign-in POSTs. The checker made no application writes. The operator's controlled SQL changed the disposable fixture; a final catalog check confirmed that the original table/column ACLs and RLS policies were restored.

## Packaged regression matrix

The fresh v0.1.2 source ZIP was unpacked and its18 files compared byte-for-byte with the release source. Its CLI was then run against both authored ownership layouts: direct user ownership and team membership. These are two fixture layouts in the same stack, not two independent applications.

Each layout produced:

| State | PASS | FAIL | INCONCLUSIVE |
| --- | ---: | ---: | ---: |
| Secured | 14 | 0 | 0 |
| Row policy intentionally open | 10 | 4 | 0 |
| Object policy intentionally open | 10 | 4 | 0 |
| Bucket intentionally public | 8 | 6 | 0 |
| Owner row access denied | 8 | 0 | 6 |
| Repaired | 14 | 0 | 0 |

Twelve runs produced168 planned application read cases:160 HTTP responses (64 row,96 object) and eight dependent checks not attempted because the owner control failed. Two normal sign-ins supplied the fixture sessions;24 Auth GET verifications were used by the checker. All31 offline protocol/CLI tests passed separately. Scripted HTTP tests are not a substitute for these actual service observations.

## Upgrade and reproduce

Use the [v0.1.2 source ZIP](./leak-regression-lab-v0.1.2.zip), verify its [SHA-256](./leak-regression-lab-v0.1.2.zip.sha256), then follow the [common setup](https://github.com/aichance/business-ai-recipes/tree/main/tools/leak-regression-lab#test-your-environment). No extra config field or dependency is required. Do not loosen your grants to satisfy the checker; a declared field that the owner cannot read remains inconclusive.

The projection policy is part of the contract fingerprint. A v0.1.1 report and a v0.1.2 report deliberately fail comparison with `DIFFERENT_CHECK_CONTRACT`. Rebaseline with v0.1.2 and use that same version before and after subsequent changes. The actual v0.1.2 control detected four regressions and four repairs within its own unchanged contract.

[Full v0.1.2 measurements and artifact hashes](./leak-regression-lab-column-measurements.json). The interactive replay remains explicitly labeled as [v0.1.0 recorded observations](./leak-regression-lab.html#lab); [v0.1.1 session measurements](./leak-regression-lab-session-results.md) are preserved as historical evidence.

Measured2026-10-29 JST on macOS/local Docker, Supabase CLI2.24.3 and Node22.23.4. Latest hosted gateways, an actual OAuth browser flow, native Windows execution, undeclared fields and general application security were not verified by this experiment. This is operator evidence, not independent adoption or a security certification.
