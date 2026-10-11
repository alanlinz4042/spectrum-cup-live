// Page object for the spectator page. Locators and interactions only — no assertions.
import { type Page, type Locator } from '@playwright/test';

export type TabName = 'Live' | 'Cup';

export class BoardPage {
  readonly status: Locator;
  readonly tallyPS: Locator;
  readonly tallyIL: Locator;
  readonly tallyMid: Locator;
  readonly syncNote: Locator;
  readonly tabs: Locator;
  readonly crest: Locator;
  readonly sponsorMark: Locator;
  readonly teamMarkPS: Locator;
  readonly boardTotals: Locator;
  readonly playerTallyRows: Locator;
  readonly recaps: Locator;
  readonly liveRounds: Locator;
  readonly liveCourseMarks: Locator;
  readonly liveRoundTitles: Locator;
  readonly liveMatches: Locator;
  readonly cupRoundLogos: Locator;
  readonly privateSurfaces: Locator;

  constructor(readonly page: Page) {
    this.status = page.locator('#status');
    this.tallyPS = page.locator('#tPS');
    this.tallyIL = page.locator('#tIL');
    this.tallyMid = page.locator('#tMid');
    this.syncNote = page.locator('#syncNote');
    this.tabs = page.locator('#tabs button');
    this.crest = page.locator('#crest');
    this.sponsorMark = page.locator('#sponTop img');
    this.teamMarkPS = page.locator('.tmark.ps');
    this.boardTotals = page.locator('#board .tot');
    this.playerTallyRows = page.locator('#ptally tr');
    this.recaps = page.locator('.recap');
    this.liveRounds = page.locator('.lv-round');
    this.liveCourseMarks = page.locator('.lv-head .cmark');
    this.liveRoundTitles = page.locator('.lv-head .t');
    this.liveMatches = page.locator('.lv-m');
    this.cupRoundLogos = page.locator('.cup-round .clogo');
    this.privateSurfaces = page.locator('#meSel, #pickme, #p-score, #p-pots, #p-setup, #p-hcp');
  }

  /** Navigate and wait for the first data.json pull to land (the boot notice is cleared by pull()). */
  async goto(query = '') {
    await this.page.goto('/' + query);
    await this.page.waitForFunction(() => document.querySelector('#status')?.innerHTML === '');
  }

  tab(name: TabName) {
    return this.tabs.filter({ hasText: name });
  }

  panel(name: TabName) {
    return this.page.locator('#p-' + name.toLowerCase());
  }

  async open(name: TabName) {
    await this.tab(name).click();
    await this.page.locator(`#p-${name.toLowerCase()}.on`).waitFor();
  }

  day(id: 'wed' | 'thu' | 'fri' | 'sat') {
    return this.page.locator(`[data-day="${id}"]`);
  }

  tabNames() {
    return this.tabs.allTextContents();
  }

  hasHorizontalOverflow() {
    return this.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  }

  crestNaturalWidth() {
    return this.crest.evaluate((img: HTMLImageElement) => img.naturalWidth);
  }

  cssVariable(name: string) {
    return this.page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
  }

  /** Everything a spectator could read or view-source on the rendered page. */
  renderedText() {
    return this.page.evaluate(() => document.body.innerText);
  }

  renderedHtml() {
    return this.page.evaluate(() => document.body.innerHTML);
  }
}
