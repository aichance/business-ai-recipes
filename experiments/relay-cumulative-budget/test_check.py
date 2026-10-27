"""Offline acceptance and refusal checks for the native boundary report contract."""

from copy import deepcopy
import unittest

from check import BUDGET, TOOL_VERSION, inspect_summary


class NativeBoundaryContract(unittest.TestCase):
    def report(self, exhausted):
        return {
            "status": "INSPECTED", "tool_version": TOOL_VERSION,
            "client_version": "codex-cli 0.164.0",
            "observation": {
                "model_turn_requests": 0, "cleanup_confirmed": True,
                "native_servers_started": 2, "native_servers_closed": 2,
                "requested_model": "gpt-6.1-sol", "resolved_model": "gpt-6.1-sol",
                "requested_effort": "max", "resolved_effort": "max",
                "request_methods": ["initialize", "config/read", "thread/start"],
            },
            "estimate": {
                "basis": "local-snapshot-and-rust-v0.164.0-loader",
                "effective_project_doc_max_bytes": BUDGET,
                "startup_directory": "child", "other_native_source_count": 0,
                "unknown_external_source_count": 0, "selection_matches_native_paths": True,
                "snapshot_stable": True, "issues": [],
                "native_project_sources": ["AGENTS.md"] if exhausted else ["AGENTS.md", "child/AGENTS.md"],
                "rows": [
                    {"path": "AGENTS.md", "file_bytes": BUDGET if exhausted else BUDGET - 1,
                     "examined_bytes": BUDGET if exhausted else BUDGET - 1,
                     "estimated_status": "FULL", "selected": True, "native_listed": True},
                    {"path": "child/AGENTS.md", "file_bytes": 60,
                     "examined_bytes": 0 if exhausted else 1,
                     "estimated_status": "SKIPPED_BUDGET" if exhausted else "TRUNCATED",
                     "selected": True, "native_listed": not exhausted},
                ],
            },
            "receipt": "NOT_TESTED", "compliance": "NOT_TESTED",
        }

    def summarize(self, report, exhausted):
        return inspect_summary(
            report, {"AGENTS.md": BUDGET if exhausted else BUDGET - 1, "child/AGENTS.md": 60},
            "child", [BUDGET, 0] if exhausted else [BUDGET - 1, 1],
            ["FULL", "SKIPPED_BUDGET"] if exhausted else ["FULL", "TRUNCATED"],
            ["AGENTS.md"] if exhausted else ["AGENTS.md", "child/AGENTS.md"],
        )

    def test_one_byte_boundary_changes_native_child_membership(self):
        for exhausted in [False, True]:
            with self.subTest(exhausted=exhausted):
                result = self.summarize(self.report(exhausted), exhausted)
                self.assertTrue(result["expectations_match"])
                self.assertEqual("child/AGENTS.md" in result["native_project_sources"], not exhausted)
                self.assertEqual(result["receipt"], "NOT_TESTED")

    def test_rejects_false_path_and_lifetime_evidence(self):
        original = self.report(True)
        for field, bad in [
            ("tool_version", "0.1.3"),
            ("client_version", "codex-cli 0.164.1"),
            ("receipt", "RECEIVED"),
        ]:
            with self.subTest(field=field):
                report = deepcopy(original)
                report[field] = bad
                with self.assertRaises(ValueError):
                    self.summarize(report, True)
        for section, field, bad in [
            ("observation", "model_turn_requests", 1),
            ("observation", "native_servers_closed", 1),
            ("estimate", "native_project_sources", ["AGENTS.md", "child/AGENTS.md"]),
            ("estimate", "native_project_sources", ["AGENTS.md", "AGENTS.md"]),
        ]:
            with self.subTest(field=field, bad=bad):
                report = deepcopy(original)
                report[section][field] = bad
                with self.assertRaises(ValueError):
                    self.summarize(report, True)

    def test_rejects_skipped_child_claimed_as_native_or_nonzero(self):
        for field, bad in [("native_listed", True), ("examined_bytes", -1),
                           ("examined_bytes", 1), ("estimated_status", "FULL")]:
            with self.subTest(field=field, bad=bad):
                report = self.report(True)
                report["estimate"]["rows"][1][field] = bad
                with self.assertRaises(ValueError):
                    self.summarize(report, True)


if __name__ == "__main__":
    unittest.main()
