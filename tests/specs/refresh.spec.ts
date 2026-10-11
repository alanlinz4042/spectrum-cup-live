import { test, expect } from '../fixtures';

test.describe('refresh', { tag: '@refresh' }, () => {
  test('polls data.json with a cache-buster and re-renders on change', async ({ board, data, serveData }) => {
    const served = await serveData(data.base());

    await board.goto('?poll=1000');
    await expect(board.tallyPS).toHaveText(data.expected.ps);
    expect(served.urls[0]).toContain('data.json?t=');

    served.set(data.plusOnePoint());
    await expect(board.tallyPS).toHaveText(String(Number(data.expected.ps) + 1), { timeout: 5_000 });
    await expect(board.syncNote).toContainText('10:00 AM CT');
    expect(served.urls.length).toBeGreaterThan(1);
  });

  test('flags a partial refresh when the sync fell back to stale sections', async ({ board, data, serveData }) => {
    const served = await serveData(data.base());
    await board.goto('?poll=1000');
    await expect(board.syncNote).toContainText('scores as of');
    await expect(board.syncNote).not.toContainText('partial refresh');

    served.set(data.withStale(['settings']));
    await expect(board.syncNote).toContainText('(partial refresh)', { timeout: 5_000 });

    served.set(data.base());
    await expect(board.syncNote).not.toContainText('partial refresh', { timeout: 5_000 });
  });
});
