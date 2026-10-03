const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers/fright-fixtures.cjs');

const tut = load('tutorial');
const root = path.resolve(__dirname, '../..');

test('show-once: the intro shows at the first activation of a season, never again once seen', () => {
  assert.equal(tut.introPlan({ seen: {} }), 'intro');
  assert.equal(tut.introPlan({ seen: { intro: '2026-10-09T20:00:00-04:00' } }), null);
  assert.equal(tut.introPlan({ seen: { welcome_back: 'x' } }), null);
});

test('returning players get Welcome back, not the full tutorial', () => {
  assert.equal(tut.introPlan({ seen: {}, returning: true }), 'welcome_back');
  assert.equal(tut.introPlan({ seen: {}, returning: false }), 'intro');
});

test('season reset: a new event slug starts with nothing seen; the local mirror covers a pending POST', () => {
  let local = tut.markSeenLocal(null, 'usf-2026', 'intro', 'a');
  assert.equal(tut.mergeSeen('usf-2026', null, local).intro, 'a', 'offline: the mirror keeps it seen');
  assert.equal(tut.mergeSeen('usf-2027', null, local).intro, undefined, 'new season resets');
  local = tut.markSeenLocal(local, 'usf-2027', 'haunt_near', 'b');
  assert.equal(local.slug, 'usf-2027');
  assert.equal(local.keys.intro, undefined);
  assert.equal(tut.mergeSeen('usf-2027', { reef_first: 'c' }, local).reef_first, 'c', 'server seen merges in');
  assert.equal(tut.parseSeenStore('nope'), null);
  assert.equal(tut.FRIGHT_SEEN_KEYS.length, 9);
  assert.equal(tut.isSeenKey('exit'), true);
  assert.equal(tut.TUTORIAL_CARDS.length, 5);
  assert.ok(tut.TUTORIAL_CARDS.every(card => card.line.split(/\s+/).length <= 7), 'one short line each, 7 words or fewer');
  assert.ok(!tut.TUTORIAL_CARDS.some(card => /chaos/i.test(card.title + card.line)), 'no Chaos Hour promise while the encounter is off');
});

test('coach marks: queued, max one visible, min 20 s apart, never while phones-down, once per season', () => {
  let s = tut.EMPTY_COACH;
  s = tut.coachEnqueue(s, 'haunt_near', {});
  s = tut.coachEnqueue(s, 'reef_first', {});
  s = tut.coachEnqueue(s, 'haunt_near', {});
  assert.equal(s.queue.length, 2, 'no duplicates');
  assert.equal(tut.coachEnqueue(s, 'rank_first', { rank_first: 'x' }).queue.length, 2, 'seen this season: skipped');
  s = tut.coachTick(s, 1000, false);
  assert.equal(s.visible, null, 'phones-down / dialog open: wait');
  s = tut.coachTick(s, 1000, true);
  assert.equal(s.visible, 'haunt_near');
  s = tut.coachTick(s, 2000, true);
  assert.equal(s.visible, 'haunt_near', 'max one visible');
  s = tut.coachDismiss(s, 5000);
  s = tut.coachTick(s, 24_000, true);
  assert.equal(s.visible, null, 'under 20 s since the last one hid');
  assert.equal(tut.coachWaitMs(s, 24_000), 1000);
  s = tut.coachTick(s, 25_000, true);
  assert.equal(s.visible, 'reef_first');
  // Seen elsewhere (another device) while queued: dropped.
  let t = tut.coachEnqueue(tut.EMPTY_COACH, 'chaos_hour', {});
  t = tut.coachTick(t, 0, true, { chaos_hour: 'x' });
  assert.equal(t.visible, null);
  assert.equal(t.queue.length, 0);
});

test('Chaos Hour is the encounter window holding 11:11 PM park time', () => {
  assert.equal(tut.isChaosHour('2026-10-09T23:08:00-04:00', '2026-10-09T23:15:00-04:00'), true);
  assert.equal(tut.isChaosHour('2026-10-09T21:00:00-04:00', '2026-10-09T21:07:00-04:00'), false);
});

test('replay entry points: openFrightTutorial is exported for How to Play and the pill has a "?"', () => {
  const index = fs.readFileSync(path.join(root, 'src/components/fright/index.ts'), 'utf8');
  assert.match(index, /export \{[^}]*openFrightTutorial/);
  const pill = fs.readFileSync(path.join(root, 'src/components/fright/FrightPill.tsx'), 'utf8');
  assert.match(pill, /openFrightTutorial|onHelp/);
  const rootNav = fs.readFileSync(path.join(root, 'src/Root.tsx'), 'utf8');
  assert.match(rootNav, /name="FrightTutorial"/);
});
