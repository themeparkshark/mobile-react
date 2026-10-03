const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers/fright-fixtures.cjs');

const marquee = load('marquee');
const base = { event_slug: 'usf-2026', card_title: 'Fin-ister Nights 2026', park_name: 'Universal Studios Florida',
  night_on: '2026-10-09', night_number: 3, reefs: [], pins: [], encounter: null, ten_in_one: false, headline: '',
  share: { title: '', subtitle: '', stat_lines: [] } };

test('F4 Marquee: date written out, haunts, your top haunt, time in line, case files, encounter, Ten-in-One', () => {
  const m = marquee.marqueeModel({ ...base,
    haunts: [
      { key: 'a', name: 'The Robot City', badge: null, wait_minutes: 40, posted_minutes: 60, score: 4, reaction: null, re_swim: false, at: '2026-10-09T20:00:00-04:00' },
      { key: 'b', name: 'The Farmhouse UFO', badge: null, wait_minutes: 50, posted_minutes: 75, score: 5, reaction: 'screamed', re_swim: false, at: '2026-10-09T21:00:00-04:00' },
    ],
    case_files: [{ key: 'c', title: 'The Kelp Keeper' }], encounter: { key: 'e', name: 'Chuckles the Chum Jester' },
    totals: { haunts: 2, minutes_in_line: 160, lantern_parts: 16 }, ten_in_one: true });
  assert.equal(m.date, 'Friday, October 9');
  assert.equal(m.headline, '2 haunts survived!');
  assert.equal(m.topHaunt, 'The Farmhouse UFO');
  assert.equal(m.timeInLine, '2h 40m in line');
  assert.equal(m.caseFiles, 1);
  assert.equal(m.encounter, 'Chuckles the Chum Jester');
  assert.equal(m.tenInOne, true);
});

test('F4 Marquee: zero haunts reads "Scouted the reefs tonight."', () => {
  const m = marquee.marqueeModel({ ...base, haunts: [], case_files: [], totals: { haunts: 0, minutes_in_line: 0, lantern_parts: 0 } });
  assert.equal(m.headline, 'Scouted the reefs tonight.');
  assert.equal(m.timeInLine, null);
  assert.equal(m.topHaunt, null);
});
