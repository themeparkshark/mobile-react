// Results lane, wave 3 round 4: the top-rank Duel row is one centered badge,
// the Best Moment polaroid never lands on the badges, short Duel cards zoom
// the scene (capped), the speed chip leads with bolts, SAFE is a lock, the
// shared card matches Sharky / Duel / Boss (buttons inside, gold score, the
// shark on its podium), the Boss win is a KO pill, and the suggested Big
// Final chip follows the half-chip miss rule.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('top rank: one centered gold badge with a crown, never a hat, a gap and a crown at the far edges', () => {
  const duel = read('src/games/trivia-duel/ui/DuelResults.tsx');
  assert.match(duel, /model\.rank && model\.won && !model\.rank\.next \? <TopRankRow stripes=\{model\.rank\.stripes \?\? 0\} label=\{model\.rank\.label\}/);
  assert.match(duel, /<View style=\{\[styles\.rankRow, styles\.rankUpRow\]\} accessible accessibilityLabel=\{`\$\{label\}, the top rank`\}>/);
  assert.match(duel, /<RankHat stripes=\{stripes\} big crown \/>/);
  // The old fins row (hat, pips, next hat) only runs when there is a next rank.
  const fins = duel.slice(duel.indexOf(': model.rank && model.won ? ('));
  assert.match(fins.slice(0, 900), /\{model\.rank\.next \? <RankHat/);
});

test('the Best Moment polaroid waits for the badges and drops above the card, never over them', () => {
  const dr = loadTs('src/games/trivia-duel/ui/DuelResults.tsx', {
    '../../../services/external': { openExternal() {} }, react: {}, 'react-native': { StyleSheet: { create: (s) => s } },
    'react-native-reanimated': {}, '../art': { ART: {}, C: {} }, '../../../gamekit/results/ResultsRibbon': {},
    '../../../gamekit/results/ResultsCard': {}, '../../../gamekit/results/feelings': { feelingChips: (s) => s }, '../../../ui/GameIcon': {},
    '../../../gamekit/audio/GameAudio': { GameAudio: {} }, '../../../gamekit/Haptics': { playHaptic() {} },
    'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'F' },
  });
  // No badges: two beats, as before.
  assert.equal(dr.polaroidAt(500, 0, false), 1000);
  // FIN BEATEN + NEW BEST: after the second banner has popped.
  assert.ok(dr.polaroidAt(300, 2, false) >= dr.BANNER_AT + dr.BANNER_GAP + 200);
  // RANK UP: after the new badge has popped (1.1 s + its pop).
  assert.ok(dr.polaroidAt(300, 3, true) >= dr.RANK_UP_AT + 400);
  const duel = read('src/games/trivia-duel/ui/DuelResults.tsx');
  assert.match(duel, /\{ bottom: POL_BOTTOM_PAD \+ cardH \+ POL_GAP \}/);
  assert.doesNotMatch(duel.match(/polaroid: \{[^}]*\}/)[0], /top: 0/);
  // The speed chip leads with bolts: NICE 1, GREAT 2, LIGHTNING 3.
  assert.equal(dr.speedBolts('NICE'), 1);
  assert.equal(dr.speedBolts('GREAT'), 2);
  assert.equal(dr.speedBolts('LIGHTNING!'), 3);
  assert.equal(dr.speedBolts('-'), 0);
  assert.deepEqual(plain(dr.duelChipIconRow('BEST ANSWER', 'GREAT')), { name: 'rush', on: 2, of: 3 });
  assert.equal(dr.duelChipIconRow('RIGHT ANSWERS', '3'), undefined);
  assert.match(duel, /iconRow=\{duelChipIconRow\(c\.label, c\.value\)\}/);
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.match(card, /if \(iconRow\) \{[\s\S]*?<GameIcon key=\{i\} name=\{iconRow\.name\} size=\{i < iconRow\.on \? 26 : 20\}/);
});

