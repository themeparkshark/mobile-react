const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
// Run with: node --test tools/tests/memory-results-layout.test.cjs
// The results card never reflows while a kid reads it, and the front is short.
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'src/games/memory/MemoryResults.tsx'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/games/memory/MemoryGame.tsx'), 'utf8');

test('no section mounts on its step; each is laid out at frame 0 and revealed in place', () => {
  assert.doesNotMatch(src, /\{step >= 2 \? <Headline/);
  assert.doesNotMatch(src, /\{step >= 5 \? <Rewards/);
  assert.doesNotMatch(src, /\{step >= 6 \? \(/);
  assert.match(src, /<Reveal show=\{step >= 5\}><Rewards/);
  assert.match(src, /<Reveal show=\{step >= 6\}>/);
});

test('front: banner, one counting number, crowns, new cards, one button; stats behind STATS', () => {
  assert.match(src, /IconBtn icon="star" label="STATS"/);
  assert.match(src, /panel === 'stats' \?/);
  assert.match(src, /GameAudio\.playLadder\('coin_tick'/);
  assert.doesNotMatch(src, /\{step >= 4 && data\.grades \? <Grades/);
});

test('win scrim is navy, PERFECT gets one capped coin burst, and the shell scrim never flashes first', () => {
  assert.match(src, /colors=\{\['rgba\(4,38,86,0\.08\)', 'rgba\(4,38,86,0\.08\)', 'rgba\(4,38,86,0\.62\)'\]\}/);
  assert.match(src, /export const PERFECT_COINS = 10;/);
  assert.match(src, /<CoinBurst fire \/>/);
  assert.match(game, /resultsScrim=\{resultData \? 'none' : undefined\}/);
});

test('game feel pass: combo ribbon escalates above the awning, bold link arc, compact flame pill, shorter finale sit', () => {
  const booth = fs.readFileSync(path.join(root, 'src/games/memory/MemoryBooth.tsx'), 'utf8');
  assert.match(booth, /peak\.value = reducedMotion \? 1 : 1 \+ Math\.min\(0\.3, level \* 0\.08\)/);
  assert.match(booth, /top: geo\.ribbonY - rh \* 0\.95/);
  assert.match(game, /awning\.current\?\.ribbon\(`COMBO x\$\{chain\}`, chain - 2\)/);
  const fx = fs.readFileSync(path.join(root, 'src/games/memory/BoardFx.tsx'), 'utf8');
  assert.match(fx, /strokeWidth=\{6\} strokeCap="round" color=\{MM\.gold\}/);
  const hud = fs.readFileSync(path.join(root, 'src/games/memory/Hud.tsx'), 'utf8');
  assert.match(hud, /chainCompact: \{ width: undefined, minWidth: 58/);
  const mode = fs.readFileSync(path.join(root, 'src/games/memory/modes/mode.ts'), 'utf8');
  assert.match(mode, /const swap = 320;/);
});

test('combo callouts are paced and always match the flame', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const { comboCall, shouldCallCombo } = loadTs('src/games/memory/comboCallout.ts');
  const none = { at: 0, sweet: false };
  assert.equal(comboCall(2, 10000, none), null);
  assert.equal(comboCall(3, 10000, none), 'show');
  assert.equal(comboCall(4, 10100, { at: 10000, sweet: true }), null, 'SWEET RUN stays readable');
  assert.equal(comboCall(4, 11300, { at: 10000, sweet: true }), 'show');
  assert.equal(comboCall(5, 10500, { at: 10000, sweet: false }), 'retext', 'a rise while up retexts in place');
  assert.equal(comboCall(7, 20000, none), null, 'odd steps from x6 stay quiet when nothing is up');
  assert.equal(comboCall(8, 20000, none), 'show');
  assert.equal(shouldCallCombo(3, 10000, none), true);
  assert.match(game, /awning\.current\?\.retext\(`COMBO x\$\{chain\}`/);
});

test('results: ribbon on the first frame, card rises, visible PERFECT burst, kid words', () => {
  assert.match(src, /useState\(reducedMotion \|\| firstWin \? 99 : 1\)/);
  // Finn's warm-up is a first win: no mastery %, crowns or STATS (Oct 23 first session).
  assert.match(src, /const firstWin = data\.mode === 'warmup' && data\.won;/);
  // STATS is off for every warm-up (hotfix rule), which covers firstWin.
  assert.match(src, /canStats = data\.mode !== 'warmup' &&/);
  assert.match(src, /riseSt, frontSt/);
  assert.match(src, /data\.banner === 'PERFECT!' && !reducedMotion \? <CoinBurst fire \/>/);
  assert.match(src, /'MEMORY'\}/);
  assert.doesNotMatch(src, /EDITION\$\{/);
  assert.match(game, /`\+\$\{xp\} XP`/);
});

test('round 3 timing: the card lands with a hit, the family ribbon slams after the last star, upward burst, results saved while the coin flies', () => {
  assert.match(src, /at\(sched\.banner, \(\) => \{ Haptic\.hitMedium\(\); GameAudio\.play\('fx\.hit'/);
  assert.match(src, /const titleAt = reducedMotion \? 0 : data\.stars > 0 \? \(sched\.crowns\[sched\.crowns\.length - 1\] \?\? 0\) \+ 160 : sched\.headline;/);
  assert.match(src, /<ResultsRibbon title=\{title\} reducedMotion=\{reducedMotion\} delayMs=\{titleAt\} style=\{styles\.ribbon\} \/>/);
  assert.match(src, /const a = Math\.PI \+ \(k \/ \(PERFECT_COINS - 1\)\) \* Math\.PI;/);
  assert.match(game, /later\(420, \(\) => finishRun\(won\)\);/);
});

test('three crowns never read as "not perfect"; both face sheets are preloaded', () => {
  assert.match(game, /banner = 'AMAZING!';\s*crownHint = `Clear it in \$\{perfectOf\(e\)\} turns for PERFECT!`;/);
  assert.match(src, /data\.crownHint \? <Reveal show=\{step >= 3\}>/);
  const card = fs.readFileSync(path.join(root, 'src/games/memory/MemoryCard.tsx'), 'utf8');
  assert.match(card, /if \(preloadExtraSheet != null\) sheets\.push/);
  assert.match(game, /preloadExtraSheet=\{sheetsReady \? undefined : deck\.extraFaceSheet\}/);
});

test('the flame pill hides while the results card is up', () => {
  assert.match(game, /\{resultData \? null : <ChainPlate ref=\{chainPlate\}/);
});

test('faces draw from one shared decoded sheet per board, with a preload fallback until it is ready', () => {
  const card = fs.readFileSync(path.join(root, 'src/games/memory/MemoryCard.tsx'), 'utf8');
  assert.match(game, /const mainSheetImg = useImage\(/);
  assert.match(game, /const extraSheetImg = useImage\(/);
  assert.match(game, /shared=\{sharedSheets\}/);
  assert.match(card, /if \(sharedReady\(shared\) && !failed && \(!known \|\| sharedImg\)\) \{/);
  assert.match(card, /<SkImg image=\{img\} fit="fill"/);
  // The canvas is mounted from the deal on, even before the face is known.
  assert.match(card, /\{img \? \(\s*<Group clip=\{clip\}>/);
  const { loadTs } = require('./helpers/ts-module.cjs');
  const stub = new Proxy({}, { get: () => () => null });
  const m = loadTs('src/games/memory/MemoryCard.tsx', {
    react: { forwardRef: (f) => f, memo: (f) => f, useImperativeHandle() {}, useMemo: (f) => f(), useState: (v) => [v, () => {}] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
    'react-native': { StyleSheet: { create: (s) => s, absoluteFill: {} }, Image: 'Image', Text: 'Text', View: 'View' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AView', createAnimatedComponent: (c) => c }, Easing: stub, cancelAnimation() {}, interpolate: () => 0, useAnimatedProps: () => ({}), useAnimatedStyle: () => ({}), useSharedValue: (v) => ({ value: v }), withDelay: (d, v) => v, withRepeat: (v) => v, withSequence: (...v) => v[0], withSpring: (v) => v, withTiming: (v) => v, makeMutable: (v) => ({ value: v }) },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'C', Ellipse: 'E', Line: 'L', Path: 'P' },
    '@shopify/react-native-skia': { Canvas: 'Canvas', Group: 'Group', Image: 'SkImg', rect: () => ({}), rrect: () => ({}) },
  });
  const A = 1, B = 2;
  const ready = { main: { src: A, img: { id: 'a' } }, extra: { src: B, img: { id: 'b' } } };
  assert.equal(m.sharedReady(ready), true);
  assert.equal(m.sharedReady({ main: { src: A, img: null }, extra: null }), false);
  assert.equal(m.sharedSheetFor(ready, B).id, 'b');
  assert.equal(m.sharedSheetFor(ready, 9), null);
});

test('one results language: Memory\'s end card is the blue family card (ribbon, stars, NEW BEST pill, gold then white DONE)', () => {
  assert.match(src, /export const FAMILY = \{ card: '#0768b9', border: '#ffffff', gold: '#ffcf3b', navy: '#05346e'/);
  assert.match(src, /card: \{\s*width: '90%', maxWidth: 400, backgroundColor: FAMILY\.card, borderRadius: 26, borderWidth: 4, borderColor: FAMILY\.border,/);
  assert.doesNotMatch(src, /results_banner\.png|crown\.png|MM\.cream/, 'no Memory-only banner, crowns or cream card');
  assert.match(src, /<GameIcon name="star" size=\{index === 1 \? 60 : 48\} mono=\{on \? undefined : FAMILY\.starOff\} \/>/);
  assert.match(src, /<Text style=\{styles\.newBestText\}>NEW BEST!<\/Text>/);
  // One exit word: DONE (never CLOSE or an underlined Close link).
  assert.doesNotMatch(src, /'CLOSE'|'Close'|'CONTINUE'|closeText/);
  assert.match(src, /<Text style=\{styles\.bigBtnText\}>DONE<\/Text>/);
  assert.match(src, /<Text style=\{styles\.doneText\}>DONE<\/Text>/);
  // STATS, ALBUM, SHARE, CHALLENGE are white family chips; their panels open on cream so navy words keep contrast.
  assert.match(src, /iconBtn: \{ flex: 1, maxWidth: 110, minHeight: 56, borderRadius: 14, borderWidth: 3, borderColor: FAMILY\.navy, borderBottomWidth: 5, backgroundColor: '#ffffff'/);
  assert.match(src, /panel: \{ alignSelf: 'stretch', alignItems: 'center', marginTop: 8, backgroundColor: FAMILY\.panel/);
  assert.match(src, /cardBack: \{ position: 'absolute', padding: 16, alignItems: 'center', backgroundColor: FAMILY\.panel \}/);
  // New cards keep a readable label on blue (white, foil gold).
  const extras = fs.readFileSync(path.join(root, 'src/games/memory/MemoryExtras.tsx'), 'utf8');
  assert.match(extras, /foil && \{ color: dark \? MM\.goldDeep : MM\.gold \}/);
  assert.doesNotMatch(src, /reducedMotion=\{reducedMotion\} dark startMs/);
});

test('hotfix: the first-session warm-up card has no STATS button for a late tap to open over CLEARED', () => {
  assert.match(src, /const canStats = data\.mode !== 'warmup' && \(/);
});
