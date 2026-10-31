"""State Lens for an existing synchronous Playwright Page (MIT).

This source is a build template. Import the generated state_lens.py instead.
"""

from __future__ import annotations

import base64
import copy
import html
import inspect
import json
import math
import os
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

LIBRARY_VERSION = "@GENERATED_VERSION@"
SOURCE_SHA256 = "@GENERATED_SOURCE_SHA256@"
BROWSER_OBSERVER = "@GENERATED_OBSERVER@"
HTML_HEAD = "@GENERATED_HTML_HEAD@"
HTML_TAIL = "@GENERATED_HTML_TAIL@"
TITLE_MARKER = "STATE_LENS_TITLE_6b138ce9"
_MISSING = object()


def _origin(url):
    try:
        u = urlsplit(url)
        if u.scheme not in ("http", "https") or not u.hostname:
            return None
        host = u.hostname.lower()
        host = f"[{host}]" if ":" in host else host.encode("idna").decode("ascii")
        port = u.port
        suffix = (
            "" if port is None or (u.scheme, port) in (("http", 80), ("https", 443)) else f":{port}"
        )
        return f"{u.scheme}://{host}{suffix}"
    except (ValueError, UnicodeError):
        return None


def _validate(probes, timeout_ms):
    if not isinstance(probes, list) or not 1 <= len(probes) <= 16:
        raise ValueError("Select 1–16 application probes")
    names = set()
    for p in probes:
        if (
            not isinstance(p, dict)
            or not isinstance(p.get("name"), str)
            or not p["name"]
            or p["name"] in names
        ):
            raise ValueError("Probe names must be nonempty and unique")
        names.add(p["name"])
        if p.get("source") not in ("localStorage", "sessionStorage", "indexedDB"):
            raise ValueError("Unsupported probe source")
        if p["source"] in ("localStorage", "sessionStorage") and not isinstance(p.get("key"), str):
            raise ValueError("Web Storage requires a string key")
        if p["source"] == "indexedDB":
            k = p.get("key")
            if not all(isinstance(p.get(x), str) and p[x] for x in ("database", "store")) or not (
                isinstance(k, str)
                or type(k) in (int, float)
                and math.isfinite(k)
                and abs(k) <= 2**53 - 1
            ):
                raise ValueError("IndexedDB requires database, store and a string/safe-number key")
        if "pointer" in p:
            pointer = p["pointer"]
            if not isinstance(pointer, str) or pointer and not pointer.startswith("/"):
                raise ValueError("pointer must be an RFC6901 JSON pointer")
            if len(pointer.split("/")) > 33 or len(pointer.encode("utf-8")) > 2048:
                raise ValueError("pointer exceeds32 segments or2048 UTF8 bytes")
            for part in pointer.split("~")[1:]:
                if not part or part[0] not in "01":
                    raise ValueError("Invalid RFC6901 escape")
            if p["source"] != "indexedDB" and p.get("json") is not True:
                raise ValueError("Web Storage pointer selection requires json:True")
    if type(timeout_ms) is not int or not 50 <= timeout_ms <= 5000:
        raise ValueError("timeout_ms must be50–5000")
    json.dumps(probes, allow_nan=False)


def _encoded(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))


def differences(before, after, path="$", output=None):
    out = [] if output is None else output
    if before is not _MISSING and after is not _MISSING and _encoded(before) == _encoded(after):
        return out
    if isinstance(before, dict) and isinstance(after, dict):
        for key in dict.fromkeys([*before, *after]):
            differences(before.get(key, _MISSING), after.get(key, _MISSING), f"{path}.{key}", out)
    elif isinstance(before, list) and isinstance(after, list):
        for index in range(max(len(before), len(after))):
            differences(
                before[index] if index < len(before) else _MISSING,
                after[index] if index < len(after) else _MISSING,
                f"{path}.{index}",
                out,
            )
    else:
        out.append(
            {
                "path": path,
                "before": "(missing)" if before is _MISSING else before,
                "after": "(missing)" if after is _MISSING else after,
            }
        )
    return out


