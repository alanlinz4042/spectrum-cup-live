"""scripts/sync.py: allow-list export of the artifact DB dump to docs/data.json."""
import json
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import sync  # noqa: E402

FORBIDDEN = ("phone", "ghin", "club", "email", "mulligan", "snake", "entry", "__seen", "gfm", "pot", "comps", "note")

PLAYER = {"name": "Test Player", "team": "PS", "captain": 1, "index": "11.4",
          "phone": "555-0100", "ghin": "1234567", "club": "Secret CC", "email": "x@example.com"}
SETTINGS = {"courses": {"r1": {"name": "Ozarks National", "par": [4] * 18, "si": list(range(1, 19)),
                               "rating": 71.4, "slope": 131, "tee": "Blue"}},
            "allow": {"altshot": 50, "scrambleHigh": 15, "scrambleLow": 35},
            "mulligan": {"gfm": 50, "pot": 50, "price": 100}, "snake": {"rate": 1}, "entry": "self"}
PAIRINGS = {"r1": [{"PS": ["p01"], "IL": ["p09"]}]}
SPONSOR = {"name": "Sponsor Co", "url": "http://insecure.example", "imageId": "0123456789abcdef0123456789abcdef"}
SCORE = {"holes": {"1": 4, "2": 5}, "tp": {"2": 1}, "__seen": True}
MULL = {"p01": {"used": True, "round": "r1", "hole": 7, "gfm": True, "pot": False}}
COMPS = {"longestPutt": {"pid": "p01", "note": "38 ft"}}


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)


