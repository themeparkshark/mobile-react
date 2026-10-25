const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/wow-ui-w5.test.cjs
// wow-ui wave 5: the wallet number rolls as one geared odometer, so every frame of a roll reads as a
// number between the old and the new value (690 to 715 never shows 603), and rapid gains merge.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');
const easing = { ...motion, EASE: { out: 1, in: 1, inOut: 1, charge: 1 } };
const rn = { View: 'View', Text: 'Text', StyleSheet: { create: v => v, absoluteFill: {}, flatten: v => v || {} } };
const reanimated = { __esModule: true, default: { View: 'AnimatedView', Text: 'AnimatedText' } };
const rolling = loadTs('src/ui/RollingNumber.tsx', {
  react: { memo: c => c, useRef: v => ({ current: v }), useEffect() {}, useState: v => [v, () => {}] }, 'react/jsx-runtime': {},
  'react-native': rn, 'react-native-reanimated': reanimated, '../gamekit/Haptics': { queueHaptic() {} }, './motionEasing': easing,
  './useUiReducedMotion': {},
});
const { wheelColumns, wheelPos, wheelOpacity, readWheels, defaultFormat, positionalFormat } = rolling;
const easeOut = t => 1 - Math.pow(1 - t, 3);

function frames(from, to, format = defaultFormat, steps = 600) {
  const cols = wheelColumns(format(Math.max(from, to)), format(to), from, to);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const v = from + (to - from) * easeOut(i / steps);
    out.push({ v, floor: readWheels(v, cols, 'floor'), round: readWheels(v, cols, 'round') });
  }
  return { cols, out };
}

test('rolling number: every frame of a roll reads between the old and the new value (no 603 on the way to 715)', () => {
  const pairs = [[690, 715], [715, 690], [375, 855], [855, 715], [999, 1024], [1024, 999], [1000, 990], [0, 25], [99, 100],
    [100, 99], [1990, 2010], [350, 1350], [12345, 12999], [9, 10], [5, 5000], [4999, 5001], [690, 691]];
  for (const [from, to] of pairs) {
    const lo = Math.min(from, to); const hi = Math.max(from, to);
    const { out } = frames(from, to);
    let last = null;
    for (const f of out) {
      assert.ok(f.floor >= lo && f.floor <= hi, `${from} to ${to}: frame at ${f.v.toFixed(3)} reads ${f.floor} (digit leaving)`);
      assert.ok(f.round >= lo && f.round <= hi, `${from} to ${to}: frame at ${f.v.toFixed(3)} reads ${f.round} (digit mostly showing)`);
      if (last !== null) assert.ok(to >= from ? f.floor >= last : f.floor <= last, `${from} to ${to}: never moves against the change`);
      last = f.floor;
    }
    assert.equal(out[0].floor, from, `${from} to ${to}: starts on the old number`);
    assert.equal(out[out.length - 1].floor, to, `${from} to ${to}: lands on the new number`);
  }
});

test('rolling number: the wheels are geared, a left wheel moves only with the ones wheel as it turns 9 to 0', () => {
  assert.equal(wheelPos(695, 10), 9, 'tens holds 9 while the ones still count');
  assert.equal(wheelPos(699.3, 10), 9, 'and through the ones wheel hold');
  const ones = wheelPos(699.8, 1) - 9; const tens = wheelPos(699.8, 10) - 9; const hundreds = wheelPos(699.8, 100) - 6;
  assert.ok(ones > 0 && Math.abs(ones - tens) < 1e-9 && Math.abs(ones - hundreds) < 1e-9, 'carried wheels slide on the same frame as the ones');
  assert.equal(wheelPos(700, 100), 7);
  assert.equal(wheelPos(700, 10), 0);
  assert.equal(wheelPos(703.4, 10), 0, 'no wobble away from a carry');
  assert.equal(wheelOpacity(990, 1000), 0, 'a leading wheel is blank below its place');
  assert.equal(wheelOpacity(1000, 1000), 1);
  assert.equal(wheelOpacity(999.5, 1000), 0, 'still blank while the ones hold');
  assert.ok(wheelOpacity(999.8, 1000) > 0 && wheelOpacity(999.8, 1000) < 1, 'it fades in as the 1 turns up');
});

