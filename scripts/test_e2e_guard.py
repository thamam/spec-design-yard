"""Unit tests for the e2e preflight guards.

The guards are the only thing standing between a hand-run e2e scenario and
somebody's real project, so they get tests of their own. Run:
    python3 -m unittest scripts.test_e2e_guard   (or: python3 scripts/test_e2e_guard.py)

Do NOT use `unittest discover` over scripts/: it collects unrelated legacy
one-off scripts in this folder, one of which makes a live network call.
"""
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import e2e_guard


class RequireProjectDirTests(unittest.TestCase):
    def test_accepts_the_folder_the_server_serves(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(
                e2e_guard, "_get_project", return_value={"mode": "project", "dir": d}
            ):
                info = e2e_guard.require_project_dir("http://x", d)
        self.assertEqual(info["mode"], "project")

    def test_accepts_an_unresolved_symlinked_path(self):
        # macOS /tmp is a symlink to /private/tmp and the API reports the
        # resolved path; a realpath comparison must see through that.
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(
                e2e_guard,
                "_get_project",
                return_value={"mode": "project", "dir": os.path.realpath(d)},
            ):
                e2e_guard.require_project_dir("http://x", d)

    def test_refuses_a_different_folder(self):
        with mock.patch.object(
            e2e_guard, "_get_project", return_value={"mode": "project", "dir": "/somebody/else"}
        ):
            with self.assertRaises(SystemExit) as cm:
                e2e_guard.require_project_dir("http://x", "/tmp/mine")
        self.assertEqual(cm.exception.code, 2)

    def test_refuses_a_server_in_standalone_mode(self):
        # standalone and unconfigured responses carry no "dir" at all.
        with mock.patch.object(
            e2e_guard, "_get_project", return_value={"mode": "standalone"}
        ):
            with self.assertRaises(SystemExit) as cm:
                e2e_guard.require_project_dir("http://x", "/tmp/mine")
        self.assertEqual(cm.exception.code, 2)


class RequireModeTests(unittest.TestCase):
    def test_accepts_the_expected_mode(self):
        with mock.patch.object(e2e_guard, "_get_project", return_value={"mode": "unconfigured"}):
            e2e_guard.require_mode("http://x", "unconfigured")

    def test_refuses_any_other_mode(self):
        with mock.patch.object(
            e2e_guard, "_get_project", return_value={"mode": "project", "dir": "/real"}
        ):
            with self.assertRaises(SystemExit) as cm:
                e2e_guard.require_mode("http://x", "unconfigured")
        self.assertEqual(cm.exception.code, 2)


class ConfigWriteOptInTests(unittest.TestCase):
    def test_refuses_without_the_opt_in(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit) as cm:
                e2e_guard.require_config_writes_allowed()
        self.assertEqual(cm.exception.code, 2)

    def test_refuses_a_value_that_is_not_exactly_1(self):
        with mock.patch.dict(os.environ, {"SPEC_YARD_E2E_CONFIG_WRITES_OK": "yes"}, clear=True):
            with self.assertRaises(SystemExit):
                e2e_guard.require_config_writes_allowed()

    def test_accepts_the_harness_opt_in(self):
        with mock.patch.dict(os.environ, {"SPEC_YARD_E2E_CONFIG_WRITES_OK": "1"}, clear=True):
            e2e_guard.require_config_writes_allowed()


class SeedGuardTests(unittest.TestCase):
    def test_allows_seeding_an_empty_folder(self):
        with tempfile.TemporaryDirectory() as d:
            e2e_guard.require_safe_to_seed(d)

    def test_allows_overwriting_a_previous_fixture(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "main.spec.yaml"), "w", encoding="utf-8") as fh:
                fh.write(e2e_guard.SEED_MARKER + "\nsystem:\n  name: old fixture\n")
            e2e_guard.require_safe_to_seed(d)

    def test_refuses_to_overwrite_somebody_elses_spec(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "main.spec.yaml"), "w", encoding="utf-8") as fh:
                fh.write("system:\n  name: PRECIOUS REAL PROJECT\n")
            with self.assertRaises(SystemExit) as cm:
                e2e_guard.require_safe_to_seed(d)
        self.assertEqual(cm.exception.code, 2)


class FreshDirTests(unittest.TestCase):
    def test_an_absent_folder_is_fresh(self):
        with tempfile.TemporaryDirectory() as d:
            e2e_guard.require_fresh_dir(os.path.join(d, "not-created-yet"))

    def test_an_empty_folder_is_fresh(self):
        with tempfile.TemporaryDirectory() as d:
            e2e_guard.require_fresh_dir(d)

    def test_a_folder_holding_our_own_fixture_is_fresh(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "main.spec.yaml"), "w", encoding="utf-8") as fh:
                fh.write(e2e_guard.SEED_MARKER + "\nsystem:\n  name: last run\n")
            e2e_guard.require_fresh_dir(d)

    def test_a_folder_holding_somebody_elses_spec_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "main.spec.yaml"), "w", encoding="utf-8") as fh:
                fh.write("system:\n  name: PRECIOUS REAL PROJECT\n")
            with self.assertRaises(SystemExit) as cm:
                e2e_guard.require_fresh_dir(d, scenario="first-run/project-A")
        self.assertEqual(cm.exception.code, 2)


class FailClosedTests(unittest.TestCase):
    def test_an_unreachable_server_is_a_refusal_not_a_pass(self):
        with mock.patch.object(
            e2e_guard.urllib.request, "urlopen", side_effect=OSError("connection refused")
        ):
            with self.assertRaises(SystemExit) as cm:
                e2e_guard.require_mode("http://127.0.0.1:1", "unconfigured")
        self.assertEqual(cm.exception.code, 2)

    def test_systemexit_is_not_swallowed_by_a_bare_except_exception(self):
        # The scenarios wrap page work in `except Exception`. SystemExit
        # inherits from BaseException, not Exception, so a guard firing inside
        # such a block still stops the run.
        self.assertFalse(issubclass(SystemExit, Exception))


if __name__ == "__main__":
    unittest.main()
