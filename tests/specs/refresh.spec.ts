import { test, expect, fixture, EXPECTED } from '../fixtures';

// Fixture plus a completed front nine in r1 M3 (PS sweep) → one more PS point.
function plusOnePoint() {
  const d = JSON.parse(JSON.stringify(fixture));
  const par: number[] = d.settings.courses.r1.par;
  const holes = (delta: number) => Object.fromEntries(par.slice(0, 9).map((p, i) => [String(i + 1), p + delta]));
  for (const pid of ['p05', 'p06']) d.scores[`r1_${pid}`] = { holes: holes(-1), tp: {} };
  for (const pid of ['p13', 'p14']) d.scores[`r1_${pid}`] = { holes: holes(2), tp: {} };
  d.updatedAt = '2026-10-22T15:00:00Z';
  return d;
}

test('polls data.json with a cache-buster and re-renders on change', async ({ page, board }) => {
  let body = JSON.stringify(fixture);
  const urls: string[] = [];
  await page.route('**/data.json*', (route) => {
    urls.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await board.goto('?poll=1000');
  await expect(page.locator('#tPS')).toHaveText(EXPECTED.ps);
  expect(urls[0]).toContain('data.json?t=');

  body = JSON.stringify(plusOnePoint());
  await expect(page.locator('#tPS')).toHaveText(String(Number(EXPECTED.ps) + 1), { timeout: 5_000 });
  await expect(page.locator('#syncNote')).toContainText('10:00 AM CT');
  expect(urls.length).toBeGreaterThan(1);
});
