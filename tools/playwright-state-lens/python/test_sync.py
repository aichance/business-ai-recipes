import importlib.metadata
import json
import os
import subprocess
import tempfile
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright
from state_lens import StateLens, differences, render_timeline

HERE = Path(__file__).resolve().parent
PROBES = [
    {"name": "draft", "source": "localStorage", "key": "draft", "json": True},
    {"name": "session", "source": "sessionStorage", "key": "session", "json": True},
    {
        "name": "idb",
        "source": "indexedDB",
        "database": "lens-python-test",
        "store": "docs",
        "key": "one",
    },
    {"name": "absent", "source": "localStorage", "key": "absent", "json": True},
]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class SyncBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="state-lens-python-test-")
        Path(cls.directory.name, "index.html").write_bytes((HERE / "fixture.html").read_bytes())
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(Quiet, directory=cls.directory.name)
        )
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.directory.cleanup()

    def setUp(self):
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        self.page.goto(self.url)
        self.page.evaluate((HERE / "fixture.js").read_text())

    def tearDown(self):
        self.context.close()

    def make_lens(self, **options):
        return StateLens(self.page, probes=PROBES, **options)

    def test_same_common_node_and_python_observations(self):
        lens = self.make_lens(screenshots=False)
        lens.checkpoint("initial")
        with lens.step("Save and reload"):
            self.page.locator("#save").click()
            self.page.get_by_text("Saved", exact=True).wait_for()
            self.assertEqual(self.page.evaluate("JSON.parse(localStorage.draft).amount"), 1234.57)
            self.page.reload()
        report = lens.report()
        actual = [
            {k: c[k] for k in ("label", "action", "values", "changes", "scopeStatus")}
            for c in report["checkpoints"]
        ]
        node = subprocess.run(
            ["node", str(HERE / "parity.mjs"), self.url], check=True, capture_output=True, text=True
        )
        self.assertEqual(actual, json.loads(node.stdout))
        initial = actual[0]["values"]
        self.assertEqual(initial["idb"]["datePaths"], ["/at"])
        self.assertEqual(initial["idb"]["undefinedPaths"], ["/unset"])
        self.assertFalse(initial["absent"]["exists"])
        self.assertEqual(initial["draft"]["value"]["amount"], 1234.567)
        print(
            "Node/Python parity: exact values, changes, actions and scope; Python Playwright",
            importlib.metadata.version("playwright"),
        )

    def test_same_origin_two_pages_and_reload(self):
        other = self.context.new_page()
        other.goto(self.url)
        other.evaluate("sessionStorage.setItem('session', 'null')")
        a, b = self.make_lens(screenshots=False), StateLens(other, probes=PROBES, screenshots=False)
        self.assertEqual(a.checkpoint("a")["values"]["session"]["value"], {"tab": "a"})
        self.assertIsNone(b.checkpoint("b")["values"]["session"]["value"])
        self.assertTrue(b.report()["checkpoints"][0]["values"]["session"]["exists"])
        self.page.locator("#save").click()
        other.reload()
        c = b.checkpoint("other reload")
        self.assertEqual(c["values"]["draft"]["value"]["amount"], 1234.57)
        self.assertIsNone(c["values"]["session"]["value"])

    def test_failed_assertion_still_records_and_rerun_keeps_previous_report(self):
        lens = self.make_lens()
        with self.assertRaisesRegex(AssertionError, "native failure"):
            with lens.step("native assertion"):
                raise AssertionError("native failure")
        self.assertEqual(lens.report()["checkpoints"][-1]["action"]["status"], "FAILED")
        self.assertTrue(lens.report()["checkpoints"][0]["screenshot"].startswith("iVBOR"))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "report.html")
            lens.write_html(path)
            original = path.read_bytes()
            with self.assertRaises(FileExistsError):
                lens.write_html(path)
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            lens.write_html(Path(directory, "next.html"))

    def test_report_display_does_not_execute_embedded_text(self):
        lens = self.make_lens(title="</title><script>window.__bad=1</script>")
        lens.checkpoint("</script><script>window.__bad=1</script>")
        report = self.context.new_page()
        report.set_content(render_timeline(lens.report()))
        report.get_by_role("button", name="1. </script><script>window.__bad=1</script>").click()
        self.assertIsNone(report.evaluate("window.__bad"))
        self.assertIn("1234.567", report.locator("#values").inner_text())
        self.assertTrue(
            report.locator("#screen").evaluate("img => img.complete && img.naturalWidth >0")
        )

    def test_absence_null_refusal_and_origin_change_are_distinct(self):
        lens = self.make_lens(screenshots=False)
        self.page.evaluate("localStorage.setItem('draft','null')")
        c = lens.checkpoint("null")["values"]
        self.assertTrue(c["draft"]["exists"])
        self.assertIsNone(c["draft"]["value"])
        self.assertFalse(c["absent"]["exists"])
        self.page.evaluate(
            "Object.defineProperty(window,'localStorage',{get(){throw Error('synthetic refusal')}})"
        )
        c = lens.checkpoint("refused")["values"]
        self.assertEqual(c["draft"]["status"], "INCONCLUSIVE")
        self.assertIn("synthetic refusal", c["draft"]["reason"])
        self.page.goto(self.url.replace("127.0.0.1", "localhost"))
        c = lens.checkpoint("other origin")
        self.assertEqual(c["scopeStatus"], "OUTSIDE_ORIGIN")
        self.assertEqual(c["changes"], [])
        self.assertTrue(all(v["status"] == "INCONCLUSIVE" for v in c["values"].values()))

    def test_selected_field_in_large_record_and_snapshot_immutability(self):
        self.page.evaluate(
            "localStorage.setItem('large',JSON.stringify({note:'x'.repeat(70000),amount:1234.567}))"
        )
        probes = [
            {
                "name": "amount",
                "source": "localStorage",
                "key": "large",
                "json": True,
                "pointer": "/amount",
            }
        ]
        lens = StateLens(self.page, probes=probes, screenshots=False)
        probes[0]["pointer"] = "/wrong"
        c = lens.checkpoint("selected")
        self.assertEqual(c["values"]["amount"]["value"], 1234.567)
        c["values"]["amount"]["value"] = 0
        self.assertEqual(lens.report()["checkpoints"][0]["values"]["amount"]["value"], 1234.567)

    def test_invalid_configuration_async_page_and_nested_step(self):
        with self.assertRaises(ValueError):
            StateLens(self.page, probes=PROBES, timeout_ms=True)
        for pointer in ("/wrong~", "/wrong~2", "x"):
            with self.assertRaises(ValueError):
                StateLens(self.page, probes=[{**PROBES[0], "pointer": pointer}])

        class AsyncPage:
            url = "http://example.invalid"

            async def evaluate(self, *args):
                pass

        with self.assertRaises(TypeError):
            StateLens(AsyncPage(), probes=PROBES)
        lens = self.make_lens(screenshots=False)
        with self.assertRaisesRegex(RuntimeError, "Overlapping"):
            with lens.step("outer"):
                lens.checkpoint("inner")
        self.assertEqual(lens.report()["checkpoints"][-1]["action"]["status"], "FAILED")
        lens.checkpoint("after recovery")

    def test_unchanged_false_and_zero_are_not_conflated(self):
        self.assertEqual(
            differences({"flag": False}, {"flag": 0}),
            [{"path": "$.flag", "before": False, "after": 0}],
        )
        self.assertEqual(
            differences({"a": None}, {}), [{"path": "$.a", "before": None, "after": "(missing)"}]
        )


if __name__ == "__main__":
    unittest.main()
