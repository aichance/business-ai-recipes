# Can your full backup read its own export?

Copy one [Vitest test file](backupExportContract.test.ts) into [JobApplicationTracker](https://github.com/Simplificatedd/JobApplicationTracker)'s existing suite. It calls the actual `createBackupFile`, `parseBackupFile`, and validated resume-metadata path. No App Crash Lab runner, browser, account or new dependency is needed for this module-level check.

This addresses the export/import size contract reported by the owner in [issue #128](https://github.com/Simplificatedd/JobApplicationTracker/issues/128). It is a runnable regression example, not a fix or a claim that the full audit is covered.

## Run in your checkout

Review [the file](backupExportContract.test.ts), save it as `src/lib/backupExportContract.test.ts` in your existing tracker checkout, then use the project's installed test dependencies:

```sh
npm test -- src/lib/backupExportContract.test.ts --maxWorkers=1
```

We measured Node 22.16.0 and the project's locked Vitest 4.1.11. Use your project's supported runtime. The largest case materializes about 112 MB of JSON and takes additional memory; peak memory was not measured. Cases run sequentially with a 30-second timeout each. No cloud configuration is read by this test.

## Measured outcome on the original source

Upstream pin: [`bae82842d4f9d29897ee9017d6fa4074de4949db`](https://github.com/Simplificatedd/JobApplicationTracker/tree/bae82842d4f9d29897ee9017d6fa4074de4949db).

| Case | Original result |
| --- | --- |
| One small valid synthetic file | PASS; metadata, identity and full payload retained |
| Seven files, each exactly 10 MiB | PASS; metadata, identities and all full payloads retained |
| Eight files, each exactly 10 MiB | **FAIL**; exporter returns 111,855,413 bytes, parser rejects its 100 MiB cap (104,857,600 bytes) |

Expected on that pin: exit 1, **2 PASS / 1 FAIL**, no skipped or expected-failure tests. The three-case Vitest invocation took 2.80 seconds in our local run. The existing backup/file tests independently passed **37/37**. Typecheck and targeted ESLint passed with the new file.

The fixtures go through the original upload validator, hash and metadata functions before export. They have PDF signatures and synthetic bodies, distinct contents and real byte sizes. The test neither builds a replacement backup JSON nor overwrites `File.size`. A successful parse must preserve each metadata record, storage key and complete encoded payload; record counts alone are insufficient.

A separate local diagnostic changed only the parser's 100 MiB constant to 200 MiB and made all three cases pass. The original source was then restored byte for byte. **That diagnostic is not a production fix:** it does not establish that R2 uploads, request limits, quotas or partial-upload cleanup can handle the library.

## What remains outside this check

This tests a data-layer export/parse roundtrip. It does not start the browser, authenticate to Cloudflare, upload to R2, replace application state or prove a full backup restore. It does not validate PDF rendering, the legacy oversized-file recovery path or partial remote failures from issue #128. Those still need the author's existing integration tests and policy decisions.

The regression expresses the currently advertised full-export contract. If the author deliberately changes that contract to refuse unsupported exports before creating a file, the acceptance test and documentation need to express that decision; do not turn this into a blanket `rejects` assertion or skip the failing case.

Only the authored test and [measurement metadata](RESULTS.json) are distributed here. The upstream implementation stays in your own checkout. This repository is MIT licensed.

If you use this App Crash Lab native example, a useful [result report](https://github.com/aichance/business-ai-recipes/issues/new?title=Backup%20export%20contract%20result) includes your source version, all three results and any setup problem. Starring the repository to find the regression examples for your next release is optional.
