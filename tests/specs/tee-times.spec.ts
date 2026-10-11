import { test, expect } from '../fixtures';

// v25: a pairing match may carry an optional `tee` string; unstarted matches show it on Live and on the Cup card.
const TEE_PAYLOAD = '<img src=x onerror="window.__pwned=1">';

test.describe('tee times', { tag: '@smoke' }, () => {
  test('an unstarted match shows its tee time on Live and on the Cup card', async ({ board, data }) => {
    await board.goto();
    await board.open('Live');
    await board.day('thu').click();
    await expect(board.liveMatchStatus(data.expected.teeMatch)).toHaveText(`Tee ${data.expected.tee}`);
    await expect(board.liveMatchStatus(0)).not.toContainText('Tee'); // a played match keeps its "Thru" status

    await board.open('Cup');
    await expect(board.cupMatchEyebrow(1, data.expected.teeMatch)).toHaveText(`Match 3 · Tee ${data.expected.tee}`);
    await expect(board.cupMatchEyebrow(1, 0)).toHaveText('Match 1');
  });
});

test.describe('tee times', { tag: '@security' }, () => {
  test('a script payload in pairings.*.tee is rendered as text', async ({ board, data, serveData }) => {
    await serveData(data.withTamperedTee('r1', 2, TEE_PAYLOAD));
    await board.goto();
    await board.open('Live');
    await board.day('thu').click();
    await expect(board.liveMatchStatus(2)).toHaveText(`Tee ${TEE_PAYLOAD}`);
    await board.open('Cup');
    await expect(board.cupMatchEyebrow(1, 2)).toContainText(TEE_PAYLOAD);

    expect(await board.pwned()).toBeUndefined();
    expect(await board.injectedImages.count()).toBe(0); // the payload became a text node, not an element
    expect(await board.renderedHtml()).not.toContain('<img src=x');
  });
});
