// Kid-trust rules, wave 6 (honesty-kids lane): no dice anywhere a kid can see.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadTs } = require('./helpers/load-ts.cjs');
const root = path.join(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name))
  : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);

test('no dice: no dice icon, no dice art, no "roll a name" button, only a sparkle alias for old data', () => {
  const offenders = [];
  for (const file of walk(path.join(root, 'src'))) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    for (const [i, line] of text.split('\n').entries()) {
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      if (rel === 'src/ui/iconNames.ts' && /dice: 'sparkle'/.test(line)) continue;
      if (/\bdice\b|'Dice'|Roll a random/i.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.equal(fs.existsSync(path.join(root, 'assets/icons/game/dice.png')), false);
  const names = loadTs('src/ui/iconNames.ts');
  assert.equal(names.isGameIconName('dice'), false);
  assert.equal(names.resolveIconName('dice'), 'sparkle');
  const welcome = read('src/screens/WelcomeScreen.tsx');
  assert.match(welcome, /accessibilityLabel="Get a new name"/);
  assert.match(welcome, /GameIcon name="sparkle"/);
  // The swirl rests under Reduce Motion.
  assert.match(welcome, /if \(!reduced\) \{\s*swirl\.value = 0;/);
});

test('no value anchors on a kid-facing shop card: a bundle\'s worth shows only inside the grown-up gate', () => {
  const card = read('src/components/money/BundleCard.tsx');
  assert.doesNotMatch(card, /Way more|one by one|Worth \$\{|in regular packs/);
  const gateSrc = read('src/components/GrownUpGate.tsx');
  assert.match(gateSrc, /reason\.worth \? \[`Bought as single packs, this would cost \$\{reason\.worth\}\.`\]/);
  // The kid-facing step before the answer never names a price or a worth.
  assert.match(gateSrc, /case 'money':\s*case 'renews': return \{ head: 'This costs real money\.', line: 'A grown-up sees the details next\.'/);
  const supplies = read('src/services/money/supplies.ts');
  assert.match(supplies, /gateReasonFor\(product, state\.prices\[product\.product_id\], grownUpWorth\(product, catalog, state\.prices\)\)/);
});

test('timed finds on the map count down in calm gold, never red', () => {
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(marker, /timerBadgeUrgent: \{ backgroundColor: BRAND\.gold, borderColor: BRAND\.goldLip \}/);
  assert.match(marker, /timerTextUrgent: \{ color: BRAND\.navy \}/);
  assert.doesNotMatch(marker, /timer\w*: \{[^}]*BRAND\.red/);
  const ring = loadTs('src/screens/ExploreScreen/mapMarkerPresentation.ts');
  assert.notEqual(ring.RING.urgent.toLowerCase(), '#ef4a3c');
  for (const file of ['Redeemable', 'Key', 'Coin']) {
    const src = read(`src/screens/ExploreScreen/${file}.tsx`);
    const chip = src.slice(src.indexOf('<TagSlot'), src.indexOf('</TagSlot>'));
    assert.doesNotMatch(chip, /themeColor|#ef4a3c|BRAND\.red|'red'/, `${file} timer chip`);
  }
});

test('Trivia Duel\'s Final is a no-risk bonus on screen: no chips, no bet copy, both sides wear x2', () => {
  const ui = read('src/games/trivia-duel/TriviaDuel.tsx');
  const overlays = read('src/games/trivia-duel/ui/Overlays.tsx');
  assert.doesNotMatch(ui, /WagerChips|'wager'|Place your bet|pickWager|lockWager/);
  assert.doesNotMatch(overlays, /WagerChips|BET ON|`bet \$\{|ALL IN|'no risk'/);
  assert.match(ui, /stamp\('DOUBLE POINTS', C\.gold/);
  assert.match(ui, /setStakes\(\{ me: `x\$\{FINAL_BONUS\.multiplier\}`, opp: isRide \? null : `x\$\{FINAL_BONUS\.multiplier\}` \}\)/);
  assert.match(ui, /phase === 'bonus' \? `Bonus question: \$\{finalTopic\}\. Double points!`/);
  const rail = read('src/games/trivia-duel/ui/Rail.tsx');
  assert.match(rail, /stakeText: \{ fontFamily: 'Shark', fontSize: 13, color: C\.ink \}/);
});

test('LinePlay Welcome tip never promises Ride Parts when the wait card says "No Parts at this ride"', () => {
  const { loadTs: loadModule } = require('./helpers/ts-module.cjs');
  const labels = loadModule('src/services/lineplay/labels.ts');
  const preview = loadModule('src/screens/LinePlay/components/waitscreen/waitScreenPreview.ts', { react: { useEffect() {}, useState: v => [v, () => {}] } });
  const cases = [
    [{ tracking: true, unavailable: false, ready: true }, 'on'],
    [{ tracking: false, unavailable: false, ready: false }, 'none'],
    [{ tracking: false, unavailable: true, ready: true }, 'none'],
    [{ tracking: false, unavailable: false, ready: undefined }, 'unknown'],
  ];
  for (const [rewards, want] of cases) {
    const state = preview.linePartsState(rewards);
    assert.equal(state, want);
    // The card's own no-Parts test (WaitCard noPartsHere, not completed).
    const cardSaysNoParts = !rewards.tracking && (rewards.ready === false || rewards.unavailable);
    // LinePlay's first-wait line lives in the wait card now (core loop: one picture line, no floating card).
    const body = labels.LINEPLAY_INTRO_LINE[state];
    if (cardSaysNoParts || state !== 'on') assert.doesNotMatch(body, /Ride Parts|powers this coin/, JSON.stringify(rewards));
  }
  assert.match(labels.LINEPLAY_INTRO_LINE.on, /powers this coin/);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /LINEPLAY_INTRO_LINE\[linePartsState\(rewards\)\]/);
  assert.doesNotMatch(screen, /<OneTimeTip id="lineplay_intro"/);
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /const noPartsHere = !completed && !rewardTrackingAvailable && \(lineRewardsReady === false \|\| rewardUnavailable\);/);
});

test('arcade NEW means something: only games never played on this account, two tiles at most, none while loading', () => {
  const { loadTs: loadModule } = require('./helpers/ts-module.cjs');
  const store = new Map();
  const m = loadModule('src/services/lineplay/playedGames.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async k => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } } } });
  const six = ['memory', 'whack', 'trivia', 'sharky', 'current', 'banana'].map(gameId => ({ gameId }));
  assert.deepEqual(m.arcadeNewFlags(six, new Set()), [true, true, false, false, false, false], 'a fresh account: two NEW, not six');
  assert.deepEqual(m.arcadeNewFlags(six, null), [false, false, false, false, false, false], 'still loading: no NEW flash');
  assert.deepEqual(m.arcadeNewFlags(six, new Set(['memory', 'trivia'])), [false, true, false, true, false, false]);
  assert.deepEqual(m.arcadeNewFlags([{ gameId: 'memory', bestStars: 2 }, { gameId: 'whack' }], new Set()), [false, true], 'played this wait: never NEW');
  assert.equal(m.MAX_NEW_TILES, 2);
  const sheet = read('src/screens/LinePlay/components/QueueArcadeSheet.tsx');
  assert.match(sheet, /\{showNew && choice\.isNew && choice\.bestStars == null && <View style=\{styles\.newPill\}>/);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /const arcadeNew = arcadeNewFlags\(arcadeBase, playedEver\);/);
  assert.match(screen, /void notePlayedGames\(player\.id, playedThisWait\.split\(','\)\)/);
  return (async () => {
    const after = await m.notePlayedGames(24, ['memory']);
    assert.ok(after.has('memory'));
    assert.ok((await m.loadPlayedGames(24)).has('memory'));
  })();
});

test('the nudge says one short thing a non-reader can follow: "Tap Play!" with the play picture', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /\{ icon: 'play', title: 'Next story is ready!', body: 'Tap Play!' \}/);
  assert.doesNotMatch(screen, /Swipe or tap Play/);
});

test('resume 3 2 1 is an even beat: the 1\'s own step is shortened by the measured hand-off', () => {
  const { loadTs: loadModule } = require('./helpers/ts-module.cjs');
  const rc = loadModule('src/screens/LinePlay/components/ResumeCountdown.tsx', {
    react: { useCallback: f => f, useEffect() {}, useRef: v => ({ current: v }) },
    'react-native': { Pressable: 'Pressable', StyleSheet: { create: x => x, absoluteFillObject: {} }, Text: 'Text', View: 'View' },
    'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; }, Fragment: 'Fragment' },
    'react-native-reanimated': { __esModule: true, default: { View: 'View', Text: 'Text' }, FadeOut: { duration: () => ({}) }, runOnJS: f => f,
      useAnimatedStyle: f => f, useFrameCallback: () => ({ setActive() {} }), useSharedValue: v => ({ value: v }), withDelay: (_, x) => x, withTiming: x => x },
    'expo-haptics': { selectionAsync: async () => undefined },
    '../../../hooks/useReducedGameMotion': { __esModule: true, default: () => false },
    '../../../gamekit/SFX': { playSfx() {} },
    '../../../ui': { BRAND: {} },
  });
  const STEP = 380;
  for (const handoff of [120, 200, 280, 310, 360]) {
    const share = rc.oneShare(handoff);
    const oneOnScreen = share * STEP + handoff + 70;
    if (share > 0.15) assert.ok(Math.abs(oneOnScreen - STEP) / STEP <= 0.15, `handoff ${handoff}: the 1 is up ${oneOnScreen} vs ${STEP}`);
  }
  // The estimate follows what this phone really takes, smoothed, outliers clamped.
  let est = 280;
  for (let i = 0; i < 6; i++) est = rc.noteHandoff(est, 150);
  assert.ok(Math.abs(est - 150) < 10);
  assert.ok(rc.noteHandoff(280, 5000) <= 0.6 * 280 + 0.4 * 600 + 1);
});

test('iPhone SE pages: the clue choices sit side by side, kid words, and the finale\'s NEW rides on PLAY', () => {
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.match(slot, /<View style=\{short && styles\.clueRow\}>/);
  assert.match(slot, /clueRow: \{ flexDirection: 'row', gap: 6 \}/);
  assert.match(slot, /clueChoiceSide: \{ flex: 1, minHeight: 52,/);
  // Core loop must-fix 3: PLAY comes right under the banner on every phone, and NEW rides on PLAY's corner
  // (no NEW row that could sit half under the fade).
  const game = slot.slice(slot.indexOf('function MiniGameSlot('), slot.indexOf('// -- trivia'));
  assert.ok(game.indexOf('<PlayFirst') < game.indexOf('styles.bestRow'), 'PLAY before the best-stars row');
  assert.ok(game.indexOf('<PlayFirst') < game.indexOf('styles.gamePlaceholder'), 'PLAY before the game blurb');
  assert.match(game, /newTag=\{newGame && bestStars == null && !completed\}/, 'NEW leaves once the game was played');
  const play = slot.slice(slot.indexOf('function PlayFirst('), slot.indexOf('function MiniGameSlot('));
  assert.match(play, /\{newTag && <View pointerEvents="none" style=\{\[styles\.newPill, styles\.newCorner\]\}>/, 'NEW rides on PLAY');
  assert.match(play, /const short = heroSlim\(useContext\(PageHeightContext\)\);/, 'inside the page window: it knows the window is short');
  assert.match(play, /fullWidth=\{!short\} size=\{short \? 'compact' : 'regular'\}/);
  const chapters = read('src/services/lineplay/chapters.ts');
  assert.doesNotMatch(chapters, /inspires your clue/);
});

test('a locked chapter shows why and answers a tap: pale strip, a lock, "Get in line to play", a shake and a buzz', () => {
  const card = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(card, /\{locked \? <Text style=\{\[styles\.playNowHint, styles\.lockedText\]\}>\{LOCKED_LINE\}<\/Text>/);
  assert.match(card, /<GameIcon name=\{locked \? 'lock' : 'play'\}/);
  assert.match(card, /shake\.value = withSequence\(/);
  assert.match(card, /if \(reducedUi\) return;/, 'Reduce Motion: the buzz only');
  assert.doesNotMatch(card, /disabled: locked,/, 'never a dead tap');
});

test('"No ride picked" is a styled card (bright blue, cream card, Finn, a gold button), never plain text on black', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  const block = screen.slice(screen.indexOf('if (!ride) {'), screen.indexOf('// The shared signal selects'));
  assert.match(block, /<SafeScreen style=\{styles\.noRide\}>/);
  assert.match(block, /<LinearGradient colors=\{\['#13a8e9', '#0879ca', '#0768b9'\]\}/, 'bright blue, never a dark page');
  assert.match(block, /teacher-shark\.png/);
  assert.match(block, /<GameButton label="Back to the map" icon="map" fullWidth onPress=\{\(\) => navigation\.goBack\(\)\} \/>/);
  assert.doesNotMatch(block, /No ride picked|styles\.centered|colors\.bgDark/);
});

test('the recap after a short wait never shows a row of zeros: zero tiles drop out, and nothing at all shows a keepsake', () => {
  const src = read('src/screens/LinePlay/components/SessionRecap.tsx');
  const start = src.indexOf('export function recapStats(');
  const body = src.slice(start, src.indexOf('\n}\n', start) + 2);
  const ts = require(require('node:path').join(root, 'node_modules/typescript'));
  const js = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  const { recapStats } = mod.exports;
  const zero = { activityCount: 0, earnedEnergy: 0, experience: 0, partsCount: 0, ticketsEarned: 0, rewardsConfirmed: true };
  assert.deepEqual(recapStats(zero), [], 'all zeros: no tiles at all (the keepsake card shows)');
  const some = recapStats({ ...zero, activityCount: 2, experience: 15 });
  assert.deepEqual(some.map(t => t.key), ['activities', 'xp']);
  for (const t of recapStats({ ...zero, activityCount: 1, earnedEnergy: 5, partsCount: 1, ticketsEarned: 1 })) assert.ok(t.value > 0);
  assert.match(src, /\{earnedAny \? <View style=\{styles\.recapStats\}>/);
  assert.match(src, /<Text style=\{styles\.keepsakeTitle\}>Wait saved!<\/Text>/);
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.doesNotMatch(card, /'game plan' : 'posted wait'\} \$\{postedWaitMinutes\}m · details/, 'no "Session 1:21 · game plan 20m · details" jargon');
});

test('a finished wait at a ride with no Parts never shows an empty ring and a "0" gem', () => {
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /\{!rewardTrackingAvailable \? <View style=\{styles\.noPartsWell\}[^>]*>\n\s*<GameIcon name="line" size=\{54\} \/>/);
});
