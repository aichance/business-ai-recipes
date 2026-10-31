# Use State Lens in an existing synchronous Python Playwright test

Common preview0.7.0-experimental.1 observes selected browser storage beside your UI steps in one local HTML. Use your existing **HTTP(S) synchronous Page**, Python3.11+ syntax and installed Playwright/browser. No extra Node.js installation, helper process, pip package or fresh browser is required by this file; Python Playwright continues to use its normal existing driver.

## Copy one versioned file

1. Download [state_lens_v0_7_0_experimental_1.py](state_lens_v0_7_0_experimental_1.py) and its [SHA256](state_lens_v0_7_0_experimental_1.py.sha256). Read it and verify the bytes before importing.
2. Put that exact filename next to your existing test without replacing an older file. The MIT notice and common Node-source SHA256 are embedded. Expected file SHA256: `4a28a546da6d5c6601a8affa058cff95ad7bbd8ea9c8cb822f46def16115bc57`.
3. After your existing test has opened its own app, select one key your app actually writes:

```python
import tempfile
from pathlib import Path
from state_lens_v0_7_0_experimental_1 import StateLens

lens = StateLens(page, probes=[
    {"name": "draft", "source": "localStorage", "key": "your-draft-key", "json": True},
])
try:
    with lens.step("Save draft"):
        page.get_by_role("button", name="Save", exact=True).click()
        page.get_by_text("Saved", exact=True).wait_for()
    with lens.step("Reload"):
        page.reload()
        # Keep your app's existing readiness wait here.
    # Keep your normal native assertions.
finally:
    report = Path(tempfile.mkdtemp(prefix="state-lens-")) / "selected-state.html"
    lens.write_html(report)
    print(report)
```

Substitute your app's real selectors and waits. This snippet does not create an app or assert that saving worked. A failed assertion inside a step is re-raised and recorded; use `finally` to retain its observations. Reports are new local files (mode0600); an existing path raises FileExistsError.

## Scope and actual checks

Select one known localStorage/sessionStorage key or IndexedDB database/store/key. For a large JSON document, use `pointer`, for example `/amount` with `json: True`. Keep native checks for the intended object and unselected fields. Use one lens per Page; this does not synchronize tabs, restore data, prove atomicity/server sync or replace Trace. Unavailable reads are INCONCLUSIVE, distinct from absent keys and saved null. The local report contains selected data and the viewport; review it before sharing.

This preview is synchronous and HTTP(S) only. `file://`, async Pages, frames and concurrent/cross-thread steps are outside its scope. Actual integration checks used macOS/Python3.12.4 and Chromium with Python Playwright1.58.0 and1.64.0,8 tests each, including same-case Node/Python observation parity. Other OS/browser/Python combinations remain unverified.

[Source, API details and reproducible maintainer checks](../tools/playwright-state-lens/python/README.md) · [Synthetic Python preview and initial immutable source ZIP](https://github.com/aichance/business-ai-recipes/issues/226) · [Node/manual guide](state-lens-install.md). External users have not yet confirmed use of the Python preview.
