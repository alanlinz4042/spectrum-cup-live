// Builds data.json payloads for specs from scripts/sample-data.json.
import fs from 'fs';
import path from 'path';

export const FIXTURE_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'sample-data.json');

export interface PrivatePlayerFields {
  phone: string;
  ghin: string;
  club: string;
  email: string;
}

export class FixtureData {
  private readonly raw: any;

  /** Expected tally for the fixture: r1 M1 + M2 are clean PS sweeps (3 pts each). */
  readonly expected: { ps: string; il: string; players: number };

  constructor(fixturePath = FIXTURE_PATH) {
    this.raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    this.expected = { ps: '6', il: '0', players: Object.keys(this.raw.players).length };
  }

  /** A fresh deep copy of the fixture. */
  base(): any {
    return JSON.parse(JSON.stringify(this.raw));
  }

  /** Fixture plus a completed front nine in r1 M3 (PS sweep) → one more PS point, updatedAt 10:00 CT. */
  plusOnePoint(): any {
    const d = this.base();
    const par: number[] = d.settings.courses.r1.par;
    const holes = (delta: number) => Object.fromEntries(par.slice(0, 9).map((p, i) => [String(i + 1), p + delta]));
    for (const pid of ['p05', 'p06']) d.scores[`r1_${pid}`] = { holes: holes(-1), tp: {} };
    for (const pid of ['p13', 'p14']) d.scores[`r1_${pid}`] = { holes: holes(2), tp: {} };
    d.updatedAt = '2026-10-22T15:00:00Z';
    return d;
  }

  /** Fixture where one player doc carries fields the allow-list is supposed to strip (as if sync.py regressed). */
  withPrivatePlayer(pid: string, fields: PrivatePlayerFields): any {
    const d = this.base();
    d.players[pid] = { ...d.players[pid], ...fields };
    return d;
  }

  /** Fixture with a script payload in a player's team (the one field that was interpolated raw into innerHTML). */
  withTamperedTeam(pid: string, team: string): any {
    const d = this.base();
    d.players[pid] = { ...d.players[pid], team };
    return d;
  }

  /** Fixture whose URL-bearing fields point off-origin: external logos, a javascript: sponsor link. */
  withTamperedUrls(host: string): any {
    const d = this.base();
    d.logos = {
      event: `${host}/event.png`,
      PS: `x) , url(${host}/css-ps.png`,
      IL: `${host}/il.png`,
      r1: `${host}/r1.png" onerror="window.__pwned=1`,
      r2: 'logos/../secret.png',
      r3: 'javascript:window.__pwned=1',
      r4: 'logos/r4.png',
    };
    d.sponsor = { name: 'Evil', url: 'javascript:window.__pwned=1', imageId: 'logos/sponsor.png' };
    return d;
  }

  /** Control case: the same private values pushed into a rendered field (the name), proving the detector sees them. */
  withPrivateValueInName(pid: string, value: string): any {
    const d = this.base();
    d.players[pid] = { ...d.players[pid], name: value };
    return d;
  }
}
