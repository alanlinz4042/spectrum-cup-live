#!/usr/bin/env python3
"""Export an artifact-DB dump to docs/data.json using an explicit allow-list.

Usage: python3 scripts/sync.py --dump .dump --out docs/data.json
Prints CHANGED or UNCHANGED. Exit 2 if config/settings.json is missing. Never prints document contents.

Input layout (what `ArtifactData list ... out_dir=.dump` writes): <dump>/<collection>/<doc_id>.json,
each file either the bare document or a {"id","data","version"} wrapper. Stdlib only.
"""
import argparse
import datetime
import glob
import json
import os
import sys

LOGOS = {"event": "logos/event.png", "PS": "logos/ps.png", "IL": "logos/il.png",
         "r1": "logos/r1.png", "r2": "logos/r2.png", "r3": "logos/r3.png",
         "r4": "logos/r4.png", "r5": "logos/r5.png", "r6": "logos/r6.png"}
COURSE_KEYS = ("name", "par", "si", "rating", "slope", "tee")
ALLOW_KEYS = ("altshot", "scrambleHigh", "scrambleLow")


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


def export_player(p):
    out = pick(p, ("name", "team"))
    out["name"] = str(out.get("name", ""))
    out["team"] = str(out.get("team", "") or "")
    out["captain"] = bool(p.get("captain"))
    out["index"] = to_float(p.get("index"))
    return out


def export_settings(s):
    courses = s.get("courses") if isinstance(s.get("courses"), dict) else {}
    allow = s.get("allow") if isinstance(s.get("allow"), dict) else {}
    return {"courses": {rid: pick(c, COURSE_KEYS) for rid, c in courses.items() if isinstance(c, dict)},
            "allow": pick(allow, ALLOW_KEYS)}


def export_pairings(p):
    out = {}
    for rid, matches in (p or {}).items():
        if not isinstance(matches, list):
            continue
        out[rid] = [{"PS": [str(x) for x in (m.get("PS") or [])], "IL": [str(x) for x in (m.get("IL") or [])]}
                    for m in matches if isinstance(m, dict)]
    return out


def export_score(d):
    return {"holes": d.get("holes") if isinstance(d.get("holes"), dict) else {},
            "tp": d.get("tp") if isinstance(d.get("tp"), dict) else {}}


def export_side(side):
    out = {}
    mull = side.get("mulligans")
    if isinstance(mull, dict):
        out["mulligans"] = {pid: pick(m, ("used", "round", "hole")) for pid, m in mull.items() if isinstance(m, dict)}
    comps = side.get("comps")
    if isinstance(comps, dict):
        out["comps"] = {k: pick(c, ("pid", "note")) for k, c in comps.items() if isinstance(c, dict)}
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


def build(dump):
    settings = load_config(dump, "settings")
    if settings is None:
        print("sync.py: missing config/settings.json", file=sys.stderr)
        sys.exit(2)
    players = load_collection(dump, "players")
    scores = load_collection(dump, "scores")
    side = load_collection(dump, "side")
    return {
        "players": {pid: export_player(p) for pid, p in players.items()},
        "settings": export_settings(settings),
        "pairings": export_pairings(load_config(dump, "pairings") or {}),
        "scores": {k: export_score(d) for k, d in scores.items()},
        "side": export_side(side),
        "sponsor": export_sponsor(load_config(dump, "sponsor")),
        "logos": dict(LOGOS),
    }


def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(dump, out_path):
    data = build(dump)
    previous = None
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as f:
                previous = json.load(f)
        except (OSError, ValueError):
            previous = None
    if isinstance(previous, dict):
        prev = dict(previous)
        prev.pop("updatedAt", None)
        if canon(prev) == canon(data):
            return "UNCHANGED"
    data["updatedAt"] = now_iso()
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(canon(data))
        f.write("\n")
    return "CHANGED"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dump", required=True, help="directory written by ArtifactData list out_dir")
    ap.add_argument("--out", default="docs/data.json")
    args = ap.parse_args(argv)
    print(run(args.dump, args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