test('short Duel cards zoom the dropped scene a little (capped), tall cards never zoom', () => {
  const tk = loadTs('src/games/trivia-duel/engine/takeover.ts');
  const base = { H: 762, stageTop: 78, band: 241, full: 684 };
  assert.equal(tk.takeoverZoom({ ...base, cardH: 470 }), 1, 'a tall win card does not zoom');
  const short = tk.takeoverZoom({ ...base, cardH: 300 });
  assert.ok(short > 1 && short <= tk.TAKEOVER_ZOOM_MAX, `short card zooms, capped (${short})`);
  assert.ok(tk.TAKEOVER_ZOOM_MAX <= 1.2);
  // The zoom grows in with the takeover (the match camera never changes), and the VS intro resets it.
  const stage = read('src/games/trivia-duel/ui/Stage.tsx');
  assert.match(stage, /\{ scale: a\.push\.value \* \(1 \+ a\.takeover\.value \* \(\(zoomSv \? zoomSv\.value : 1\) - 1\)\) \}/);
  const duel = read('src/games/trivia-duel/TriviaDuel.tsx');
  assert.match(duel, /dropSv\.value = DROP_PX;\n\s+zoomSv\.value = 1;/);
  assert.match(duel, /zoomSv\.value = reducedMotion \? z : withTiming\(z,/);
});

test('SAFE on the Big Final board is a lock picture, never KEEP ALL', () => {
  const ov = read('src/games/trivia-duel/ui/Overlays.tsx');
  assert.doesNotMatch(ov, /KEEP ALL/);
  assert.match(ov, /miss === 0 \? <View style=\{styles\.chipSafe\}><GameIcon name="lock" size=\{18\} \/><\/View>/);
});

test('the shared card speaks the family language: buttons inside, gold score with no SCORE word, the shark on its podium', () => {
  const card = read('src/gamekit/results/ResultsCard.tsx');
  assert.doesNotMatch(card, />SCORE</);
  assert.match(card, /score: \{ fontFamily: 'Shark', fontSize: 50, lineHeight: 58, minWidth: 180, color: '#ffcf3b'/);
  assert.match(card, /\{actions \? <View style=\{styles\.actions\}>\{actions\}<\/View> : null\}\n\s+<\/View>\n\s+\);/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /<ResultsPodium cheer=\{stars > 0 \|\| \(!saved && compareBest\(/);
  assert.match(shell, /extras=\{resultExtras \?\? resultsExtra \?\? undefined\}\n\s+extrasBeat=\{resultExtrasBeat\}\n\s+>\n\s+<View style=\{styles\.actions\}>/);
  assert.match(shell, /<\/ResultsCard>\n\s+<\/Animated\.View>/, 'nothing renders under the card: DONE is the last thing');
  assert.match(shell, /sharedStage: \{ justifyContent: 'flex-end'/);
  const podium = loadTs('src/gamekit/results/ResultsPodium.tsx', {
    react: { useEffect() {}, useState: (v) => [v, () => {}] }, 'react-native': { StyleSheet: { create: (s) => s }, Image: 'Image', View: 'View' },
    'react-native-reanimated': {}, 'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'F' },
    '../../assets/games/sharky/tide/shark_cheer.png': 1, '../../assets/games/sharky/tide/shark_swim_side.png': 2, '../../assets/games/sharky/tide/v71/podium.png': 3,
  }, { require: (n) => n });
  assert.equal(podium.podiumScale(60), 0, 'too little room: no squashed shark');
  assert.equal(podium.podiumScale(500), 1);
  assert.ok(podium.podiumScale(120) > 0.4 && podium.podiumScale(120) < 1);
  // A tall card leaves no room: a star run still gets the shark, peeking over the ribbon.
  assert.equal(podium.podiumMode(300, true), 'podium');
  assert.equal(podium.podiumMode(40, true), 'peek');
  assert.equal(podium.podiumMode(40, false), 'none', 'no star and no room: nothing');
  // The peek never climbs into the status bar: an SE with a tall card gets a smaller shark.
  assert.equal(podium.peekScale(60), 0.5);
  assert.ok(podium.peekScale(20) > 0.3 && podium.peekScale(20) < 0.5, 'a little room: a smaller peek');
  assert.ok(podium.peekScale(20) * 160 <= 20 + podium.PEEK_HEADROOM_PT, 'its top stays under the safe top');
  assert.equal(podium.peekScale(0), 0, 'SE with a card that already reaches the top: no peek');
  assert.equal(podium.podiumMode(0, true), 'none');
  const src = read('src/gamekit/results/ResultsPodium.tsx');
  assert.match(src, /withRepeat\(withSequence\([\s\S]*?\), PODIUM_HOPS\)/, 'the hop rests after a few beats');
  assert.match(src, /if \(reducedMotion \|\| k === 0\) return undefined;/);
});

test('the Boss team win is a KO crown pill and the receipt is one short word', () => {
  const bash = read('src/games/boss/bash/BashResults.tsx');
  assert.doesNotMatch(bash, /Boss down!/);
  assert.match(bash, /<View style=\{styles\.koPill\} accessible accessibilityLabel="Boss knocked out">/);
  assert.doesNotMatch(bash, /SAVED FOR THE TEAM!/);
  assert.match(bash, /accessibilityLabel=\{receipt === 'saved' \? 'Saved for the team' : undefined\}/);
});

test('the suggested Big Final chip follows the half-chip miss rule', () => {
  const sc = loadTs('src/games/trivia-duel/engine/scoring.ts');
  // Already won either way: the biggest chip a miss cannot lose (a sure win scores big).
  let s = sc.suggestWager(2000, 300, 1); // GO BIG miss leaves 1000 > 950
  assert.equal(s.index, 2);
  assert.equal(s.kind, 'win');
  assert.equal(s.reason, 'Wins it either way.');
  s = sc.suggestWager(1600, 300, 1); // GO BIG miss 800 < 950; HALF miss 1600 - 400 = 1200 > 950
  assert.equal(s.index, 1);
  // A right answer wins it but a miss could lose: still the smallest locking chip.
  s = sc.suggestWager(1000, 300, 1);
  assert.equal(s.index, 0);
  assert.equal(s.reason, "Wins it if you're right.");
  // Trailing: GO BIG.
  assert.equal(sc.suggestWager(300, 600, 1).index, 2);
  // Every suggestion is a real chip.
  for (const [me, opp] of [[0, 0], [5, 900], [900, 5], [450, 450], [1234, 777]]) {
    const k = sc.suggestWager(me, opp, 1).index;
    assert.ok(k >= 0 && k < sc.wagerStakes(me).length);
  }
});