test('rolling number: the wheels for a roll are the longer number, commas follow their digit, turning wheels are marked', () => {
  const cols = JSON.parse(JSON.stringify(wheelColumns('999', '1,024', 999, 1024)));
  assert.deepEqual(cols.map(c => c.char).join(''), '1,024');
  assert.deepEqual(cols.map(c => c.place), [1000, 1000, 100, 10, 1]);
  assert.equal(cols[1].kind, 'sep');
  assert.ok(cols.filter(c => c.kind === 'digit').every(c => c.turns));
  const down = wheelColumns('1,000', '990', 1000, 990);
  assert.equal(down.length, 5, 'a roll down keeps the comma column until it lands');
  const small = JSON.parse(JSON.stringify(wheelColumns('690', '691', 690, 691)));
  assert.deepEqual(small.map(c => c.turns), [false, false, true], 'only the wheels that move are sized for any digit');
});

test('rolling number: only whole-number formats roll; 12.4K changes in place', () => {
  assert.equal(positionalFormat(defaultFormat, [690, 1024]), true);
  const shorten = n => (n >= 10000 ? `${Math.floor(n / 100) / 10}K` : String(n));
  assert.equal(positionalFormat(shorten, [12400, 12500]), false);
  assert.equal(positionalFormat(defaultFormat, [-5, 3]), false);
});

