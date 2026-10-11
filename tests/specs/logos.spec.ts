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

  test('competition sponsors sit on the round that hosts the prize and link out', async ({ board }) => {
    await board.goto();
    await board.open('Cup');
    // R1 carries the longest putt (one chip); R6 the longest drive and closest-to-the-pin (two).
    const r1 = board.page.locator('.cup-round').nth(0);
    const r6 = board.page.locator('.cup-round').nth(5);
    await expect(r1.locator('.cspon')).toHaveCount(1);
    await expect(r1.locator('.cspon')).toHaveAttribute('href', 'https://www.coastalgolfacademy.com/');
    await expect(r1.locator('.cspon')).toHaveAttribute('rel', 'noopener');
    await expect(r1.locator('.cspon img')).toHaveAttribute('src', /logos\/comp-longest-putt\.png$/);
    await expect(r6.locator('.cspon')).toHaveCount(2);
    await expect(board.page.locator('.cup-round').nth(2).locator('.cspon')).toHaveCount(0);
    await board.open('Live');
    await expect(board.page.locator('.lv-round').nth(0).locator('.lv-head .cspon')).toHaveCount(1);
  });
});
