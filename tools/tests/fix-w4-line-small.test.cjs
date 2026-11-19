'use strict';
/**
 * Fix pass w4, lane line-small: LinePlay's first minute, the ride log and the in-line cards.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('T083: the first LinePlay shows one PLAY on the story page; the rail waits for the first round', () => {
  const L = loadTs('src/services/lineplay/lineLayout.ts');
  const fresh = new Set();
  const base = { played: fresh, roundsDone: 0, pageKind: 'chapter_intro', railMode: 'pages' };
  assert.equal(L.firstLinePlayCalm(base), true, 'a brand-new player on the story page: one call only');
  assert.equal(L.firstLinePlayCalm({ ...base, roundsDone: 1 }), false, 'after the first round the rail comes back');
  assert.equal(L.firstLinePlayCalm({ ...base, played: new Set([L.FIRST_LINEPLAY_ROUND]) }), false, 'the next LinePlay opens full');
  assert.equal(L.firstLinePlayCalm({ ...base, played: new Set(['whack']) }), false, 'played a game before');
  assert.equal(L.firstLinePlayCalm({ ...base, played: null }), false, 'still loading, or a guest: the usual rail');
  assert.equal(L.firstLinePlayCalm({ ...base, pageKind: 'trivia' }), true, 'the first clue PLAY opened: still one thing to do');
  assert.equal(L.firstLinePlayCalm({ ...base, pageKind: undefined }), false, 'no page yet');
  assert.equal(L.firstLinePlayCalm({ ...base, railMode: 'back' }), false, 'Details open on a small phone keeps Show games');

  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /\{firstCalm \|\| holdPages \? <View style=\{styles\.railCalm\}/, 'the calm page keeps the rail footprint, empty');
  assert.match(screen, /notePlayedGames\(player\.id, \[FIRST_LINEPLAY_ROUND\]\)/, 'the first round is remembered');
  // The 1 2 3 bubbles are progress, never a second button beside PLAY.
  const card = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.doesNotMatch(card, /accessibilityLabel=\{`\$\{complete \? 'Replay' : 'Open'\} \$\{name\}`\}/);
  assert.doesNotMatch(card, /onPress=\{\(\) => choose\(missionIds\[index\]\)\}/);
});

test('T084: the line Ticket fills over its 10 minutes near the ride, and the copy says 10 minutes', () => {
  const L = loadTs('src/services/lineplay/lineLayout.ts');
  assert.deepEqual({ ...L.lineTicketProgress(0, 600) }, { progress: 0, full: false, minutesLeft: 10 });
  assert.deepEqual({ ...L.lineTicketProgress(300, 600) }, { progress: 0.5, full: false, minutesLeft: 5 });
  assert.deepEqual({ ...L.lineTicketProgress(610, 600) }, { progress: 1, full: true, minutesLeft: 0 });
  assert.equal(L.lineTicketProgress(NaN, NaN).progress, 0);
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /queueTicketsOn && rewardTrackingAvailable && ticketAvailable === true && !completed && \(\n\s+<LineTicketFill/);
  for (const file of ['src/services/guide/guideCopy.ts', 'src/services/guide/freeTickets.ts', 'src/screens/StoreScreen/SuppliesShop.tsx',
    'src/components/RedeemRedeemableModal.tsx', 'src/screens/ExploreScreen/adventureTicketPresentation.ts', 'src/services/help/glossary.ts']) {
    const src = read(file);
    assert.doesNotMatch(src, /'[^']*Your first wait at a ride earns/, `${file} never hides the 10 minutes`);
    assert.match(src, /10 minutes in a ride line earns/, file);
  }
});

test('T088: one name (Ride Tracker), the timed wait is said not asked, and the ride sheet uses LinePlay\'s words', () => {
  const visible = file => read(file).split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  for (const file of ['src/screens/RideTracker/RideTrackerScreen.tsx', 'src/screens/RideTracker/RideLogScreen.tsx',
    'src/screens/RideTracker/RideBatchConfirmScreen.tsx', 'src/components/RideTracker/RideLogSuccess.tsx',
    'src/screens/RideTracker/RideOnboardingScreen.tsx', 'src/screens/RideTracker/RideHistoryScreen.tsx',
    'src/components/RideTracker/ShareableRideCard.tsx', 'src/screens/ParkDayRecapCard.tsx', 'src/services/rideLogOutbox.ts',
    'src/screens/RideTracker/rideJournalModel.ts']) {
    assert.doesNotMatch(visible(file), /['">`][^'"`\n]*\b[Jj]ournal\b|JOURNAL/, `${file} never says journal on screen`);
  }
  const log = read('src/screens/RideTracker/RideLogScreen.tsx');
  assert.match(log, /\{waitTimedByLinePlay \? \(\n\s+<View style=\{\[s\.input, s\.waitTimedRow\]\}/);
  assert.match(log, /useState\(waitTimedByLinePlay \? String\(/, 'filled on the first frame');
  const sheet = read('src/components/RideTracker/RideDetectionOverlay.tsx');
  assert.match(sheet, />I got to the ride<\/Text>/);
  assert.match(sheet, />Not this time<\/Text>/);
  assert.doesNotMatch(sheet, /DID YOU JUST RIDE|Add My Ride/);
});

test('T087: Who\'s in line? is asked once a day, first, and the loading card crossfades to the queue card', async () => {
  const store = new Map();
  const S = loadTs('src/services/lineplay/lineGroupStore.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); },
    },
  });
  const crew = { version: 1, kind: 'family', players: [{ id: 'p1', name: 'Mom', kid: false }, { id: 'p2', name: 'Ava', kid: true }],
    rounds: [{ id: 'r1' }], active: null };
  const morning = new Date(2026, 10, 19, 10, 0).getTime();
  assert.equal(await S.loadDayChoice(7, morning), null, 'not asked yet today');
  await S.saveDayChoice(7, crew, morning);
  const later = await S.loadDayChoice(7, morning + 3 * 3600_000);
  assert.equal(later.kind, 'family');
  assert.equal(later.players.length, 2);
  assert.equal(later.rounds.length, 0, 'the next wait starts its own rounds');
  assert.equal(await S.loadDayChoice(7, morning + 24 * 3600_000), null, 'tomorrow asks again');
  assert.equal(await S.loadDayChoice(8, morning), null, 'per player');
  const hook = read('src/services/lineplay/useLineGroup.ts');
  assert.match(hook, /if \(!saved\.chosen && today\) \{/);
  assert.match(hook, /if \(id != null && group\) void saveDayChoice\(id, group\);/);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /const holdPages = groupPlay\.asking \|\| !pagesReady;/);
  assert.match(screen, /\{holdPages && <Reanimated\.View exiting=\{reducedFx \? undefined : FadeOut\.duration\(240\)\}/);
  const group = read('src/screens/LinePlay/group/useGroupPlay.tsx');
  assert.match(group, /const asking = live && !editing && \(!crew\.loaded \|\| \(!crew\.chosen && !gameOpen\)\);/);
});

test('T090: the game banner title never auto-shrinks (it stuck at about 4 px after a game); slim sizes come from the name', () => {
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  const hero = slot.slice(slot.indexOf('function ActivityHero('), slot.indexOf('export default function ActivitySlot('));
  assert.doesNotMatch(hero, /adjustsFontSizeToFit/);
  assert.match(hero, /slim && slimTitleSize\(title\)\]\}\n\s+numberOfLines=\{slim \? 1 : undefined\} ellipsizeMode="tail">/);
  const fn = slot.slice(slot.indexOf('export function slimTitleSize'), slot.indexOf('function ActivityHero('));
  const slimTitleSize = new Function(`${fn.replace('export function', 'function').replace(/: \{[^}]*\}/, '').replace('(title: string)', '(title)')}; return slimTitleSize;`)();
  assert.equal(slimTitleSize('Follow the stamp').fontSize, 19);
  assert.equal(slimTitleSize('Search for the lucky penny').fontSize, 17.5);
  assert.equal(slimTitleSize('Rebuild the park map and the dispatch').fontSize, 16);
});
