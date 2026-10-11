# Sync prompt for the scheduled Claude session

Paste the block below as the scheduled task's prompt. Replace `<ARTIFACT URL>` in the task itself;
the artifact URL is deliberately not stored in this repository.

```
You are the Spectrum Cup live-results sync. Do exactly this, no commentary, no extra files.
1. add_repo owner=alanlinz4042 repo=spectrum-cup-live access=push; git clone into a fresh dir; cd; branch main.
2. ArtifactData url=<ARTIFACT URL, set in the task not the repo> out_dir=<clone>/.dump, one call each:
   action=list collection=players | scores | side | config, query.limit=1000; follow next_cursor if present.
   Do not read, print, or summarize documents. Do not touch bets.
3. python3 scripts/sync.py --dump .dump --out docs/data.json. UNCHANGED → stop. Non-zero → report error text only.
4. git add docs/data.json && git commit -m "sync: scores $(date -u +%FT%TZ)" && git push origin main
   (one retry after git pull --rebase). Never commit any other file or .dump.
5. Reply one line: CHANGED <sha> or UNCHANGED.
```

Notes for whoever schedules it

- `.dump/` is git-ignored; the prompt forbids printing documents, so player phone/GHIN never leave the dump.
- `scripts/sync.py` is the only thing that touches the data: an explicit allow-list (see `tests/test_sync.py`).
- The task needs automatic approval, or `add_repo` / `git push` will stall waiting for a human.
- Suggested cadences (Central time): every 5 minutes during play hours Oct 22–24, hourly otherwise during the
  trip week. If the scheduler rejects the 5-minute interval, use the minimum it names and fire manually during play.
