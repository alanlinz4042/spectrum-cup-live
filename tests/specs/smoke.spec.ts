import { test, expect, EXPECTED } from '../fixtures';

test.describe('spectator page', () => {
  test.beforeEach(async ({ board }) => {
    await board.goto();
  });

  test('tally shows the fixture totals', async ({ page }) => {
    await expect(page.locator('#tPS')).toHaveText(EXPECTED.ps);
    await expect(page.locator('#tIL')).toHaveText(EXPECTED.il);
    await expect(page.locator('#tMid')).toContainText('PTS');
    await expect(page.locator('#tMid')).toContainText('LEFT');
    await expect(page.locator('#syncNote')).toContainText('scores as of');
  });

  test('only the public tabs and panels exist', async ({ page, board }) => {
    expect(await board.tabNames()).toEqual(['Live', 'Cup']);
    await expect(page.locator('#meSel, #pickme, #p-score, #p-pots, #p-setup, #p-hcp')).toHaveCount(0);
  });

  test('Live shows Thursday rounds with course marks', async ({ page, board }) => {
    await board.open('Live');
    await page.locator('[data-day="thu"]').click();
    await expect(page.locator('.lv-round')).toHaveCount(2);
    await expect(page.locator('.lv-head .cmark').first()).toBeVisible();
    await expect(page.locator('.lv-head .t').first()).toContainText('R1 · Ozarks National');
    await expect(page.locator('.lv-m')).toHaveCount(6);
  });

  test('Cup shows the board, player tally and a dollar-free recap', async ({ page, board }) => {
    await board.open('Cup');
    await expect(page.locator('#board .tot')).toHaveText([EXPECTED.ps, EXPECTED.il]);
    await expect(page.locator('#ptally tr')).toHaveCount(EXPECTED.players + 1);
    const recap = page.locator('.recap');
    await expect(recap.first()).toBeVisible();
    await expect(recap.first()).toContainText('Snake');
    for (const text of await recap.allTextContents()) expect(text).not.toContain('$');
  });
});
