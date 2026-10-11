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
        out = transformed()
        for needle in ("/_blob/", "meSel", "claude.use", 'data-tab="score"', "p-pots", "p-setup", "p-score", "p-hcp"):
            self.assertNotIn(needle, out, needle)
        self.assertTrue(out.startswith("<!doctype html>"))
        self.assertIn('id="syncNote"', out)


def transformed():
    src_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "spectrum-cup.html")
    with open(src_path, encoding="utf-8") as f:
        return build.transform(f.read())


class SecurityHardening(unittest.TestCase):
    """Rules added by the security review (F1, F2, F3, F10) and the player-tally nowrap note."""

    def test_team_is_whitelisted_before_any_interpolation(self):  # F1
        out = transformed()
        self.assertIn("function teamOf(pid){const t=(players[pid]||{}).team;return t==='PS'||t==='IL'?t:''}", out)
        self.assertNotIn("function teamOf(pid){return (players[pid]||{}).team||''}", out)

    def test_poller_validates_logo_paths_and_sponsor_url(self):  # F2
        out = transformed()
        self.assertIn("const SAFE_IMG=/^logos\\/[a-z0-9_-]+\\.png$/", out)
        self.assertIn("/^https:\\/\\//", out)
        self.assertIn("logos=safeLogos(d.logos)", out)
        self.assertIn("sponsor=safeSponsor(d.sponsor)", out)
        self.assertNotIn("sponsor=d.sponsor||null", out)
        self.assertNotIn("logos=d.logos||null", out)

    def test_page_and_script_are_split_with_csp(self):  # F3
        page, js = build.split_script(transformed())
        self.assertIn(build.CSP_META, page)
        self.assertIn('<script src="app.js" defer></script>', page)
        self.assertNotIn("<script>", page)
        self.assertNotIn("<", js.split("\n")[0])
        self.assertTrue(js.startswith("(function(){"))
        self.assertTrue(js.rstrip().endswith("})();"))
        self.assertIn("function renderCup(){", js)

    def test_dead_private_code_is_stripped(self):  # F10
        out = transformed()
        for fn in ("renderScore", "refreshSheet", "renderHcp", "renderPots", "renderSetup", "renderBets",
                   "renderChallenges", "betStatus", "betOdds", "sideName", "pressNotes", "__pageBets"):
            self.assertNotIn(fn, out, fn)
        for needle in build.FORBIDDEN:
            self.assertNotIn(needle, out, needle)
        for needle in (".phone", ".ghin", ".club", "bets[", "data-press", "data-tp", "data-accept"):
            self.assertIn(needle, build.FORBIDDEN, needle)
        # the live paths and their handlers survive
        for keep in ("function renderLive(){", "function renderCup(){", "function renderTally(){",
                     "function snakeGroups(){", "function highlightsHtml(rid){", "closest('[data-day]')",
                     "closest('#tabs button')", "addEventListener('toggle'"):
            self.assertIn(keep, out, keep)

    def test_player_tally_cells_do_not_wrap(self):
        self.assertIn("#ptally td,#ptally th{white-space:nowrap}", transformed())

    def test_sync_note_flags_partial_refresh(self):
        out = transformed()
        self.assertIn("(Array.isArray(d.stale)&&d.stale.length?' (partial refresh)':'')", out)


if __name__ == "__main__":
    unittest.main()
