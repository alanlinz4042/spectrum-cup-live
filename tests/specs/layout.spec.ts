import { test, expect } from '../fixtures';

test.describe('layout', { tag: '@layout' }, () => {
  test('no horizontal page scroll on either tab', async ({ board }) => {
    await board.goto();
    await board.open('Cup');
    expect(await board.hasHorizontalOverflow()).toBe(false);
    await board.open('Live');
    expect(await board.hasHorizontalOverflow()).toBe(false);
  });
});
