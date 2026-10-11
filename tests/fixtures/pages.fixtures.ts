// POM fixtures.
import { test as base } from '@playwright/test';
import { BoardPage } from '../pages/BoardPage';

export const test = base.extend<{ board: BoardPage }>({
  board: async ({ page }, use) => {
    await use(new BoardPage(page));
  },
});
