import { test, expect } from '../fixtures';

test('logos load from docs/logos, never from the artifact blob store', async ({ page, board }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));

  await board.goto();
  await board.open('Cup');

  expect(requested.filter((u) => u.includes('/_blob/'))).toEqual([]);
  await expect(page.locator('#crest')).toBeVisible();
  expect(await page.locator('#crest').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--logo-ps'))).toContain('logos/ps.png');
  await expect(page.locator('.tmark.ps')).toBeVisible();
  await expect(page.locator('#sponTop img')).toBeVisible();
  await expect(page.locator('.cup-round .clogo').first()).toHaveAttribute('src', /logos\/r1\.png$/);
});
