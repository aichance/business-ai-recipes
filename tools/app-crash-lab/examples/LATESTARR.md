# LatestArr: save newsletter settings, then reject a zero-day lookback

This example checks **unmodified LatestArr v0.11.2** using its official
container image. It saves a synthetic newsletter's name, subject and 14-day
lookback, reloads, and separately attempts a rejected 0-day update. It reads
the saved API record as well as the visible saved row. The editable draft
is intentionally not treated as saved data.

[LatestArr](https://www.latestarr.app/) is Jeremy Shields's GPLv3-licensed
self-hosted newsletter app. These files contain our test setup and contract,
not a copy of the app. This is our compatibility test, not an author adoption
report or a newly discovered defect.

## Start a disposable instance

Use the [official setup instructions](https://github.com/jshields-ca/LatestArr#quick-start)
with a **new, empty database**, a generated encryption key and a loopback-only
port such as `127.0.0.1:54193`. Do not open the setup wizard or create an admin
yet: the preparation script below needs the initial `needsSetup` state.
Do not connect SMTP, sources, recipients or an identity provider.

The exact image used on 2026-10-11 was:

```text
ghcr.io/jshields-ca/latestarr@sha256:5d47ce947ec572cb3630f29c01066663a6053877293917ec18a58d860abb1f8d
```

It reports `v0.11.2`. The default pull on our Apple Silicon Mac failed with
`no matching manifest for linux/arm64/v8`; using Docker's
`--platform linux/amd64` started this image. An ARM-native build was not
verified. Our app container used a fresh bind-mounted database and an internal
Docker network; a loopback TCP forwarder provided browser access without
giving the app outbound network access. The app source/image was unchanged.

SMTP and media connections are needed for delivery, but are not needed for
this settings-only test. Do not click Preview, Send now or Send test.

## Prepare and run

Use Node 22+ in the **current App Crash Lab source directory**. These new
example files are not in the original 0.3.0 release archive. Keep
`prepare-latestarr.mjs` and `latestarr.template.json` together in `examples/`.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node examples/prepare-latestarr.mjs http://127.0.0.1:54193
node cli.mjs run .crash-lab/latestarr.local.json --out .crash-lab/latestarr-first
npx playwright test --config .crash-lab/latestarr-first/playwright.config.mjs
```

Preparation refuses a non-loopback origin, an already initialized app or an
existing output file. On a fresh instance it creates one synthetic local
admin, generates a random test password, and creates one newsletter. Its
schedule is at least 31 days in the future and it is immediately disabled.
The output is a private file with mode `0600` where supported. It does not
print the password or change a real account.

**Keep the generated contract, reports, traces and exported tests local:**
they contain that disposable test login. The public template contains only
placeholders; run the preparation script instead of passing the template
directly to the runner. Do not use a real password or publish generated files.

Before each check the contract signs in and resets **only its generated
newsletter ID** to the synthetic baseline. The UI then saves the new values.
This also makes the exported test rerunnable against the same disposable
database. Use a new report output directory on subsequent CLI runs; do not
run preparation again against an initialized app. Stop the disposable app
when finished. If preparation fails after creating its fixture, start over
with a new empty database instead of pointing it at an existing installation.

## Verified result

On 2026-10-11 with Node 22.16.0, Playwright 1.64.0 and App Crash Lab 0.3.0:

| Check | Required result | Observed |
| --- | --- | --- |
| Reload | Saved record, 14-day row and disabled state stay equal | PASS |
| Rejected update | Exact visible `Too small: expected number to be >0` alert, then unchanged saved record | PASS |
| Exported standalone tests | Repeat both checks with their explicit fixture reset | 2 passed |

The comparison includes the complete selected newsletter API response:
IDs, timestamps, settings, empty source links and empty recipient groups.
Known baseline assertions require the saved name, subject, 14-day lookback,
one matching saved row and a disabled newsletter. The rejection test first
requires that its specific alert is absent, then waits for that alert to
appear before comparing saved state. A generic alert is not enough.

This does **not** test SMTP delivery, partial sends, duplicate-recipient
recovery, startup catch-up, backups, real media or concurrency. The browser
reload does not restart the server. No message was sent by this fixture.
