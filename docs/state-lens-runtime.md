# State Lens runtime compatibility

Version0.6.1-experimental.1 lowers the declared State Lens runtime floor to
Node20.19.0. The previous common0.6.0 also passed the first checks below before
any source or engine metadata was changed. This is a measured compatibility
update, not a change to the observation API, schema4, limits or storage behavior.
Older immutable modules and packages keep their original metadata.

## What was exercised

Operator checks on macOS arm64, 2026-10-31:

| Runtime | Existing Playwright | Browser | Checks |
| --- | --- | --- | --- |
| Node20.19.0 | 1.62.1 | Chromium151.0.7922.34 | 50 tests, three TypeScript consumer modes, one ordinary Playwright Test consumer |
| Node22.23.4 | 1.64.0 | Chromium156.0.8078.4 | 50 tests, three TypeScript consumer modes, one ordinary Playwright Test consumer |

The Node20 row uses TypeScript5.9.3 and @types/node20.19.37; the Node22 row uses
TypeScript5.9.3 and @types/node22.20.5. The tests include localStorage,
sessionStorage, IndexedDB, selected JSON fields, undefined/Date representation,
manual-capture cancellation/output handling and a controlled synthetic browser.
The manual-entry tests request a visible browser in production and substitute a
headless browser for automation. They do not prove a human manual run on every OS.

The repository CI runs the same existing test/type/consumer commands in separate
Node20.19.0/Playwright1.62.1 and Node22/Playwright1.64.0 jobs on Ubuntu.
A successful CI run is operator verification; it does not establish external use.
The application, its real storage and its original assertions were not tested
merely because these synthetic checks passed.

## Use your existing project environment

Use your project's installed Node and Playwright/browser. The library receives
an existing Page and imports no Playwright dependency. The manual entry resolves
your project's existing installation; it does not install a browser or upgrade
your application. [Integration](state-lens-install.md) / [manual entry](state-lens-manual.md).

The declared peer range is not a claim that every Playwright, Node, browser and
OS combination has been tested. Node versions below20.19.0, other browser engines,
and manual-entry use on Windows are unverified by this compatibility check.
Existing independent author reports retain their own versions and environments.
Keep your normal Trace and assertions: observations do not establish correctness,
server commit time or a performance improvement.
