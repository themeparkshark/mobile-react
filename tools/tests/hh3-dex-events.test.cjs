'use strict';
/**
 * Fin-ister Nights in the collection book (fright-nights/CONTRACT.md section 6):
 * one Events set card per earned yearly card, after the Home Hunt sets, opening
 * the fright app's card screen. Names only from the server; nothing on 404 or empty.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const events = loadTs('src/screens/SetCollection/eventCards.ts', { '../../api/client': { default: { get: async () => ({ data: {} }) } } });

test('parses earned cards, newest first, with the lifetime haunts count', () => {
  const shelf = plain(events.parseEventShelf({
    data: [
      { event_slug: 'usf-2026', year: 2026, title: 'Fin-ister Nights', card_title: 'Fin-ister Nights 2026', park_name: 'Park A',
        art: { card: 'https://x/card.webp', chip: null }, haunts_done: 6, haunts_total: 10, completed: false, ten_in_one: false },
      { event_slug: 'usf-2025', year: 2025, title: 'Fin-ister Nights', card_title: 'Fin-ister Nights 2025', park_name: 'Park A',
        art: { card: null, chip: null }, haunts_done: 10, haunts_total: 10, completed: true, ten_in_one: true },
      { event_slug: '', card_title: 'broken' }, null,
    ],
    lifetime: { haunts_survived: 16, re_swims: 2, nights: 4, events: 2 },
  }));
  assert.deepEqual(shelf.cards.map(card => card.eventSlug), ['usf-2026', 'usf-2025']);
  assert.equal(shelf.cards[0].cardTitle, 'Fin-ister Nights 2026');
  assert.equal(shelf.cards[0].art, 'https://x/card.webp');
  assert.equal(shelf.cards[1].tenInOne, true);
  assert.equal(shelf.lifetimeHaunts, 16);
});

test('empty, missing or junk payloads mean no Events card', () => {
  for (const payload of [undefined, null, {}, { data: [] }, { data: 'x' }, 'nope']) {
    assert.deepEqual(plain(events.parseEventShelf(payload)).cards, []);
  }
});

test('the picker shows Events after the Home Hunt sets and opens FrightCardScreen; no hard-coded names', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const sets = screen.indexOf('{sets.map(entry => <SetTab');
  const ev = screen.indexOf('<EventTab');
  assert.ok(sets > 0 && ev > sets, 'Events come after the Home Hunt sets in the same row');
  assert.match(screen, /RootNavigation\.navigate\('FrightCard', \{ eventSlug: card\.eventSlug \}\)/);
  assert.match(screen, /events\.cards\.length > 0 && eventRouteExists\(\)/);
  for (const file of ['src/screens/SetCollection/eventCards.ts', 'src/screens/SetCollection/DexParts.tsx', 'src/screens/SetCollectionScreen.tsx']) {
    assert.doesNotMatch(read(file), /Fin-ister|Deep Lantern|Halloween|Horror/i, `${file}: names come from the server`);
  }
});
