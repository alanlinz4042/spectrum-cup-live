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


POLLER = r"""setStatus('Loading scores…');
const POLL_MS=Math.max(1000,+(new URLSearchParams(location.search).get('poll'))||60000);
let lastText='';
async function pull(){
  try{
    const r=await fetch('data.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const text=await r.text();if(text===lastText)return;lastText=text;
    const d=JSON.parse(text);
    players=d.players||{};settings=d.settings||null;pairings=d.pairings||{};scores=d.scores||{};side=d.side||{};
    sponsor=d.sponsor||null;logos=d.logos||null;
    applyLogos();tickStrip();render();setStatus('');
    const n=$('#syncNote');if(n&&d.updatedAt){try{n.textContent=' · scores as of '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(d.updatedAt))+' CT'}catch(e){}}
  }catch(e){if(!lastText)setStatus('Scores are not available right now. Refresh in a minute.')}
}
pull();setInterval(pull,POLL_MS);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pull()});"""

HEAD = ('<!doctype html>\n<html lang="en" data-theme="light">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="robots" content="noindex">\n')

FORBIDDEN = ("/_blob/", "meSel", "claude.use", 'data-tab="score"', "p-score", "p-hcp", "p-pots", "p-setup")


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
    # R9 blob URLs -> relative paths from data.json
    for a in ("`/_blob/${esc(s.imageId)}`", "`/_blob/${esc(L.event)}`", "url(/_blob/${esc(L.PS)})",
              "url(/_blob/${esc(L.IL)})", "`/_blob/${esc(L[rid])}`", 'src="/_blob/${esc(L[t])}"'):
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


def main():
    with open(SRC, encoding="utf-8") as f:
        src = f.read()
    try:
        out = transform(src)
    except AnchorError as e:
        print("build.py: %s" % e, file=sys.stderr)
        return 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(out)
    print("built %s (%d bytes)" % (os.path.relpath(OUT, ROOT), len(out.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
