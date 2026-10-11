import { test, expect } from '../fixtures';

test.describe('logos', { tag: '@smoke' }, () => {
  test('load from docs/logos, never from the artifact blob store', async ({ page, board }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));

    await board.goto();
    await board.open('Cup');

    expect(requested.filter((u) => u.includes('/_blob/'))).toEqual([]);
    await expect(board.crest).toBeVisible();
    expect(await board.crestNaturalWidth()).toBeGreaterThan(0);
    expect(await board.cssVariable('--logo-ps')).toContain('logos/ps.png');
    await expect(board.teamMarkPS).toBeVisible();
    await expect(board.sponsorMark).toBeVisible();
    await expect(board.cupRoundLogos.first()).toHaveAttribute('src', /logos\/r1\.png$/);
  });
});
