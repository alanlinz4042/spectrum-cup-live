# Spectrum Cup Live: developer guide

How the spectator page is built, tested, fed and deployed. For what the site is, see the [README](README.md).

Served from GitHub Pages at `https://alanlinz4042.github.io/spectrum-cup-live/` and embedded on the Wix site.

The scoreboard itself is a claude.ai Artifact that only logged-in players can open. This repo derives a
spectator-only page from it (Live + Cup tabs, no score entry, no handicaps, no pots, no dollar figures) and feeds
it from `docs/data.json`, which a scheduled Claude session refreshes from the artifact's database.

## Layout

```
src/spectrum-cup.html      verbatim copy of the artifact page (never edited by hand)
scripts/build.py           src → docs/index.html + docs/app.js by anchored, once-only string edits; aborts if an anchor moved
scripts/sync.py            artifact DB dump → docs/data.json through an explicit allow-list (no phone / GHIN / club)
scripts/sample-data.json   fictitious fixture used by the tests (PS 6 – IL 0)
scripts/SYNC_PROMPT.md     prompt for the scheduled sync session (artifact URL is set in the task, not here)
docs/                      what GitHub Pages serves: index.html (with CSP), app.js, data.json, logos/, .nojekyll
tests/                     unittest (build anchors, sync allow-list) + Playwright (chromium, phone-393, phone-320)
```

## Run it locally

```
python3 scripts/build.py                     # regenerate docs/index.html and docs/app.js
python3 -m unittest discover -s tests -p 'test_*.py' -v
npm ci && npm test                           # Playwright; serves docs/ on :4173 with the fixture as data.json
cp scripts/sample-data.json docs/data.json && python3 -m http.server 4173 -d docs   # then open http://localhost:4173/?poll=5000
```

`?poll=<ms>` overrides the 60 s refresh interval. `#live` opens on the Live tab.

## GitHub Pages

Settings → Pages → Build and deployment → **Deploy from a branch** → branch `main`, folder `/docs` → Save.
Commits to `docs/data.json` go live in about 1–3 minutes (Pages sits behind a CDN with `max-age=600`; the page
bypasses the browser cache with `data.json?t=…` and `cache: 'no-store'`). `data.json` is same-origin, so no CORS.

## Embed in Wix

1. Open the Wix Editor on the **Live Results** page.
2. Add Elements (+) → **Embed Code** → **Embed a Site** (the iframe-by-URL element, not "Embed HTML").
3. Enter Website Address: `https://alanlinz4042.github.io/spectrum-cup-live/` → Update.
   Append `#live` to open on the Live tab instead of Cup.
4. Drag the stretch handle (↔) so the element spans the full width.
5. Height: about **1400 px** on desktop, about **1100 px** on mobile. The sticky tally stays pinned inside the
   frame and the content scrolls within it.
6. Switch to the mobile editor and repeat the full-width + ~1100 px height.
7. Publish, then check on a phone that there is no horizontal scroll.

## CI

Every pull request runs:

- `ci` (also on pushes to `main`): rebuilds `docs/` from `src/` and fails if the committed copy is stale, then runs
  the unit tests and the Playwright suite.
- `Security Checks`: `npm audit --audit-level=high`, Gitleaks over the full history, and Semgrep
  (`p/javascript`, `p/python`, `p/security-audit`, `p/owasp-top-ten`).

Dependabot opens weekly update PRs for npm and GitHub Actions, with a 7-day cooldown on new releases.
Pushes that only touch `docs/data.json` (the sync commits) skip CI.

## Keeping the data fresh

`scripts/SYNC_PROMPT.md` is the prompt for a scheduled Claude session. Each run dumps the artifact's
`players`, `scores`, `side` and `config` collections to a git-ignored `.dump/`, runs `scripts/sync.py`, and
commits `docs/data.json` only when something changed. `tests/test_sync.py` is the contract: nothing from the
list `phone ghin club email mulligan snake entry __seen gfm pot` can reach the public file.

## Refreshing the page after the artifact changes

1. Read the artifact's current HTML and save it verbatim over `src/spectrum-cup.html`.
2. `python3 scripts/build.py` — it fails loudly if one of its anchors no longer occurs exactly once; fix the
   rule in `scripts/build.py` (never `docs/index.html` by hand) and rerun.
3. `python3 -m unittest discover -s tests -p 'test_*.py'` and `npm test`.
4. Commit `src/`, `scripts/build.py` (if changed), `docs/index.html` and `docs/app.js` together. CI re-runs the
   build and fails if the committed `docs/index.html` or `docs/app.js` is stale.
