/** Panel round 2 fix list, items 4 to 7 (12, 13, 10, 18, 19): rule numbers in the titles. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { load } = require('./helpers/fright-fixtures.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const art = load('art');
const pace = load('pace');
const hooks = load('hooks');

test('R2-4 Deep Lantern entry points: profile + player chip and the collection book Events tile, all season', () => {
  const chip = read('src/components/profile/ProfileEventChip.tsx');
  assert.match(chip, /return <FrightCardChip playerId=\{playerId\} \/>/);
  assert.match(read('src/screens/ProfileScreen.tsx'), /<ProfileEventChip \/>/);
  assert.match(read('src/screens/PlayerScreen.tsx'), /<ProfileEventChip playerId=\{currentPlayer\.id\} \/>/);
  // Ship merge: the book shows Events as set cards in its own picker (menu-dex EventTab, CONTRACT 6), not the shelf tile.
  const book = read('src/screens/SetCollectionScreen.tsx');
  assert.match(book, /<EventTab key=\{`event-\$\{card\.eventSlug\}`\}/);
  assert.match(book, /RootNavigation\.navigate\('FrightCard', \{ eventSlug: card\.eventSlug \}\)/);
  const shelf = read('src/components/fright/FrightEventShelf.tsx');
  assert.match(shelf, /getEventShelf/);
  assert.match(shelf, /navigate\('FrightCard'/);
  assert.match(shelf, /if \(!shelf\.cards\.length\) return null;/, 'nothing without a card');
  assert.doesNotMatch(shelf.replace(/\/\*[\s\S]*?\*\//g, ''), /modeOn|phase/, 'not tied to live phases');
  // The book data file is byte-identical to claude/release-rc when that branch is available (clean RC merge).
  try {
    const rc = execFileSync('git', ['-C', path.join(root, '../../tps-prime-time'), 'show', 'claude/release-rc:src/screens/SetCollection/eventCards.ts'],
      { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    assert.equal(read('src/screens/SetCollection/eventCards.ts'), rc);
  } catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
  }
  const events = loadTs('src/screens/SetCollection/eventCards.ts', { '../../api/client': {} });
  assert.equal(events.parseEventShelf({ data: [] }).cards.length, 0);
  assert.equal(events.parseEventShelf({ data: [{ event_slug: 'usf-2026', card_title: 'Fin-ister Nights 2026', haunts_done: 1, haunts_total: 10 }],
    lifetime: { haunts_survived: 1 } }).cards[0].done, 1);
});

test('R2-5 park tip: suppressed while Fin-ister is on or its recap is up; the intro waits for a showing tip and owns the first open', () => {
  assert.equal(hooks.frightOwnsParkTips({ modeOn: true, recapUp: false }), true);
  assert.equal(hooks.frightOwnsParkTips({ modeOn: false, recapUp: true }), true);
  assert.equal(hooks.frightOwnsParkTips({ modeOn: false, recapUp: false }), false);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /blocked: !isReady \|\| isActive \|\| homeIntroOpen \|\| parkTipShowing/);
  assert.match(explore, /!hasCompleted\('onboarding'\) && !frightIntroOwns/, 'Finn onboarding waits for the Fin-ister intro');
  assert.match(explore, /hasCompleted\('park_arrival'\) \|\| frightIntroOwns\) return;/);
  const engine = loadTs('src/components/fright/useFrightEngine.ts', {
    'expo-location': {}, react: {}, '../../api/endpoints/fright': {}, '../../services/fright/copy': { COPY: {} },
    '../../services/fright/storage': {}, '../../services/fright/art': {},
  });
  const pending = engine.frightIntroPending;
  assert.equal(pending({ modeOn: false, hasEvent: true, loaded: true, tutorial: null, plan: 'intro' }), false);
  assert.equal(pending({ modeOn: true, hasEvent: true, loaded: true, tutorial: null, plan: 'intro' }), true);
  assert.equal(pending({ modeOn: true, hasEvent: true, loaded: false, tutorial: null, plan: null }), true, 'until seen state loads');
  assert.equal(pending({ modeOn: true, hasEvent: true, loaded: true, tutorial: 'intro', plan: null }), true);
  assert.equal(pending({ modeOn: true, hasEvent: true, loaded: true, tutorial: null, plan: null }), false, 'seen this season');
});

test('R2-6 Deep Lantern screen: real pin counts, found Case Files first, locked as small silhouettes, sticky header, "1 haunt"', () => {
  const slots = [
    { earned: true, pin: { image: 'https://cdn.test/a.webp', earned_on: 'x' }, pin_art: null },
    { earned: false, pin: null, pin_art: { image: 'https://cdn.test/b.webp', locked: 'https://cdn.test/bl.webp' } },
    { earned: false, pin: null, pin_art: null },
  ];
  assert.deepEqual({ ...art.pinCounts({ pins_earned: 0, pins_total: 0, slots }) }, { earned: 1, total: 2 });
  assert.deepEqual({ ...art.pinCounts({ pins_earned: 3, pins_total: 10, slots: [] }) }, { earned: 3, total: 10 });
  const files = art.orderCaseFiles([{ number: 3, found: false }, { number: 2, found: true }, { number: 1, found: false }]);
  assert.equal(files.found.map(f => f.number).join(), '2');
  assert.equal(files.locked.map(f => f.number).join(), '1,3');
  const screen = read('src/components/fright/FrightCardScreen.tsx');
  assert.match(screen, /styles\.sticky, \{ paddingTop: insets\.top/);
  assert.match(screen, /Pins \$\{pinCount\.earned\} of \$\{pinCount\.total\}/);
  assert.match(screen, /styles\.lockedFile/);
  assert.doesNotMatch(screen, /'\?\?\?'\}<\/Text>\s*\{file\.found/, 'no tall ??? tiles');
  assert.equal(pace.hauntsWord(1), '1 haunt');
  assert.equal(pace.hauntsWord(2), '2 haunts');
  assert.doesNotMatch(screen, /\$\{item\.haunts\} haunts/);
});

test('R2-12 Team Chaos vs Team Control hides until encounters ship', () => {
  assert.equal(art.showTally({ chaos: 0, control: 0 }, false), false);
  assert.equal(art.showTally({ chaos: 0, control: 0 }, true), true);
  assert.equal(art.showTally({ chaos: 3, control: 1 }, false), true);
  assert.match(read('src/components/fright/FrightCardScreen.tsx'), /\{tallyOn && <>/);
});

test('R2-13 pill: "just joined" for the first minute; R2-10 "Unlocks in N min" under the locked button', () => {
  assert.equal(pace.pillSubLine({ inLine: { name: 'The Robot City', minutes: 0 }, done: 0, total: 10 }), 'In line: The Robot City · just joined');
  assert.equal(pace.pillSubLine({ inLine: { name: 'The Robot City', minutes: 3 }, done: 0, total: 10 }), 'In line: The Robot City · 3 min');
  assert.equal(pace.unlockText(6), 'Unlocks in 6 min');
  assert.equal(pace.unlockText(0), null);
  assert.match(read('src/components/fright/FrightSheet.tsx'), /!engine\.canSurvive && unlockText\(/);
});

test('R2-18 "EVERY RIDE IS OPEN" never shows on an event night at an event park (before, during, after grace)', () => {
  assert.equal(hooks.hideEveryRideOpen({ modeOn: true, eventPark: true, hasNight: true }), true);
  assert.equal(hooks.hideEveryRideOpen({ modeOn: false, eventPark: true, hasNight: true }), true, 'before activation and in after');
  assert.equal(hooks.hideEveryRideOpen({ modeOn: false, eventPark: true, hasNight: false }), false, 'no event tonight');
  assert.equal(hooks.hideEveryRideOpen({ modeOn: false, eventPark: false, hasNight: false }), false);
});

test('R2-19 one "?": the pill has no own help on the map; the map "?" offers Fin-ister first while the mode is on', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  // In the map's one status row (declutter) the pill is inline; still no own help.
  assert.match(explore, /<FrightPill (inline )?night=\{frightNight\} engine=\{frightEngine\} \/>/);
  assert.match(explore, /onPress=\{frightNight\.modeOn \? \(\) => gameAlert\('How to play', undefined, frightHelpChoices\(/);
  const choices = hooks.frightHelpChoices({ title: 'Fin-ister Nights', onFright: () => {}, onPark: () => {} });
  assert.equal(choices[0].text, 'Fin-ister Nights');
  assert.equal(choices[1].text, 'Park help');
  assert.match(read('src/components/help/HelpButton.tsx'), /if \(onPress\) onPress\(\); else if \(sheet\) openHelpSheet\(sheet\); else openHowToPlay\(topic\);/);
});
