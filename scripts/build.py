#!/usr/bin/env python3
"""Derive the public spectator page docs/index.html from the verbatim artifact copy src/spectrum-cup.html.

Every rule anchors on a string that must occur exactly once in the source; if the artifact changes
and an anchor moves, the build aborts loudly instead of silently shipping a half-converted page.
Stdlib only. Run from anywhere: python3 scripts/build.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "spectrum-cup.html")
OUT = os.path.join(ROOT, "docs", "index.html")
OUT_JS = os.path.join(ROOT, "docs", "app.js")


class AnchorError(RuntimeError):
    """An anchor was not found exactly once."""


def once(text, anchor):
    n = text.count(anchor)
    if n != 1:
        raise AnchorError("anchor found %d times (expected 1): %r" % (n, anchor[:80]))
    return n


def sub(text, anchor, replacement):
    once(text, anchor)
    return text.replace(anchor, replacement)


def rm(text, anchor):
    return sub(text, anchor, "")


def rm_line(text, anchor):
    """Remove the whole line containing the anchor (including its newline)."""
    once(text, anchor)
    i = text.index(anchor)
    start = text.rfind("\n", 0, i) + 1
    end = text.index("\n", i) + 1
    return text[:start] + text[end:]


def rm_block(text, start, end):
    """Remove from `start` through the first `end` after it (inclusive)."""
    once(text, start)
    i = text.index(start)
    j = text.index(end, i)
    if j < 0:
        raise AnchorError("block end not found after start: %r" % start[:80])
    return text[:i] + text[j + len(end):]


def rm_until(text, start, end):
    """Remove from `start` up to (not including) the first `end` after it."""
    once(text, start)
    i = text.index(start)
    j = text.find(end, i)
    if j < 0:
        raise AnchorError("block end not found after start: %r" % start[:80])
    return text[:i] + text[j:]


POLLER = r"""setStatus('Loading scores…');
// data.json is untrusted: only same-origin logo paths and https sponsor links get anywhere near src/href/url().
const SAFE_IMG=/^logos\/[a-z0-9_-]+\.png$/;
const safePath=v=>typeof v==='string'&&SAFE_IMG.test(v)?v:'';
const safeUrl=v=>typeof v==='string'&&/^https:\/\//.test(v)?v:'';
const safeLogos=o=>{const out={};if(o&&typeof o==='object')Object.keys(o).forEach(k=>{const v=safePath(o[k]);if(v)out[k]=v});return out};
const safeSponsor=o=>o&&typeof o==='object'?{name:String(o.name||''),url:safeUrl(o.url),imageId:safePath(o.imageId)}:null;
const safeComps=o=>{const out={};if(o&&typeof o==='object')Object.keys(o).forEach(k=>{const c=safeSponsor(o[k]);if(c&&c.imageId)out[k]=c});return out};
const POLL_MS=Math.max(1000,+(new URLSearchParams(location.search).get('poll'))||60000);
let lastText='';
async function pull(){
  try{
    const r=await fetch('data.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const text=await r.text();if(text===lastText)return;lastText=text;
    const d=JSON.parse(text);
    players=d.players||{};settings=d.settings||null;pairings=d.pairings||{};scores=d.scores||{};side=d.side||{};
    sponsor=safeSponsor(d.sponsor);logos=safeLogos(d.logos);csponsors=safeComps(d.compSponsors);
    applyLogos();tickStrip();render();setStatus('');
    const n=$('#syncNote');if(n&&d.updatedAt){try{n.textContent=' · scores as of '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(d.updatedAt))+' CT'+(Array.isArray(d.stale)&&d.stale.length?' (partial refresh)':'')}catch(e){}}
  }catch(e){if(!lastText)setStatus('Scores are not available right now. Refresh in a minute.')}
}
pull();setInterval(pull,POLL_MS);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pull()});"""

CSP_META = ('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; '
            'style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; '
            'img-src \'self\' data:; connect-src \'self\'; base-uri \'none\'; form-action \'none\'; object-src \'none\'">')

HEAD = ('<!doctype html>\n<html lang="en" data-theme="light">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="robots" content="noindex">\n' + CSP_META + '\n')

# Strings that must not survive into the public page: artifact plumbing, private tabs, PII fields, wagers.
FORBIDDEN = ("/_blob/", "meSel", "claude.use", "propArea", "renderProps", "data-prop", 'data-tab="score"', "p-score", "p-hcp", "p-pots", "p-setup",
             ".phone", ".ghin", ".club", "bets[", "pressNotes", "queueWrite('bets",
             "data-press", "data-tp", "data-accept", "data-settle", "data-back", "data-pair", "data-comp", "data-mul")

# Private-view functions with no caller on the live/cup paths (F10). Each is removed from its `function` line
# up to the next top-level anchor; the anchors double as a check that the artifact's layout has not drifted.
DEAD_FUNCTIONS = (
    ("function pressNotes(rid){", "\n// ---------- wagers ----------"),
    ("// ---------- wagers ----------\n", "\n// ---------- rendering ----------"),  # betOdds betStatus sideName renderBets renderChallenges
    ("function renderScore(){", "\nfunction renderHcp(){"),
    ("function renderHcp(){", "\nfunction snakeGroups(){"),  # snakeGroups stays: roundHighlights uses it
    ("function renderPots(){", "\nfunction renderSetup(){"),
    ("function renderSetup(){", "\n// ---------- events ----------"),
    # click handler: keep the tab switch and the Live day picker, drop every private-panel branch
    ("  const rc=e.target.closest('[data-r]');", "});\ndocument.addEventListener('input',"),
    ("document.addEventListener('input',e=>{", "document.addEventListener('toggle',"),  # score/roster/course inputs
    ("document.addEventListener('change',e=>{", "// ---------- persistence ----------"),  # setup selects + refreshSheet
)


def transform(t):
    # R1 title
    t = sub(t, "<title>Spectrum Cup Scoreboard</title>", "<title>Spectrum Cup Live</title>")
    # R2 "I am" picker
    t = rm_line(t, '<label class="me">I am <select id="meSel"><option value="">— pick your name —</option></select></label>')
    # R2b dead picker code: its only callers were the change handler and the removed DB boot
    t = rm_line(t, "if(t.id==='meSel'){me=t.value;")
    t = rm_line(t, "function needName(){const on=!me&&Object.keys(players).length>0;$('#pickme').hidden=!on;")
    t = rm_line(t, "  if(on&&!needName.focused){needName.focused=true;")
    t = rm_line(t, "function fillMe(){const sel=$('#meSel');")
    # R3 private tabs
    for tab in ('<button data-tab="score">Scoring</button>', '<button data-tab="hcp">Handicaps</button>',
                '<button data-tab="pots">Pots</button>', '<button data-tab="setup">Setup</button>'):
        t = rm_line(t, tab)
    # R4 pickme banner + challenge sheet
    t = rm_line(t, '<div class="pickme" id="pickme" hidden>')
    # R4b prop bets (private): the Live placeholder, its render call, the composer sheet and the Pots card
    t = rm_line(t, '<div id="propArea"></div>')
    t = rm_line(t, '  renderProps();')
    t = rm_line(t, '<div id="psheet" hidden></div>')
    t = rm_line(t, '<div class="card"><h2>⚡ Props</h2>')
    t = rm_line(t, "setInterval(()=>{if(tab==='live'&&Object.keys(bets).some(id=>bets[id].kind==='prop'))renderProps()},30000);")
    t = rm_line(t, '<div id="csheet" hidden></div>')
    # R5 private panels
    for pid in ("p-score", "p-hcp", "p-pots", "p-setup"):
        t = rm_block(t, '<section class="panel" id="%s">' % pid, "</section>\n")
    # R6 clamp tab seed to public tabs
    t = sub(t, "if(/^#(live|cup|score|hcp|pots|setup)$/.test(location.hash))tab=location.hash.slice(1);",
            "if(/^#(live|cup)$/.test(location.hash))tab=location.hash.slice(1);if(tab!=='live'&&tab!=='cup')tab='cup';")
    # R8 render dispatch
    t = sub(t, "function render(){renderTally();({live:renderLive,cup:renderCup,score:renderScore,hcp:renderHcp,pots:renderPots,setup:renderSetup})[tab]();}",
            "function render(){renderTally();(({live:renderLive,cup:renderCup})[tab]||renderCup)();}")
    # S1 (F1) team is an enum: whitelist at the single accessor so every interpolation of teamOf() is inert
    t = sub(t, "function teamOf(pid){return (players[pid]||{}).team||''}",
            "function teamOf(pid){const t=(players[pid]||{}).team;return t==='PS'||t==='IL'?t:''}")
    # S2 (F10) dead private renderers, wager code and their handlers
    for start, end in DEAD_FUNCTIONS:
        t = rm_until(t, start, end)
    t = rm_line(t, "window.__pageBets=()=>JSON.parse(JSON.stringify(bets));")
    # S3 player tally: keep cells on one line at phone widths (the table scrolls inside .scroll)
    t = sub(t, "</style>", "#ptally td,#ptally th{white-space:nowrap}\n</style>")
    # R9 blob URLs -> relative paths from data.json
    for a in ("`/_blob/${esc(s.imageId)}`", "`/_blob/${esc(L.event)}`", "url(/_blob/${esc(L.PS)})",
              "url(/_blob/${esc(L.IL)})", "`/_blob/${esc(L[rid])}`", 'src="/_blob/${esc(L[t])}"',
              "`/_blob/${esc(c.imageId)}`"):
        t = sub(t, a, a.replace("/_blob/", ""))
    # R10/R11 Snake dollar amounts
    t = rm(t, " ($${g.owes})")
    t = sub(t, "</b> $${H.sg[0].owes}", "</b>")
    t = rm(t, " · $${H.sg.reduce((a,g)=>a+g.owes,0)}")
    # R12 press-notes button
    t = rm(t, '<div class="row" style="margin-top:8px"><button class="btn ghost sm" data-press="${rid}">Copy press notes</button><span class="foot" style="margin:0" id="press_${rid}"></span></div>')
    # R13 artifact DB boot -> data.json poller
    t = rm_block(t, "setStatus('Connecting to the live scoreboard…');\n(async()=>{",
                 "  db.doc('config/logos').onSnapshot(s=>{logos=s.exists?s.data():null;applyLogos();render()});\n})();")
    t = sub(t, "render();tickStrip();if(tab==='live')wakeLock(true);\n",
            "render();tickStrip();if(tab==='live')wakeLock(true);\n" + POLLER)
    # R15 sync note next to the location
    t = sub(t, '<span class="wx" id="wx">Ridgedale, MO</span>',
            '<span class="wx" id="wx">Ridgedale, MO</span><span class="wx" id="syncNote"></span>')
    # R14 document skeleton
    t = sub(t, '<header class="hdr">', '</head>\n<body>\n<header class="hdr">')
    t = HEAD + t.rstrip("\n") + "\n</body>\n</html>\n"
    for needle in FORBIDDEN:
        if needle in t:
            raise AnchorError("forbidden string survived the build: %r" % needle)
    return t


def split_script(page):
    """Move the single inline <script> to app.js so the CSP can be script-src 'self' (F3). Returns (html, js)."""
    start, end = "<script>\n", "</script>\n"
    once(page, start)
    once(page, end)
    i = page.index(start) + len(start)
    j = page.index(end, i)
    js = page[i:j]
    return page[:i - len(start)] + '<script src="app.js" defer></script>\n' + page[j + len(end):], js


def main():
    with open(SRC, encoding="utf-8") as f:
        src = f.read()
    try:
        html, js = split_script(transform(src))
    except AnchorError as e:
        print("build.py: %s" % e, file=sys.stderr)
        return 1
    for path, out in ((OUT, html), (OUT_JS, js)):
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
        print("built %s (%d bytes)" % (os.path.relpath(path, ROOT), len(out.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
