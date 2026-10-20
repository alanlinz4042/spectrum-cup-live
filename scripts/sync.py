#!/usr/bin/env python3
"""Export an artifact-DB dump to docs/data.json using an explicit allow-list.

Usage: python3 scripts/sync.py --dump /home/claude/dump --out docs/data.json [--listed scores,side] [--carry players,settings,sponsor]
Prints CHANGED or UNCHANGED (first token), followed by " stale=<sections>" when any section was carried over
from the previous output without being asked for. Exit 2 when neither the dump nor the previous output has settings or players.
Never prints document contents.

Input layout (what `ArtifactData list/get ... out_dir=<dump>` writes): <dump>/<collection>/<doc_id>.json,
each file either the bare document or a {"id","data","version"} wrapper. Stdlib only.

Fallback: a collection whose read was denied leaves no directory (or config doc) in the dump. Such a section
is reused from the existing --out file and named in "stale". `--listed` names the collections the caller
confirmed it read successfully: for those, an absent scores/side directory or config doc is genuinely empty.
`players` is never trusted empty. Only an existing scores/side directory (even empty) counts as read.
`--carry` names sections the caller deliberately did not read (the slimmed scheduled runs skip players,
settings and sponsor): they are reused from the previous output silently, not marked stale. A carried
section that is present in the dump is still exported fresh.
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys

LOGOS = {"event": "logos/event.png", "PS": "logos/ps.png", "IL": "logos/il.png",
         "r1": "logos/r1.png", "r2": "logos/r2.png", "r3": "logos/r3.png",
         "r4": "logos/r4.png", "r5": "logos/r5.png", "r6": "logos/r6.png"}
COURSE_KEYS = ("name", "par", "si", "rating", "slope", "tee")
ALLOW_KEYS = ("altshot", "scrambleHigh", "scrambleLow", "hcpPct", "hcpPctR5")
TEAMS = ("PS", "IL")
ROUND_IDS = ("r1", "r2", "r3", "r4", "r5", "r6")


def load_doc(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    if isinstance(d, dict) and "data" in d and "id" in d:
        d = d["data"]
    return d if isinstance(d, dict) else {}


def load_collection(dump, name):
    out = {}
    for p in sorted(glob.glob(os.path.join(dump, name, "*.json"))):
        out[os.path.splitext(os.path.basename(p))[0]] = load_doc(p)
    return out


def load_config(dump, name):
    p = os.path.join(dump, "config", name + ".json")
    return load_doc(p) if os.path.exists(p) else None


def pick(src, keys):
    return {k: src[k] for k in keys if isinstance(src, dict) and k in src}


def to_float(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_int(v, lo, hi):
    """Whole number in [lo, hi] (int, integral float or digit string; bool/None/other rejected), else None."""
    if isinstance(v, str) and v.isdigit():
        v = int(v)
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if v != v or v != int(v) or not lo <= v <= hi:
        return None
    return int(v)


def hole_key(k):
    """Hole number as the string "1".."18" (accepts "02"), else None."""
    k = str(k)
    if not k.isdigit() or not 1 <= int(k) <= 18:
        return None
    return str(int(k))


def export_player(p):
    out = pick(p, ("name", "team"))
    out["name"] = str(out.get("name", ""))
    out["team"] = out.get("team") if out.get("team") in TEAMS else ""
    out["captain"] = bool(p.get("captain"))
    out["index"] = to_float(p.get("index"))
    return out


def export_settings(s):
    courses = s.get("courses") if isinstance(s.get("courses"), dict) else {}
    allow = s.get("allow") if isinstance(s.get("allow"), dict) else {}
    return {"courses": {rid: pick(c, COURSE_KEYS) for rid, c in courses.items() if isinstance(c, dict)},
            "allow": pick(allow, ALLOW_KEYS)}


TEE_RE = re.compile(r"^\d{1,2}:\d{2}\s?(AM|PM|am|pm)?$")


def export_match(m):
    out = {"PS": [str(x) for x in (m.get("PS") or [])], "IL": [str(x) for x in (m.get("IL") or [])]}
    tee = m.get("tee")
    if isinstance(tee, str):
        tee = tee.strip()
        if len(tee) <= 10 and TEE_RE.match(tee):
            out["tee"] = tee
    return out


def export_pairings(p):
    out = {}
    for rid, matches in (p or {}).items():
        if not isinstance(matches, list):
            continue
        out[rid] = [export_match(m) for m in matches if isinstance(m, dict)]
    return out


def export_score(d):
    holes, tp = {}, {}
    for k, v in (d.get("holes") if isinstance(d.get("holes"), dict) else {}).items():
        h, n = hole_key(k), to_int(v, 1, 20)
        if h and n is not None:
            holes[h] = n
    for k, v in (d.get("tp") if isinstance(d.get("tp"), dict) else {}).items():
        h = hole_key(k)
        if h and v:
            tp[h] = 1
    return {"holes": holes, "tp": tp}


def export_mulligan(m):
    out = {"used": bool(m.get("used"))}
    if m.get("round") in ROUND_IDS:
        out["round"] = m["round"]
    hole = to_int(m.get("hole"), 1, 18)
    if hole is not None:
        out["hole"] = hole
    return out


def export_side(side):
    # Only mulligans are published (the page shows Used/Available); comps carry free text and are never rendered.
    out = {}
    mull = side.get("mulligans")
    if isinstance(mull, dict):
        out["mulligans"] = {pid: export_mulligan(m) for pid, m in mull.items()
                            if isinstance(m, dict) and re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", pid)}
    return out


COMP_KEYS = {"longestPutt": "logos/comp-longest-putt.png", "longestDrive": "logos/comp-longest-drive.png",
             "ctp": "logos/comp-ctp.png", "mvp": "logos/comp-mvp.png"}


def export_comps(c):
    """config/comps → compSponsors: the on-course competition sponsors — name, https link, fixed logo path per key.
    (side/comps, the free-text winners doc, is a different document and is never exported.)"""
    if not isinstance(c, dict):
        return {}
    out = {}
    for k, path in COMP_KEYS.items():
        s = export_sponsor(c.get(k))
        if s is None:
            continue
        if s.get("imageId"):
            s["imageId"] = path
        out[k] = s
    return out


def export_sponsor(s):
    if not isinstance(s, dict):
        return None
    out = {"name": str(s.get("name") or "")}
    url = s.get("url")
    if isinstance(url, str) and url.startswith("https://"):
        out["url"] = url
    if s.get("imageId"):
        out["imageId"] = "logos/sponsor.png"
    return out


def players_present(dump):
    return bool(glob.glob(os.path.join(dump, "players", "*.json")))


def build(dump, previous=None, listed=(), carry=()):
    """Export the dump; sections missing from it come from `previous` (the last output) and are named in stale
    unless the caller said it was carrying them on purpose."""
    previous = previous if isinstance(previous, dict) else {}
    stale = []

    def section(name, collection, present, fresh, default, required=False, trust_listed=True):
        if present:
            return fresh()
        if name in carry and previous.get(name) is not None:
            return previous[name]
        if (not (trust_listed and collection in listed)) and previous.get(name) is not None:
            stale.append(name)
            return previous[name]
        if required:
            print("sync.py: missing %s and no previous output to fall back to" % name, file=sys.stderr)
            sys.exit(2)
        return default

    return {
        "players": section("players", "players", players_present(dump),
                           lambda: {pid: export_player(p) for pid, p in load_collection(dump, "players").items()},
                           None, required=True, trust_listed=False),
        "settings": section("settings", "config", load_config(dump, "settings") is not None,
                            lambda: export_settings(load_config(dump, "settings")), None, required=True),
        "pairings": section("pairings", "config", load_config(dump, "pairings") is not None,
                            lambda: export_pairings(load_config(dump, "pairings")), {}),
        "scores": section("scores", "scores", os.path.isdir(os.path.join(dump, "scores")),
                          lambda: {k: export_score(d) for k, d in load_collection(dump, "scores").items()}, {}),
        "side": section("side", "side", os.path.isdir(os.path.join(dump, "side")),
                        lambda: export_side(load_collection(dump, "side")), {}),
        "sponsor": section("sponsor", "config", load_config(dump, "sponsor") is not None,
                           lambda: export_sponsor(load_config(dump, "sponsor")), None),
        "compSponsors": section("compSponsors", "config", load_config(dump, "comps") is not None,
                                lambda: export_comps(load_config(dump, "comps")), {}),
        "logos": dict(LOGOS),
        "stale": stale,
    }


def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_previous(out_path):
    if not os.path.exists(out_path):
        return None
    try:
        with open(out_path, encoding="utf-8") as f:
            previous = json.load(f)
    except (OSError, ValueError):
        return None
    return previous if isinstance(previous, dict) else None


def run(dump, out_path, listed=(), carry=()):
    previous = load_previous(out_path)
    data = build(dump, previous, tuple(listed), tuple(carry))
    suffix = " stale=" + ",".join(data["stale"]) if data["stale"] else ""
    if previous is not None:
        prev = dict(previous)
        prev.pop("updatedAt", None)
        if canon(prev) == canon(data):
            return "UNCHANGED" + suffix
    data["updatedAt"] = now_iso()
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(canon(data))
        f.write("\n")
    return "CHANGED" + suffix


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dump", required=True, help="directory written by ArtifactData list out_dir")
    ap.add_argument("--out", default="docs/data.json")
    ap.add_argument("--listed", default="",
                    help="comma-separated collections read successfully (absent scores/side dir or config doc = empty)")
    ap.add_argument("--carry", default="",
                    help="comma-separated sections deliberately not read; reused from the previous output, not stale")
    args = ap.parse_args(argv)
    listed = tuple(c.strip() for c in args.listed.split(",") if c.strip())
    carry = tuple(c.strip() for c in args.carry.split(",") if c.strip())
    print(run(args.dump, args.out, listed, carry))
    return 0


if __name__ == "__main__":
    sys.exit(main())