def make_dump(root, wrapped=False):
    def doc(doc_id, data):
        return {"id": doc_id, "data": data, "version": "3"} if wrapped else data
    write(os.path.join(root, "players", "p01.json"), doc("p01", PLAYER))
    write(os.path.join(root, "players", "p09.json"), doc("p09", dict(PLAYER, name="Other Player", team="IL", captain=0)))
    write(os.path.join(root, "config", "settings.json"), doc("settings", SETTINGS))
    write(os.path.join(root, "config", "pairings.json"), doc("pairings", PAIRINGS))
    write(os.path.join(root, "config", "sponsor.json"), doc("sponsor", SPONSOR))
    write(os.path.join(root, "scores", "r1_p01.json"), doc("r1_p01", SCORE))
    write(os.path.join(root, "side", "mulligans.json"), doc("mulligans", MULL))
    write(os.path.join(root, "side", "comps.json"), doc("comps", COMPS))


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.dump = os.path.join(self.tmp, "dump")
        self.out = os.path.join(self.tmp, "out", "data.json")
        make_dump(self.dump)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_sync(self):
        return sync.run(self.dump, self.out)

    def read_out(self):
        with open(self.out, encoding="utf-8") as f:
            return f.read()

    def test_output_has_no_forbidden_keys(self):
        self.assertEqual(self.run_sync(), "CHANGED")
        text = self.read_out()
        for k in FORBIDDEN:
            self.assertNotIn('"%s"' % k, text, k)
        self.assertNotIn("555-0100", text)
        self.assertNotIn("Secret CC", text)

    def test_shapes_and_coercions(self):
        self.run_sync()
        d = json.loads(self.read_out())
        self.assertEqual(d["logos"], sync.LOGOS)
        self.assertEqual(d["sponsor"]["imageId"], "logos/sponsor.png")
        self.assertEqual(d["sponsor"]["name"], "Sponsor Co")
        self.assertNotIn("url", d["sponsor"])  # http:// is dropped; only https:// survives
        self.assertIs(d["players"]["p01"]["captain"], True)
        self.assertEqual(d["players"]["p01"]["index"], 11.4)
        self.assertEqual(set(d["players"]["p01"]), {"name", "team", "captain", "index"})
        self.assertEqual(set(d["settings"]), {"courses", "allow"})
        self.assertEqual(d["pairings"], PAIRINGS)
        self.assertEqual(d["scores"]["r1_p01"], {"holes": {"1": 4, "2": 5}, "tp": {"2": 1}})
        self.assertEqual(d["side"]["mulligans"]["p01"], {"used": True, "round": "r1", "hole": 7})
        self.assertNotIn("comps", d["side"])  # free-text comps are never published
        self.assertTrue(d["updatedAt"].endswith("Z"))

    def test_team_is_whitelisted(self):
        write(os.path.join(self.dump, "players", "p02.json"), dict(PLAYER, team='"><img src=x onerror=alert(1)>'))
        write(os.path.join(self.dump, "players", "p03.json"), dict(PLAYER, team="ps"))
        write(os.path.join(self.dump, "players", "p04.json"), dict(PLAYER, team=None))
        self.run_sync()
        d = json.loads(self.read_out())
        self.assertEqual(d["players"]["p01"]["team"], "PS")
        self.assertEqual(d["players"]["p09"]["team"], "IL")
        for pid in ("p02", "p03", "p04"):
            self.assertEqual(d["players"][pid]["team"], "", pid)
        self.assertNotIn("onerror", self.read_out())

    def test_holes_and_tp_are_coerced_to_hole_number_ints(self):
        junk = {"holes": {"1": 4, "02": 5, "x": 6, "19": 4, "0": 3, "3": "<b>7</b>", "4": "5", "5": 4.0,
                          "6": 99, "7": True, "8": None, "<img>": 4},
                "tp": {"2": 1, "3": "yes", "4": 0, "20": 1, "<s>": 1, "5": True}}
        write(os.path.join(self.dump, "scores", "r1_p01.json"), junk)
        self.run_sync()
        d = json.loads(self.read_out())
        self.assertEqual(d["scores"]["r1_p01"], {"holes": {"1": 4, "2": 5, "4": 5, "5": 4}, "tp": {"2": 1, "3": 1, "5": 1}})
        self.assertNotIn("<", self.read_out())

    def test_mulligans_are_coerced(self):
        write(os.path.join(self.dump, "side", "mulligans.json"),
              {"p01": {"used": 1, "round": "r9", "hole": "7"}, "p09": {"used": "", "round": "r3", "hole": 25},
               "<i>": {"used": True, "round": "<b>", "hole": 3}})
        self.run_sync()
        d = json.loads(self.read_out())
        self.assertEqual(d["side"]["mulligans"]["p01"], {"used": True, "hole": 7})
        self.assertEqual(d["side"]["mulligans"]["p09"], {"used": False, "round": "r3"})
        self.assertNotIn("<i>", d["side"]["mulligans"])
        self.assertNotIn("<", self.read_out())

    def test_second_run_is_unchanged_and_does_not_rewrite(self):
        self.run_sync()
        before = os.stat(self.out)
        first = self.read_out()
        self.assertEqual(self.run_sync(), "UNCHANGED")
        self.assertEqual(os.stat(self.out).st_mtime_ns, before.st_mtime_ns)
        self.assertEqual(self.read_out(), first)

    def test_changed_hole_bumps_updated_at(self):
        real_now = sync.now_iso
        try:
            sync.now_iso = lambda: "2026-10-22T14:05:00Z"
            self.run_sync()
            first = json.loads(self.read_out())
            write(os.path.join(self.dump, "scores", "r1_p01.json"), dict(SCORE, holes={"1": 4, "2": 5, "3": 3}))
            sync.now_iso = lambda: "2026-10-22T14:10:00Z"
            self.assertEqual(self.run_sync(), "CHANGED")
        finally:
            sync.now_iso = real_now
        second = json.loads(self.read_out())
        self.assertEqual(second["scores"]["r1_p01"]["holes"]["3"], 3)
        self.assertNotEqual(first["updatedAt"], second["updatedAt"])

    def test_wrapped_dump_shape_accepted(self):
        shutil.rmtree(self.dump)
        make_dump(self.dump, wrapped=True)
        self.assertEqual(self.run_sync(), "CHANGED")
        d = json.loads(self.read_out())
        self.assertEqual(d["players"]["p01"]["name"], "Test Player")
        self.assertEqual(d["scores"]["r1_p01"]["holes"]["2"], 5)

    def test_missing_side_and_sponsor_tolerated(self):
        shutil.rmtree(os.path.join(self.dump, "side"))
        os.remove(os.path.join(self.dump, "config", "sponsor.json"))
        self.assertEqual(self.run_sync(), "CHANGED")
        d = json.loads(self.read_out())
        self.assertEqual(d["side"], {})
        self.assertIsNone(d["sponsor"])

    def test_missing_settings_exits_2(self):
        os.remove(os.path.join(self.dump, "config", "settings.json"))
        with self.assertRaises(SystemExit) as cm:
            self.run_sync()
        self.assertEqual(cm.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
