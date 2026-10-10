"""Anchor self-check for scripts/build.py: a rule whose anchor is not found exactly once must abort."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import build  # noqa: E402


class AnchorSelfCheck(unittest.TestCase):
    def test_once_accepts_unique_anchor(self):
        self.assertEqual(build.once("abc", "b"), 1)

    def test_once_rejects_missing_anchor(self):
        with self.assertRaises(build.AnchorError):
            build.once("abc", "zzz")

    def test_once_rejects_duplicate_anchor(self):
        with self.assertRaises(build.AnchorError):
            build.once("abab", "ab")

    def test_transform_output_has_no_private_surfaces(self):
        src_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "spectrum-cup.html")
        with open(src_path, encoding="utf-8") as f:
            out = build.transform(f.read())
        for needle in ("/_blob/", "meSel", "claude.use", 'data-tab="score"', "p-pots", "p-setup", "p-score", "p-hcp"):
            self.assertNotIn(needle, out, needle)
        self.assertTrue(out.startswith("<!doctype html>"))
        self.assertIn('id="syncNote"', out)


if __name__ == "__main__":
    unittest.main()
