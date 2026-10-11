import { test, expect } from '../fixtures';

// data.json is attacker-controlled for the purposes of this page (every signed-in player can write the DB).
// These specs feed tampered payloads straight to the page and assert that nothing executes or leaves the origin.
const TEAM_PAYLOAD = '"><img src=x onerror="window.__pwned=1">';
const EVIL = 'https://evil.example';
const FONT_HOSTS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

test.describe('security', { tag: '@security' }, () => {
  test('a script payload in players.*.team is inert on the Cup player tally', async ({ page, board, data, serveData }) => {
    await serveData(data.withTamperedTeam('p01', TEAM_PAYLOAD));
    await board.goto();
    await board.open('Cup');

    await expect(board.playerTally).toContainText(data.base().players.p01.name);
    expect(await board.pwned()).toBeUndefined();
    expect(await board.playerTally.innerHTML()).not.toContain('<img');
    expect(await board.playerTally.innerHTML()).not.toContain('onerror');
    await expect(board.playerTallyTeamPills).toHaveCount(data.expected.players);
    await expect(board.playerTallyTeamPills.filter({ hasText: '—' })).toHaveCount(1); // the tampered team renders as unassigned
  });

  test('off-origin logo paths and a javascript: sponsor link are ignored', async ({ page, board, data, serveData }) => {
    const offOrigin: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http://127.0.0.1:4173/')) return route.continue();
      offOrigin.push(url);
      return route.abort();
    });
    await serveData(data.withTamperedUrls(EVIL));
    await board.goto();
    await board.open('Cup');

    expect(offOrigin.filter((u) => !FONT_HOSTS.some((h) => u.startsWith(h)))).toEqual([]);
    expect(await board.pwned()).toBeUndefined();
    await expect(board.sponsorMark).toBeVisible();
    await expect(board.sponsorLink).not.toHaveAttribute('href', /.*/);
    expect(await board.cssVariable('--logo-ps')).toBe('none');
    await expect(board.cupRoundLogos).toHaveCount(1); // only the one well-formed logos/r4.png survives
    await expect(board.cupRoundLogos.first()).toHaveAttribute('src', /logos\/r4\.png$/);
    expect(await page.locator('#cupRounds img[src*="evil"], #cupRounds img[src^="javascript"]').count()).toBe(0);
  });

  test('the page runs under its CSP without violations or page errors', async ({ page, board, data, serveData }) => {
    const violations: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => {
      // Every CSP report counts; other console errors count unless they are an off-origin load (the font CDN)
      // failing for network reasons in a sandbox, which says nothing about the page.
      const sameOrigin = (m.location().url || '').startsWith('http://127.0.0.1:4173/');
      if (/Content Security Policy/i.test(m.text()) || (m.type() === 'error' && sameOrigin)) violations.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await serveData(data.base());
    await board.goto();
    await board.open('Live');
    await board.open('Cup');

    await expect(board.csp).toHaveAttribute('content', /default-src 'none'; script-src 'self';/);
    expect(await page.locator('script:not([src])').count()).toBe(0);
    await expect(board.tallyPS).toHaveText(data.expected.ps);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
});
