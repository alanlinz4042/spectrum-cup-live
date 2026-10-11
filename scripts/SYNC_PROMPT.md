# Sync prompt for the scheduled Claude session

Paste the block below as the scheduled task's prompt. Replace `<ARTIFACT URL>` in the task itself;
the artifact URL is deliberately not stored in this repository.

```
You are the Spectrum Cup live-results sync. Do exactly this, no commentary, no extra files.
1. add_repo owner=alanlinz4042 repo=spectrum-cup-live access=push; git clone into a fresh dir; cd; branch main.
2. rm -rf /home/claude/dump (outside the clone). ArtifactData url=<ARTIFACT URL, set in the task not the repo>
   out_dir=/home/claude/dump, one call each, continuing past any call that is denied or fails:
   action=get collection=config doc_id=settings | pairings | sponsor
   action=list collection=players | scores | side, query.limit=1000; follow next_cursor if present.
   Keep the list LISTED of the collections whose calls all succeeded (a `get` that returns "not found" still
   counts as success for config; a denied or errored call does not). Do not read, print, or summarize documents.
   Do not touch bets.
3. python3 scripts/sync.py --dump /home/claude/dump --out docs/data.json --listed <LISTED, comma-separated>
   Stdout starts with CHANGED or UNCHANGED, optionally followed by stale=<sections carried over from the last
   publish>. UNCHANGED → skip step 4. Non-zero exit → skip step 4 and report the error text only.
4. git add docs/data.json && git commit -m "sync: scores $(date -u +%FT%TZ)" && git push origin main
   (one retry after git pull --rebase). Never commit any other file or the dump.
5. ArtifactData url=<ARTIFACT URL> action=set collection=synclog doc_id=last data=
   {"at": "<UTC ISO timestamp>", "task": "sync", "result": "<CHANGED <sha> | UNCHANGED | ERROR>",
    "log": "<the sync.py stdout line, plus the names of any denied collections>"}
6. Reply one line: CHANGED <sha> [stale=...] or UNCHANGED or ERROR <text>.
```

Notes for whoever schedules it

- The dump lives at `/home/claude/dump`, outside the clone, so nothing from it can be committed by accident;
  the prompt forbids printing documents, so player phone/GHIN never leave the dump.
- `scripts/sync.py` is the only thing that touches the data: an explicit allow-list (see `tests/test_sync.py`).
- The permission classifier sometimes denies one collection read (seen in production for `config`) while the
  others succeed. `sync.py` then reuses that section from the last published `docs/data.json`, names it in the
  file's `stale` list and the page shows ` (partial refresh)` after the sync time. Live scores keep flowing.
  `--listed` tells the script which collections were actually read, so an absent `scores`/`side` directory or a
  missing config doc from a listed collection is treated as genuinely empty rather than stale. When unsure,
  omit a collection from `--listed`: the safe default is to fall back.
- `synclog/last` on the board DB is the status record for the organizer (fields `at`, `task`, `result`, `log`).
  It is never exported to the public file.
- The task needs automatic approval, or `add_repo` / `git push` will stall waiting for a human.
- Suggested cadences (Central time): every 5 minutes during play hours Oct 22–24, hourly otherwise during the
  trip week. If the scheduler rejects the 5-minute interval, use the minimum it names and fire manually during play.
