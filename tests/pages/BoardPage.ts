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
  readonly sponsorLink: Locator;
  readonly playerTally: Locator;
  readonly playerTallyTeamPills: Locator;
  readonly csp: Locator;
  readonly teamMarkPS: Locator;
  readonly boardTotals: Locator;
  readonly playerTallyRows: Locator;
  readonly recaps: Locator;
  readonly liveRounds: Locator;
  readonly liveCourseMarks: Locator;
  readonly liveRoundTitles: Locator;
  readonly liveMatches: Locator;
  readonly liveMatchStatuses: Locator;
  readonly cupRoundLogos: Locator;
  readonly compChips: Locator;
  readonly privateSurfaces: Locator;
  readonly injectedImages: Locator;

  constructor(readonly page: Page) {
    this.status = page.locator('#status');
    this.tallyPS = page.locator('#tPS');
    this.tallyIL = page.locator('#tIL');
    this.tallyMid = page.locator('#tMid');
    this.syncNote = page.locator('#syncNote');
    this.tabs = page.locator('#tabs button');
    this.crest = page.locator('#crest');
    this.sponsorMark = page.locator('#sponTop img');
    this.sponsorLink = page.locator('#sponTop');
    this.playerTally = page.locator('#ptally');
    this.playerTallyTeamPills = page.locator('#ptally td:nth-child(3) .pill');
    this.csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
    this.teamMarkPS = page.locator('.tmark.ps');
    this.boardTotals = page.locator('#board .tot');
    this.playerTallyRows = page.locator('#ptally tr');
    this.recaps = page.locator('.recap');
    this.liveRounds = page.locator('.lv-round');
    this.liveCourseMarks = page.locator('.lv-head .cmark');
    this.liveRoundTitles = page.locator('.lv-head .t');
    this.liveMatches = page.locator('.lv-m');
    this.liveMatchStatuses = page.locator('.lv-m .thru');
    this.cupRoundLogos = page.locator('.cup-round .clogo');
    this.compChips = page.locator('.cspon');
    this.privateSurfaces = page.locator('#meSel, #pickme, #p-score, #p-pots, #p-setup, #p-hcp');
    this.injectedImages = page.locator('img[src="x"], img[onerror]');
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

  /** Status line ("Thru 9", "Tee 8:10 AM", "Not started") of the nth match on the selected Live day. */
  liveMatchStatus(index: number) {
    return this.liveMatchStatuses.nth(index);
  }

  /** Eyebrow ("Match N[ · Tee …]") of the nth match card on round `n` (1-based) of the Cup tab. */
  cupMatchEyebrow(round: number, index: number) {
    return this.page.locator('.cup-round').nth(round - 1).locator('.mcard .eyebrow').nth(index);
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

  /** Set by the XSS probes in the tampered fixtures; must stay undefined. */
  pwned() {
    return this.page.evaluate(() => (window as any).__pwned);
  }
}