def render_timeline(report):
    data = (
        _encoded(report)
        .replace("<", "\\u003c")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )
    head = HTML_HEAD.replace(TITLE_MARKER, html.escape(str(report["title"]), quote=True))
    return head + data + HTML_TAIL


class StateLens:
    """Observe selected state on one sync Page; keep your own waits/assertions."""

    def __init__(
        self,
        page,
        *,
        probes,
        timeout_ms=750,
        screenshots=True,
        title="What happened to the saved data?",
    ):
        _validate(probes, timeout_ms)
        if inspect.iscoroutinefunction(page.evaluate) or not isinstance(page.url, str):
            raise TypeError("Use a synchronous Playwright Page; async API is not supported")
        self._page = page
        self._probes = copy.deepcopy(probes)
        self._timeout = timeout_ms
        self._screenshots = screenshots
        self._title = title
        self._checkpoints = []
        self._running = False
        self._selected_origin = _origin(page.url)

    def _capture(self, label, action):
        url = self._page.url
        origin = _origin(url)
        if self._selected_origin is None and origin is not None:
            self._selected_origin = origin
        in_scope = origin is not None and origin == self._selected_origin
        values = {}
        for probe in self._probes:
            try:
                values[probe["name"]] = (
                    json.loads(
                        self._page.evaluate(
                            BROWSER_OBSERVER,
                            {
                                "probe": probe,
                                "timeout": self._timeout,
                                "expectedOrigin": self._selected_origin,
                            },
                        )
                    )
                    if in_scope
                    else {
                        "status": "INCONCLUSIVE",
                        "reason": "Outside the first selected HTTP origin",
                    }
                )
            except Exception as error:
                values[probe["name"]] = {"status": "INCONCLUSIVE", "reason": str(error)}
        screenshot = screenshot_error = None
        if self._screenshots and in_scope and _origin(self._page.url) == origin:
            try:
                screenshot = base64.b64encode(
                    self._page.screenshot(type="png", timeout=3000)
                ).decode("ascii")
            except Exception as error:
                screenshot_error = str(error)
        if _origin(self._page.url) != origin:
            in_scope = False
            screenshot = None
            values = {
                p["name"]: {
                    "status": "INCONCLUSIVE",
                    "reason": "Origin changed during the sequential observation",
                }
                for p in self._probes
            }
        previous = self._checkpoints[-1] if self._checkpoints else None
        same_scope = (
            in_scope
            and previous
            and previous["origin"] == origin
            and previous["scopeStatus"] == "SELECTED_ORIGIN"
        )
        checkpoint = {
            "index": len(self._checkpoints),
            "label": label,
            "observedAt": datetime.now(UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "url": url,
            "endURL": self._page.url,
            "origin": origin,
            "selectedOrigin": self._selected_origin,
            "scopeStatus": "SELECTED_ORIGIN" if in_scope else "OUTSIDE_ORIGIN",
            "action": action,
            "values": values,
            "changes": differences(previous["values"], values) if same_scope else [],
            "screenshot": screenshot,
            "screenshotError": screenshot_error,
        }
        self._checkpoints.append(checkpoint)
        return copy.deepcopy(checkpoint)

    def checkpoint(self, label):
        if self._running:
            raise RuntimeError("Overlapping steps are not supported")
        self._running = True
        try:
            return self._capture(label, {"status": "CHECKPOINT"})
        finally:
            self._running = False

    @contextmanager
    def step(self, label):
        if self._running:
            raise RuntimeError("Overlapping steps are not supported")
        self._running = True
        try:
            self._capture(f"{label} · before", {"status": "BEFORE"})
            try:
                yield
            except Exception as error:
                self._capture(f"{label} · failed", {"status": "FAILED", "error": str(error)})
                raise
            else:
                self._capture(f"{label} · after", {"status": "COMPLETED"})
        finally:
            self._running = False

    def report(self):
        return copy.deepcopy(
            {
                "schema": 4,
                "libraryVersion": LIBRARY_VERSION,
                "title": self._title,
                "probes": self._probes,
                "checkpoints": self._checkpoints,
            }
        )

    def write_html(self, path):
        """Write a new local report; never replace a previous report."""
        text = render_timeline(self.report())
        fd = os.open(Path(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
