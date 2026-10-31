# State Lens for synchronous Python Playwright

**0.7.0-experimental.1 preview.** Add selected localStorage/sessionStorage/IndexedDB
observations beside your existing Python Playwright UI steps, in one local HTML.
The generated `state_lens.py` contains the same browser collector and HTML viewer
as the common Node module. There is no Node process, package install, API key or
new browser session required at runtime. Keep your existing Python Playwright
installation, Page, waits and assertions.

## Use one known storage key in your own test

Review and copy `state_lens.py` beside your existing test. It is a plain MIT file;
no `pip install state-lens` package exists or is required.

```python
import tempfile
from pathlib import Path
from state_lens import StateLens

# page is the synchronous Playwright Page already opened by YOUR test.
lens = StateLens(page, probes=[
    {"name": "draft", "source": "localStorage", "key": "your-draft-key", "json": True},
])
try:
    with lens.step("Save draft"):
        page.get_by_role("button", name="Save", exact=True).click()
        page.get_by_text("Saved", exact=True).wait_for()
    with lens.step("Reload"):
        page.reload()
        # Keep YOUR app's normal readiness wait here.
    # Keep YOUR native assertions here. The helper does not replace them.
finally:
    # A fresh path on every run; previous reports are never overwritten.
    report = Path(tempfile.mkdtemp(prefix="state-lens-")) / "selected-state.html"
    lens.write_html(report)
    print(report)
```

Substitute your existing selectors/readiness waits and a key your application
actually writes. A single key may have nested fields; add `"pointer": "/amount"`
with `"json": True` to inspect one field rather than a large document. For
IndexedDB use `{"name": "draft", "source": "indexedDB", "database": "your-db",
"store": "your-store", "key": "known-key"}`. The same selection/size/type/origin
limits as the Node version apply. Numeric IndexedDB keys additionally must fit
the safe JavaScript numeric range.

For two existing pages, make **one StateLens per Page**. Shared localStorage can
be observed on each; sessionStorage stays tab-specific. Add `lens.checkpoint()`
where you already know an action has settled. The report aligns sequential
observations; it does not synchronize tabs, fix lost updates, prove atomicity,
prove persistence at a particular instant or identify the root cause.

A refused/unsupported read is `INCONCLUSIVE`, distinct from an absent key or saved
null. Native assertions remain the verdict. A failed assertion inside a `step`
produces a failed checkpoint and is re-raised. Place report writing in `finally`
to keep observations when your normal test fails. `write_html` uses exclusive
creation and mode0600; use a fresh directory for every run.

## Current support and verification

- **Synchronous API only**, Python3.11+ syntax. Async Page, concurrent steps,
  frame objects and cross-thread use are outside this preview.
- Actual integration runs: macOS/Python3.12.4, Python Playwright1.58.0 and1.64.0,
  Chromium;8 browser tests in each environment. Node22/Playwright1.64.0 parity
  was checked for the same synthetic save/reload scenario. This is not Windows,
  Firefox, WebKit or every Python/Playwright version verification.
- The collector checks only the selected values. Undefined/Date annotations,
  JSON-pointer selection and origin boundaries follow the shared collector.
- The local report contains selected data and the captured viewport. Review it
  before sharing. No upload, telemetry or data restoration is performed.

## Reproduce the source build and checks

Maintainers with the common Node package dependencies installed can run:

```sh
node python/build.mjs --check
npm test
npm run test:types
npm run test:consumer
python3 -B -m unittest discover -s python -p 'test_*.py'
```

`runtime.py` supplies the synchronous host adapter. `build.mjs` extracts the
actual callback passed to the common Node Page boundary and its HTML viewer;
`state_lens.py` is generated and includes the Node source SHA256. Tests use only
a synthetic localhost app, never the prospective user's project. `parity.mjs`
needs Node for maintainer tests, not for using `state_lens.py` in your test.

The stable hosted0.6.1 entry remains available during this preview. This Python
addition is not proof that an outside developer has used it yet.
