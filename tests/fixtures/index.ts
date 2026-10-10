// Specs import only from here: shared page object + fixture data.
import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const FIXTURE_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'sample-data.json');
export const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

// Expected totals for the fixture: r1 M1 + M2 are clean PS sweeps (3 pts each).
export const EXPECTED = { ps: '6', il: '0', players: Object.keys(fixture.players).length };

export class Board {
  constructor(readonly page: Page) {}

  async goto(query = '') {
    await this.page.goto('/' + query);
    // first pull() has landed once the status notice is gone and the tally is populated
    await expect(this.page.locator('#status')).toBeEmpty();
    await expect(this.page.locator('#tPS')).toHaveText(EXPECTED.ps);
  }

  tab(name: 'Live' | 'Cup') {
    return this.page.locator('#tabs button', { hasText: name });
  }

  async open(name: 'Live' | 'Cup') {
    await this.tab(name).click();
    await expect(this.page.locator('#p-' + name.toLowerCase())).toHaveClass(/\bon\b/);
  }

  async tabNames() {
    return this.page.locator('#tabs button').allTextContents();
  }

  async hasHorizontalOverflow() {
    return this.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  }
}

export const test = base.extend<{ board: Board }>({
  board: async ({ page }, use) => {
    await use(new Board(page));
  },
});

export { expect };
