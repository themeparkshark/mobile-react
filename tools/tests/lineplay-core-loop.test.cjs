'use strict';
/**
 * LinePlay in the core loop (blueprint 5.5, 5.13, 7 and must-fixes 3, 8, 9, 21, 22; PLAN.json lineplay-ride).
 *
 *  - Every PLAY can be pressed: on a game page PLAY sits right under the banner, inside the page's own
 *    scroll window, and the rail is in the layout below it (never over it).
 *  - No seconds countdown text anywhere in src/screens/LinePlay.
 *  - A calm top: minutes in line and Parts, "Parts are saved for this coin" with no coin yet.
 *  - Two tabs, Story and Games; crew pages only for a crew of 2 or more; new rounds are a dot on Games.
 *  - A game played counts as played, won, lost or quit.
 *  - The recap: only what you got (no "+0"), "Sign said 20, you waited 11", one GO through the guide,
 *    the line Ticket only while queue_tickets is on.
 *  - The end sheet names a wait guess only when one was made.
 *  - Current Quest v1 never opens a line; the ladder events are recorded.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);

test('no seconds countdown text anywhere in src/screens/LinePlay', () => {
  const files = walk('src/screens/LinePlay');
  assert.ok(files.length > 20);
  for (const file of files) {
    const src = read(file);
    // A clock written as m:ss (`${m}:${s.padStart(2, '0')}`), "ends in 42s", "until your next Ride Part".
    assert.doesNotMatch(src, /\$\{[^}]+\}:\$\{[^}]*padStart\(2/, `${file} formats a ticking m:ss clock`);
    assert.doesNotMatch(src, /ends in \$\{/, `${file} counts seconds down`);
    assert.doesNotMatch(src, /until your (first|next) Ride Part'/, `${file} counts down to a Part`);
    assert.doesNotMatch(src, /graceMsRemaining|countdown\.remainingSeconds/, `${file} shows time remaining`);
  }
  const bonus = loadTs('src/services/lineplay/bonusRounds.ts');
  assert.equal(bonus.formatClock(252), '5 min', 'the bonus round words are minutes');
  assert.equal(bonus.formatClock(30), 'under 1 min');
  // The wait card's clock words are minutes only.
  const card = pick('src/screens/LinePlay/components/WaitCard.tsx', ['function fmt(', 'export function calmPartsLine(',
    'export const COIN_MISSING_LINE', 'export function ticketHint(']);
  assert.equal(card.calmPartsLine({ elapsedSeconds: 200, earned: 0, intervalSeconds: 600 }), 'In line 3 min · first Part at 10 min');
  assert.equal(card.calmPartsLine({ elapsedSeconds: 1500, earned: 2, intervalSeconds: 600 }), 'In line 25 min · 2 Parts');
  assert.equal(card.calmPartsLine({ elapsedSeconds: 20, earned: 0, intervalSeconds: 600 }), 'Just joined the line · first Part at 10 min');
  assert.equal(card.COIN_MISSING_LINE, 'Parts are saved for this coin. Win it on your way out.');
  // No coin yet: the one line still shows progress toward the coin; the sentence moves to Details.
  assert.equal(card.calmPartsLine({ elapsedSeconds: 720, earned: 1, intervalSeconds: 600, coinMissing: true }),
    'In line 12 min · 1 Part saved for this coin');
  assert.equal(card.calmPartsLine({ elapsedSeconds: 200, earned: 0, intervalSeconds: 600, coinMissing: true }),
    'In line 3 min · first Part at 10 min');
  const waitCard = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(waitCard, /calmPartsLine\(\{ elapsedSeconds, earned, intervalSeconds: interval, coinMissing \}\)/);
  assert.match(waitCard, /: coinMissing \? COIN_MISSING_LINE/);
  assert.match(waitCard, /const sublineInHeadline = Boolean\(hero\) && calmLine && !coinMissing;/);
  assert.doesNotMatch(card.ticketHint(true, 0, 600), /\d:\d\d/);
  assert.equal(card.fmt(450), '7 min');
});

/** Transpile just the named top-level pieces of a file (pure helpers inside a component file). */
function pick(file, starts) {
  const src = read(file);
  const ts = require(path.join(root, 'node_modules/typescript'));
  const chunks = starts.map(start => {
    const i = src.indexOf(start);
    assert.ok(i >= 0, `${file}: ${start}`);
    const end = start.startsWith('export const') ? src.indexOf(';\n', i) + 2 : src.indexOf('\n}\n', i) + 3;
    return src.slice(i, end).replace(/^export /, '');
  });
  const names = starts.map(start => start.replace(/^export /, '').match(/(?:function|const) (\w+)/)[1]);
  const js = ts.transpileModule(`${chunks.join('\n')}\nmodule.exports = { ${names.join(', ')} };`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('every PLAY can be pressed on 375 and 402 pt phones: PLAY first in its page, the rail below the pages', () => {
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  const game = slot.slice(slot.indexOf('function MiniGameSlot('), slot.indexOf('// -- trivia'));
  // The game page is its own scroll window (PageScroll), like the clue and story pages, and PLAY leads it.
  assert.match(game, /<PageScroll fill=\{CARD_FILL\}>/);
  const hero = game.indexOf('<ActivityHero'), play = game.indexOf('<PlayFirst');
  assert.ok(hero >= 0 && play > hero, 'PLAY right under the banner');
  assert.ok(play < game.indexOf('styles.gamePlaceholder') && play < game.indexOf('styles.bestRow'), 'before any text');
  // Banner (110 pt, 46 pt slim) + gap + PLAY (about 56 pt) fits the smallest page window an iPhone SE shows (113 pt).
  const layout = loadTs('src/services/lineplay/lineLayout.ts', { '../../ui/iconNames': {} });
  assert.equal(layout.heroSlim(113), true, 'an iPhone SE page draws the slim 46 pt banner, so PLAY lands at about 54 pt');
  assert.equal(layout.heroSlim(250), false, 'an iPhone 17 Pro page (about 250 pt) has room for the full banner and PLAY (about 182 pt)');
  // The rail is a row in the layout under the page window (no absolute position), so nothing can sit on a PLAY.
  const rail = read('src/screens/LinePlay/components/ActivityPageRail.tsx');
  assert.doesNotMatch(rail.slice(rail.indexOf('rail: {'), rail.indexOf('chapter: {')), /position: 'absolute'/);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /<\/Reanimated\.View>\n\s+\{\/\* The window stepped aside/, 'the page window closes before the rail');
  // Every page kind scrolls in its own window.
  for (const file of ['ChapterCard', 'CrewRelayCard', 'CrewGridCard', 'SignalCard', 'CrewPuzzleCard', 'NavigationPanelCard']) {
    assert.match(read(`src/screens/LinePlay/components/${file}.tsx`), /PageScroll|ScrollView/, `${file} scrolls`);
  }
});

test('Story and Games: one word per tab, crew pages only for a crew, new rounds are a dot', () => {
  const tabs = loadTs('src/services/lineplay/linePlayTabs.ts');
  const ch = 'jungle-cruise-8';
  const pages = [
    { kind: 'chapter_intro', id: `${ch}-intro` }, { kind: 'trivia', id: `${ch}-trivia` }, { kind: 'lore', id: `${ch}-field-note` },
    { kind: 'minigame', id: `${ch}-finale` }, { kind: 'crew_relay', id: `${ch}-crew-relay` }, { kind: 'minigame', id: `${ch}-route-alpha` },
    { kind: 'minigame', id: 'mg-1' }, { kind: 'trivia', id: 'tr-2' }, { kind: 'circuit', id: 'cx-4' }, { kind: 'prediction', id: 'pred-4' },
    { kind: 'crew_grid', id: `${ch}-crew-grid` },
  ];
  assert.deepEqual(pages.map(page => tabs.pageTab(page, ch)),
    ['story', 'story', 'story', 'story', 'story', 'story', 'games', 'games', 'games', 'games', 'story']);
  const solo = pages.filter(page => !tabs.isCrewOnlyPage(page, ch));
  assert.deepEqual(solo.map(page => page.id), [`${ch}-intro`, `${ch}-trivia`, `${ch}-field-note`, `${ch}-finale`, 'mg-1', 'tr-2', 'cx-4', 'pred-4'],
    'a solo wait never meets Crew Relay, Crew Prompts or the relay route game');
  // Next stays in its tab: the last story page wraps to the first, the last game wraps to the first game.
  assert.equal(tabs.nextInTab(solo, 3, ch), 0);
  assert.equal(tabs.nextInTab(solo, 7, ch), 4);
  assert.equal(tabs.nextInTab(solo, 0, ch, `${ch}-trivia`), 2, 'PLAY NOW already opens clue 1');
  assert.equal(tabs.storyTabIndex(solo, ch), 0);
  assert.equal(tabs.storyTabIndex(solo.slice(4), ch), null, 'a ride with no line story has no Story tab');
  assert.equal(tabs.gamesDot(9, 2, 'story'), true);
  assert.equal(tabs.gamesDot(9, 9, 'games'), false, 'seen');
  assert.equal(tabs.gamesDot(-1, 2, 'story'), false);
  // The screen: tabs on the rail, the banner gone, crew pages filtered for solo.
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.doesNotMatch(screen, /<NewRoundsBanner/);
  assert.match(screen, /const activityPages = crewInLine \? allPages : allPages\.filter\(page => !isCrewOnlyPage\(page, snapshot\.chapter\?\.id\)\);/);
  assert.match(screen, /tabs=\{\{\n\s+active: visibleTab,/);
  // The chapter page's own crew tiles follow the same rule: a solo wait sees no Crew Relay tile or Crew Prompts link.
  const chapterCard = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(chapterCard, /\{crew && <Pressable accessibilityRole="button" accessibilityLabel=\{`Open \$\{chapter\.relay\.title\}`\}/);
  assert.match(chapterCard, /\{crew && <Pressable accessibilityRole="button" accessibilityLabel="Open Crew Prompts"/);
  assert.match(screen, /crewRelay=\{snapshot\.crewRelay\} crew=\{crewInLine\}/);
  const rail = read('src/screens/LinePlay/components/ActivityPageRail.tsx');
  assert.match(rail, /<Tab label="Story"/);
  // Story's picture is the clue magnifier, never the compass (that is the MAP footer's picture).
  assert.match(rail, /<Tab label="Story" icon="search"/);
  assert.equal(loadTs('src/services/lineplay/lineLayout.ts').railPageIcon('chapter_intro'), 'search', 'Next to the ride chapter wears the story picture');
  assert.match(rail, /const calm = quiet;/, 'Next and More games stay quiet beside a page\'s own PLAY');
  assert.match(screen, /const railQuiet = visibleItem != null;/);
  assert.match(rail, /<Tab label="Games"/);
  // No retired queue names on screen.
  for (const file of walk('src/screens/LinePlay').concat(walk('src/services/lineplay'))) {
    if (/Preview|devTour/.test(file)) continue;
    const src = read(file).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    assert.doesNotMatch(src, /'(RIDE MISSION|QUEUE QUEST|QUEUE ARCADE|SHARK FAN MISSION)'/, `${file} uses a retired queue name`);
    assert.doesNotMatch(src, /Adventures found|ADVENTURE \$\{/, `${file} counts adventures, not line stories`);
  }
  assert.equal(loadTs('src/services/lineplay/labels.ts').chapterPageKicker({ parkLabel: '' }), 'LINE STORY');
});

test('"Adventure" means only Today\'s Adventure: LinePlay and Ride Tracker strings say story, ride or line', () => {
  // Real names that hold the word (lands, a park, film series, trivia answers) are facts, not our word.
  const allowed = /Today[’']s Adventure|Adventureland|California Adventure|True-Life Adventure/g;
  const files = walk('src/screens/LinePlay').concat(walk('src/services/lineplay'), walk('src/components/RideTracker'),
    walk('src/screens/RideTracker'), ['src/screens/QueueTimesScreen.tsx']);
  for (const file of files) {
    if (/Preview|devTour/.test(file)) continue;
    const src = read(file).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    // Every string literal and JSX text run.
    const strings = src.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|>[^<>{}\n]+</g) ?? [];
    for (const text of strings) {
      if (/^['"`]\.{0,2}\/|^['"`][\w./-]+['"`]$/.test(text) && !/\s/.test(text)) continue; // import paths and keys
      const shown = text.replace(/\$\{[^}]*\}/g, '').replace(allowed, '');
      assert.doesNotMatch(shown, /\badventure/i, `${file}: ${text.slice(0, 80)}`);
    }
  }
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.doesNotMatch(recap, /YOUR LINEPLAY ADVENTURE/);
});

test('the pocket watch is Wait Times only: LinePlay never draws it, and has its own line picture', () => {
  for (const file of walk('src/screens/LinePlay').concat(walk('src/services/lineplay'), ['src/gamekit/party/LineParty.tsx'])) {
    assert.doesNotMatch(read(file), /name="queue"|icon="queue"|icon: 'queue'/, `${file} uses the Wait Times pocket watch`);
  }
  // LinePlay's own icon (Dustin's decision, ledger 37): 'line', the How to Play gold posts and rope.
  const names = loadTs('src/ui/iconNames.ts');
  assert.ok(names.isGameIconName('line'));
  // Honest provenance: How to Play's stanchions were drawn from Alex refs (not one of his originals).
  assert.ok(names.GENERATED_ICON_NAMES.includes('line') && !names.ORIGINAL_ICON_NAMES.includes('line'));
  assert.match(read('src/gamekit/party/LineParty.tsx'), /<GameIcon name="line" size=\{26\} \/>\s*<Text style=\{styles\.headsUpText\}>/);
  assert.match(read('src/ui/GameIcon.tsx'), /line: require\('\.\.\/\.\.\/assets\/icons\/game\/line\.png'\)/);
  assert.match(read('src/screens/LinePlay/components/WaitCard.tsx'), /<GameIcon name="line" size=\{54\} \/>/);
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'), /icon: 'line', title: 'Eyes up in line\.'/);
  assert.match(read('src/screens/LinePlay/components/SessionRecap.tsx'), /<GameIcon name="line" size=\{34\} \/>\s*<View style=\{styles\.stillInLineCopy\}>/);
  // Wait Times: the pocket watch is its own picture; its PLAY IN LINE button shows LinePlay's line.
  const waits = read('src/screens/QueueTimesScreen.tsx');
  assert.match(waits, /<GameIcon name="line" size=\{28\} \/>\s*<Text style=\{styles\.sessionBtnText\}>/);
});

test('the bot rival is Captain Gill in LinePlay (rank ladder Admiral Gill)', () => {
  for (const file of walk('src/screens/LinePlay').concat(walk('src/services/lineplay'), ['src/gamekit/party/LineParty.tsx'])) {
    assert.doesNotMatch(read(file), /Captain Fin|Admiral Fin/, `${file} still names Captain Fin`);
  }
  assert.match(read('src/screens/LinePlay/components/BonusPicker.tsx'), /'Crack it with Captain Gill'/);
  assert.match(read('src/gamekit/party/LineParty.tsx'), /Captain Gill is checking every board/);
});

test('a game played counts as played, won, lost or quit', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /const closePlayed = \(\) => \{\n\s+session\.markActivityCompleted\(activeGame\.id\);/);
  assert.match(screen, /onClose: groupTurn \? \(\) => finishTurn\(0\) : closePlayed,/);
  // A finished run with no stars still records the round (the shell's run-done hook).
  assert.match(screen, /if \(!partial\) session\.recordGameResult\(game\.gameId, stars\);\n\s+session\.markActivityCompleted\(game\.id\);/);
});

test('the recap: only what you got, "Sign said 20, you waited 11", one GO, the line Ticket only with queue_tickets', () => {
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  const start = recap.indexOf('export function recapStats(');
  const body = recap.slice(start, recap.indexOf('\n}\n', start) + 2);
  const ts = require(path.join(root, 'node_modules/typescript'));
  const js = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  const { recapStats } = mod.exports;
  const base = { activityCount: 2, earnedEnergy: 0, experience: 0, partsCount: 1, ticketsEarned: 1, rewardsConfirmed: true };
  // State A (App Store switches): queue_tickets off, so no Ticket chip even if one was counted.
  assert.deepEqual(recapStats({ ...base, showTickets: false }).map(t => t.key), ['activities', 'parts']);
  assert.deepEqual(recapStats({ ...base, showTickets: true }).map(t => t.key), ['activities', 'parts', 'tickets']);
  assert.ok(recapStats({ ...base, earnedEnergy: 0, experience: 0 }).every(t => t.value > 0), 'no "+0" rows');
  assert.deepEqual(recapStats({ ...base, earnedEnergy: 15, experience: 20, showEnergy: false, showXp: false }).map(t => t.key),
    ['activities', 'parts', 'tickets'], 'Energy and XP wait for their rungs');
  assert.match(recap, /showTickets = false,/, 'the line Ticket is off unless the switch says on');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /showTickets=\{queueTicketsOn\}/);
  assert.match(screen, /showEnergy=\{coinLevelsRung\.open\}/);
  assert.match(screen, /showXp=\{dailyRung\.open\}/);
  // One GO, through the guide's one pointer.
  const step = loadTs('src/services/lineplay/rideStep.ts');
  assert.deepEqual(plain(step.recapGo({ rideName: 'Jungle Cruise', coinState: 'unowned', partsEarned: 1, rideTaskId: 41, upgradeReady: false, nextCoin: null })),
    { kind: 'win_coin', taskId: 41, button: 'GO', label: 'Win Jungle Cruise’s coin: 1 Part is waiting' });
  assert.equal(step.recapGo({ rideName: 'Jungle Cruise', coinState: 'unowned', partsEarned: 2, rideTaskId: 41, upgradeReady: false, nextCoin: null }).label,
    'Win Jungle Cruise’s coin: 2 Parts are waiting');
  assert.equal(step.recapGo({ rideName: 'Jungle Cruise', coinState: 'owned', partsEarned: 1, rideTaskId: 41, upgradeReady: true, nextCoin: null }).kind, 'level_up');
  assert.deepEqual(plain(step.recapGo({ rideName: 'Jungle Cruise', coinState: 'owned', partsEarned: 0, rideTaskId: 41, upgradeReady: false,
    nextCoin: { taskId: 9, name: 'Haunted Mansion' } })), { kind: 'next_coin', label: 'Next coin: Haunted Mansion', button: 'GO', taskId: 9 });
  assert.match(screen, /if \(go\.taskId != null\) guide\.setTarget\(go\.taskId, 'lineplay_recap'\);/);
  assert.match(recap, /variant=\{\(go && onGo\) \|\| goPending \? 'ghost' : undefined\}/, 'Done is the quiet second button, also while the GO is worked out');
  assert.match(screen, /goPending=\{go == null && !goReady\}/);
  // Between the ride step and the recap: one calm card, never the locked in-line pages.
  assert.match(screen, /snapshot\.state === 'ending' && !leftLineWrapUp \? \(/);
  assert.match(screen, /<WaitWrapUpCard rideUp=\{snapshot\.endReason === 'boarded'\} \/>/);
  assert.match(screen, /signLine=\{snapshot\.boardingConfirmed \? signSaidLine\(/);
  // Games alone are said once (the Played line), never also as a lone "1 GAME" tile; the shelf GO wears the coins.
  assert.match(recap, /const earnedAny = shownStats\.some\(t => t\.key !== 'activities'\);/);
  assert.match(recap, /\{earnedAny \? <View style=\{styles\.recapStats\}>/);
  assert.match(recap, /signLine \|\| rideLogged \|\| activityNames\.length > 0 \? null : \(/);
  assert.match(recap, /go\.kind === 'shelf' \? 'coins' : 'arrow'/);
  // Crew lines only for a crew.
  assert.match(recap, /\{crew \? groupSlot : null\}/);
  assert.match(recap, /\{crew && crewRelay\?\.step === 'complete' && \(/);
});

test('the end sheet names a wait guess only when one was made', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  const sheet = screen.slice(screen.indexOf('title="How did your wait end?"'), screen.indexOf('title="Did you get to the ride?"'));
  assert.match(sheet, /: prediction \? 'You keep what you earned either way\. Your wait guess counts if you got to the ride\.'\n\s+: 'You keep what you earned either way\.'/);
  assert.doesNotMatch(screen, /Your wait guess only counts if you got to the ride\./);
});

test('the calm top: no ARCADE on the card while waiting, the tracking hint once per account, a quiet time-away toast', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.doesNotMatch(screen, /onPlayBonus=/, 'the wait card has no ARCADE button: Games is the tab');
  assert.match(screen, /const key = `lineplay\.trackingHint\.v1@p\$\{player\.id\}`;/);
  assert.match(screen, /\{trackingHintNeeded && trackingHint === 'show' && \(/);
  assert.match(screen, /body: 'Your wait and games are saved\.', quiet: true \}/);
  const toast = read('src/screens/LinePlay/components/QueueToast.tsx');
  assert.match(toast, /const HOLD_MS = 2600;/, 'about 3 s on screen in all');
  assert.match(toast, /if \(!message\.quiet\) void Haptics\.impactAsync/);
  assert.match(screen, /coinMissing=\{coinOwned === false\}/);
});

test('Current Quest v1 never opens a line: a line opens on its story or a showpiece game', () => {
  const s = loadLoose('src/services/lineplay/LinePlaySession.ts', {
    './content': { buildPredictionCard: wait => ({ id: `pred-${wait}`, postedWaitMinutes: wait }) },
    '../../games/trivia/config': { LINEPLAY_ROUND_QUESTIONS: 5 },
  });
  for (let r = 0; r < 24; r++) {
    const order = s.queueGameOrder(r);
    assert.ok(order[0] === 'tap' || order[0] === 'shark', `rotation ${r} opens on ${order[0]}`);
    assert.notEqual(order[1], 'current');
    const list = s.generatePlaylist(30, 30, null, true, r);
    assert.notEqual(list[0].gameId, 'current', 'no story: the first page is a showpiece game');
  }
});

/** Transpile one module with every import stubbed ({} unless named), for its pure exports only. */
function loadLoose(file, dependencies = {}) {
  const ts = require(path.join(root, 'node_modules/typescript'));
  const vm = require('node:vm');
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports, require: name => dependencies[name] ?? {} }, { filename: file });
  return moduleRef.exports;
}

test('the unlock ladder hears LinePlay: line_played at the first verified minute, line_part_earned on an owned coin', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /const firstVerifiedMinute = snapshot\.verifiedEligibleSeconds >= 60;/);
  assert.match(screen, /recordProgress\('line_played', \{/);
  assert.match(screen, /if \(previous == null \|\| credited <= previous \|\| coinOwned !== true\) return;\n\s+recordProgress\('line_part_earned', \{/);
});

test('the recap GO and NEXT COIN follow the guide store, and a coin you do not own counts every Part in its slot', async () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /const guideNext = useGuideTarget\(\);/);
  assert.doesNotMatch(screen, /guide\.current\(\)/, 'no one-time read of the guide during render');
  assert.match(screen, /partsEarned: slotTaskId != null \? slotPartsShown\(recapPartsEarned, slotParts\) : recapPartsEarned/);
  const log = read('src/screens/RideTracker/RideLogScreen.tsx');
  assert.match(log, /const nextCoin = useGuideTarget\(\);/);
  assert.doesNotMatch(log, /guide\.current\(\)/);
  const hook = read('src/services/lineplay/useGuideTarget.ts');
  assert.match(hook, /useSyncExternalStore\(subscribe, snapshot, snapshot\)/);
  // The slot count: never fewer than this wait's Parts, and a failed read falls back to them.
  const calls = [];
  const slot = loadTs('src/services/lineplay/slotParts.ts', { '../../api/api': { __esModule: true, default: {
    get: async (url, opts) => { calls.push([url, opts.timeout]); if (url.endsWith('/0')) throw new Error('bad'); return { data: { data: { amount: 3 } } }; },
  } } });
  assert.equal(await slot.waitingSlotParts(583), 3);
  assert.deepEqual(plain(calls), [['/me/ride-parts/583', 5000]]);
  assert.equal(await slot.waitingSlotParts(0), null);
  assert.equal(slot.slotPartsShown(1, 3), 3);
  assert.equal(slot.slotPartsShown(2, null), 2);
  assert.equal(slot.slotPartsShown(2, 0), 2, 'rewards still on their way: this wait\'s Parts');
  const go = loadTs('src/services/lineplay/rideStep.ts', { '../guide/nextCoin': {} }).recapGo;
  assert.equal(go({ rideName: 'Jungle Cruise', coinState: 'unowned', partsEarned: slot.slotPartsShown(1, 3), rideTaskId: 583,
    upgradeReady: false, nextCoin: null }).label, 'Win Jungle Cruise’s coin: 3 Parts are waiting');
});

test('the lane walks can stub the posted-wait feed, but a store or OTA bundle always reads the real feed', () => {
  const stub = loadTs('src/services/lineplay/liveStub.ts');
  assert.equal(stub.waitFeedStubMode(false, 'open'), null, 'never outside a development bundle');
  assert.equal(stub.waitFeedStubMode(false, 'off'), null);
  assert.equal(stub.waitFeedStubMode(true, undefined), null, 'only when a lane Metro sets it');
  assert.equal(stub.waitFeedStubMode(true, 'open'), 'open');
  assert.equal(stub.waitFeedStubMode(true, 'off'), 'off');
  const closed = [{ id: 'jc', name: 'Jungle Cruise', entityType: 'ATTRACTION', status: 'CLOSED', queue: { STANDBY: { waitTime: null } } }];
  const open = stub.applyWaitFeedStub(closed, 'open');
  assert.equal(open[0].status, 'OPERATING');
  assert.ok(open[0].queue.STANDBY.waitTime >= 5 && open[0].queue.STANDBY.waitTime <= 45);
  assert.equal(stub.stubPostedWait('jc'), stub.stubPostedWait('jc'), 'the same posted wait every call');
  assert.deepEqual(plain(stub.applyWaitFeedStub(closed, 'off')), []);
  assert.deepEqual(plain(stub.applyWaitFeedStub(closed, null)), closed);
  const source = read('src/services/lineplay/liveStub.ts');
  assert.match(source, /waitFeedStubMode\(typeof __DEV__ !== 'undefined' && __DEV__, process\.env\.EXPO_PUBLIC_GUIDE_LIVE_STUB\)/);
  for (const file of ['src/screens/QueueTimesScreen.tsx', 'src/screens/LinePlay/LinePlayScreen.tsx', 'src/hooks/useRideDetection.ts']) {
    assert.match(read(file), /import waitFeed from '\.\.\/(\.\.\/)?services\/lineplay\/liveStub';/, `${file} reads the feed through the stub`);
  }
});
