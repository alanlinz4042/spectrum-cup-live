import { test, expect } from '../fixtures';

// Defense in depth: even if sync.py regressed and leaked private player fields into data.json,
// the rendered page must never show them (the surviving render sites only use name/team/captain/index).
const PRIVATE = { phone: '910-555-0142', ghin: '7781234', club: 'Cape Fear Country Club', email: 'avery.alder@example.com' };

test.describe('privacy', { tag: '@security' }, () => {
  test('private player fields in data.json never reach the rendered DOM', async ({ board, data, serveData }) => {
    await serveData(data.withPrivatePlayer('p01', PRIVATE));
    await board.goto();

    for (const tab of ['Live', 'Cup'] as const) {
      await board.open(tab);
      if (tab === 'Live') await board.day('thu').click();
      // p01 is rendered on both tabs (Live match card, Cup player tally), so the page did read this player doc.
      await expect(board.panel(tab)).toContainText(data.base().players.p01.name.split(' ').pop());
      const text = await board.renderedText();
      const html = await board.renderedHtml();
      for (const value of Object.values(PRIVATE)) {
        expect.soft(text, `${tab} innerText leaks ${value}`).not.toContain(value);
        expect.soft(html, `${tab} innerHTML leaks ${value}`).not.toContain(value);
      }
    }
  });

  test('control: a private value placed in a rendered field is detected', async ({ board, data, serveData }) => {
    await serveData(data.withPrivateValueInName('p01', PRIVATE.phone));
    await board.goto();
    await board.open('Cup');
    expect(await board.renderedText()).toContain(PRIVATE.phone);
  });
});
