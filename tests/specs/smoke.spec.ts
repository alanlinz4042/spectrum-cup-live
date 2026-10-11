import { test, expect } from '../fixtures';

test.describe('spectator page', { tag: '@smoke' }, () => {
  test.beforeEach(async ({ board }) => {
    await board.goto();
  });

  test('tally shows the fixture totals', async ({ board, data }) => {
    await expect(board.tallyPS).toHaveText(data.expected.ps);
    await expect(board.tallyIL).toHaveText(data.expected.il);
    await expect(board.tallyMid).toContainText('PTS');
    await expect(board.tallyMid).toContainText('LEFT');
    await expect(board.syncNote).toContainText('scores as of');
  });

  test('only the public tabs and panels exist', async ({ board }) => {
    expect(await board.tabNames()).toEqual(['Live', 'Cup']);
    await expect(board.privateSurfaces).toHaveCount(0);
  });

  test('Live shows Thursday rounds with course marks', async ({ board }) => {
    await board.open('Live');
    await board.day('thu').click();
    await expect(board.liveRounds).toHaveCount(2);
    await expect(board.liveCourseMarks.first()).toBeVisible();
    await expect(board.liveRoundTitles.first()).toContainText('R1 · Ozarks National');
    await expect(board.liveMatches).toHaveCount(6);
  });

  test('Cup shows the board, player tally and a dollar-free recap', async ({ board, data }) => {
    await board.open('Cup');
    await expect(board.boardTotals).toHaveText([data.expected.ps, data.expected.il]);
    await expect(board.playerTallyRows).toHaveCount(data.expected.players + 1);
    await expect(board.recaps.first()).toBeVisible();
    await expect(board.recaps.first()).toContainText('Snake');
    for (const text of await board.recaps.allTextContents()) expect(text).not.toContain('$');
  });
});