test('rolling number: one shared value drives every wheel on the UI thread; no JS timers, a change mid-roll carries on', () => {
  const src = read('src/ui/RollingNumber.tsx');
  assert.doesNotMatch(src, /setTimeout/, 'landing, bump and glow are timed on the UI thread');
  assert.doesNotMatch(src, /planRoll/, 'no per-column plan (that is what showed 603)');
  assert.match(src, /v\.value = withDelay\(delay, withTiming\(to, \{ duration: COUNT\.ms, easing: EASE\.out \}/);
  assert.match(src, /const from = roll\.current \? Math\.round\(v\.value\) : previous\.current!;/, 'a change mid-roll rolls on from where the wheels are');
  assert.match(src, /wheelPos\(v\.value, place\)/);
});

test('dive: the water never opens onto a loading card; it swims until the first round is on screen', () => {
  const dive = read('src/fx/DiveIris.tsx');
  assert.match(dive, /readyPatienceMs: 2500,/);
  assert.doesNotMatch(dive, /layoutCapMs/);
  const laidOut = dive.slice(dive.indexOf('const onLaidOut = () => {'), dive.indexOf('const onLanded = () => {'));
  assert.doesNotMatch(laidOut, /setHolding\(false\)/, 'the water stays up (and keeps taking taps) while it waits');
  assert.match(dive, /if \(decided && !\(capped && !landed\) && open\.value === 0\) openNow\(DIVE\.drawMs\);/,
    'a tap never skips the wait for the first round');
  assert.match(dive, /withTiming\(DIVE\.drift\.to, \{ duration: DIVE\.drift\.ms \* devSlow\(\)/, 'the shark keeps swimming while it waits');
  const lp = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.doesNotMatch(lp, /A ride story is surfacing|Your games will open here/, 'no text-only loading card');
  assert.doesNotMatch(lp, /DIVE_READY_CAP_MS/);
});

test('dialog close: the card shrinks to 0.92 and stays solid, the backdrop leaves last; no JS stamp timer', () => {
  const src = read('src/ui/GameDialog.tsx');
  assert.match(src, /const CARD_EXIT = 0\.92;/);
  assert.match(src, /export const DIALOG_CLOSE = \{ cardMs: 140, scrimDelayMs: 60, scrimMs: 170 \} as const;/);
  const { closeOpacity } = { closeOpacity: e => 1 - e * e * e * e };
  assert.match(src, /return 1 - e \* e \* e \* e;/);
  assert.ok(closeOpacity(0.5) > 0.9 && closeOpacity(0.75) > 0.65, 'solid for most of the shrink');
  assert.match(src, /opacity: fade\.value \* closeOpacity\(exit\.value\)/);
  const close = src.slice(src.indexOf('const close = (index: number | null) => {'), src.indexOf('useEffect(() => {\n    if (!visible && mounted'));
  assert.match(close, /scrim\.value = withDelay\(DIALOG_CLOSE\.scrimDelayMs, withTiming\(0, \{ duration: DIALOG_CLOSE\.scrimMs, easing: EASE\.in \}, done => \{\n\s+if \(done\) runOnJS\(finish\)\(\);/,
    'the modal unmounts only after the backdrop has left');
  assert.doesNotMatch(src, /setTimeout/, 'no JS timers gate what the kid sees');
});

test('store fill: the Shop Pick hero lands first, then row by row, spread over 450 to 600 ms, no orphan cell ahead', () => {
  const stagger = loadTs('src/ui/stagger.ts', { 'react-native-reanimated': { Easing: { bezierFn: () => t => t }, FadeInDown: {} }, './motion': motion });
  const G = stagger.GRID_STAGGER;
  const starts = Array.from({ length: G.maxItems }, (_, i) => stagger.gridDelay(i, G.heroLeadMs));
  assert.ok(starts[0] >= G.heroLeadMs, 'the grid waits for the hero');
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] > starts[i - 1], 'row by row, left to right');
  const last = starts[starts.length - 1];
  assert.ok(last >= 450 && last <= 600, `the fill reads over about half a second (last start ${last} ms)`);
  assert.ok(typeof stagger.heroRiseIn() === 'function');
  assert.equal(stagger.heroRiseIn({ reduced: true }), undefined);
  const shelf = read('src/screens/StoreScreen/GearShelf.tsx');
  assert.match(shelf, /entering=\{still \? undefined : heroRiseIn\(\)\}/);
  assert.match(shelf, /FadeIn\.delay\(GRID_STAGGER\.capMs\)/, 'a cell past the first screenful waits for the fill');
});

test('rare compass pick: inked gold stars in two low fans along the footer, a new layout each rare pick', () => {
  const fm = loadTs('src/components/footerMotion.ts', {
    'react-native-reanimated': { makeMutable: v => ({ value: v }) }, '../ui/motionEasing': easing,
  });
  const F = fm.FOOTER_MOTION;
  assert.ok(F.rareFanDeg <= 35, 'the fans stay low (never up over the cards)');
  const lift = Math.sin((F.rareFanDeg * Math.PI) / 180) * F.rareDist[1];
  assert.ok(lift <= 90, `the highest star rises at most about 90 pt (got ${lift.toFixed(0)})`);
  const seeds = new Set([1, 2, 3, 4, 5, 6].map(fm.rareSeed));
  assert.equal(seeds.size, 6, 'six different layouts in a row');
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /function RareFans/);
  assert.equal((wrapper.match(/progress=\{footerMotion\.burstRare\} count=\{half\} x=\{size \/ 2\} y=\{44\} inked/g) || []).length, 2);
  const burst = read('src/ui/SparkleBurst.tsx');
  assert.match(burst, /backgroundColor: BRAND\.goldLip/, 'the ink outline is the house dark gold');
  assert.match(burst, /const fill = FILL\[inked \? 'gold' : color\];/, 'inked stars are all gold, never white');
});

test('rolling number: no re-layout when a roll lands (it re-committed a stale wheel for a frame), except a dropped column', () => {
  const src = read('src/ui/RollingNumber.tsx');
  const landed = src.slice(src.indexOf('const landedJs = '), src.indexOf('const startRoll = '));
  assert.match(landed, /format\(r\.to\)\.length < format\(Math\.max\(r\.from, r\.to\)\)\.length\) \{ roll\.current = null; setSettled/);
  assert.match(src, /const WheelFace = memo\(function WheelFace/, 'the rolling face never re-renders with its sizing');
});

test('rolling number: the strip moves by top (shadow tree), so a React commit elsewhere never shows an older digit', () => {
  const src = read('src/ui/RollingNumber.tsx');
  assert.match(src, /const strip = useAnimatedStyle\(\(\) => \(\{ top: -wheelPos\(v\.value, place\) \* cell/);
  assert.doesNotMatch(src, /translateY: -wheelPos/);
});

test('dive: the crew sheet is decided before the water opens and is already in place, so the open is one change', () => {
  const lp = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(lp, /&& groupPlay\.crewKnown;/);
  assert.ok(lp.indexOf('const groupPlay = useGroupPlay(') < lp.indexOf('const diveReady ='), 'readiness reads the crew');
  const sheet = read('src/screens/LinePlay/group/WhosInLineSheet.tsx');
  assert.doesNotMatch(sheet, /useDiveSettled/);
  assert.match(sheet, /entering=\{still \? undefined : FadeIn\.duration\(180\)\}/);
  assert.match(read('src/screens/LinePlay/group/useGroupPlay.tsx'), /const crewKnown = crew\.loaded;/);
});
