const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/motion-language.test.cjs
// One motion language for the big moments (ride-coin reveal, coin level-up, Set Complete, chest, box).

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/ui/motion.ts');

const KINDS = ['coinReveal', 'coinRepeat', 'levelUp', 'setComplete', 'chest', 'box', 'chaser'];

test('every big moment bursts inside 1.5 s and settles inside 2.6 s (no gray waits)', () => {
  for (const kind of KINDS) {
    const b = motion.momentBeats(kind, { reduced: false });
    assert.ok(b.burstAt > 0 && b.burstAt <= 1500, `${kind} burst at ${b.burstAt}`);
    assert.ok(b.anticipation > 0, `${kind} has anticipation`);
    assert.equal(b.burstAt, b.anticipation + motion.DURATION.hitStop, `${kind} hit-stop sits between anticipation and burst`);
    assert.ok(b.labelAt > b.burstAt && b.labelAt < b.settledAt, `${kind} label stamps after the burst`);
    assert.ok(b.settledAt <= 2600, `${kind} settles at ${b.settledAt}`);
    assert.equal(b.fx, true);
  }
  assert.ok(motion.momentBeats('levelUp', { reduced: false }).anticipation <= 1200, 'the level-up charge is capped at 1.2 s');
});

test('Reduce Motion: no anticipation, no fx, the payoff is there at once', () => {
  for (const kind of KINDS) {
    const b = motion.momentBeats(kind, { reduced: true });
    assert.equal(b.burstAt, 0);
    assert.equal(b.anticipation, 0);
    assert.equal(b.labelAt, 0);
    assert.equal(b.fx, false);
  }
});

test('particles respect the power budget and are capped', () => {
  const full = { particleScale: 1, animate: true };
  const calm = { particleScale: 0.5, animate: true };
  const asleep = { particleScale: 0, animate: false };
  assert.equal(motion.momentParticles(motion.PARTICLES.sparkles, full, false), 12);
  assert.equal(motion.momentParticles(motion.PARTICLES.sparkles, calm, false), 6, 'Battery Saver halves sparkles');
  assert.equal(motion.momentParticles(motion.PARTICLES.sparkles, asleep, false), 0, 'nothing in the background');
  assert.equal(motion.momentParticles(motion.PARTICLES.sparkles, full, true), 0, 'nothing with Reduce Motion');
  assert.equal(motion.momentParticles(1, calm, false), 1, 'a requested burst never drops to zero in the foreground');
  assert.ok(motion.momentParticles(500, full, false) <= motion.PARTICLES.sparkles * 3, 'hard cap');
});

test('the slow gold rays turn only while ambient loops may run', () => {
  assert.equal(motion.raysMayTurn({ ambient: true, animate: true }, false), true);
  assert.equal(motion.raysMayTurn({ ambient: false, animate: true }, false), false, 'idle or Battery Saver idle');
  assert.equal(motion.raysMayTurn({ ambient: true, animate: false }, false), false, 'background');
  assert.equal(motion.raysMayTurn({ ambient: true, animate: true }, true), false, 'Reduce Motion');
});

test('the burst flash is capped and off with Dim Flashing Lights or Reduce Motion', () => {
  assert.equal(motion.FLASH_MAX_OPACITY, 0.4);
  assert.equal(motion.flashPeak(false, false), 0.4);
  assert.equal(motion.flashPeak(true, false), 0);
  assert.equal(motion.flashPeak(false, true), 0);
});

test('the level-up charge bar is never stuck and never fake-complete', () => {
  assert.equal(motion.chargeFill(0, 1000), 0);
  assert.ok(Math.abs(motion.chargeFill(1000, 1000) - 0.85) < 1e-9, 'the charge ends at 85 percent');
  let last = 0;
  for (let t = 0; t <= 12000; t += 250) {
    const v = motion.chargeFill(t, 1000);
    assert.ok(v >= last, 'only moves forward');
    assert.ok(v < 1, 'never full before the server says yes');
    last = v;
  }
  assert.ok(motion.chargeFill(6000, 1000) > 0.9, 'still creeping while a slow server answers');
});

test('springs and curves are shared values, not one-offs', () => {
  for (const key of ['pop', 'stamp', 'settle', 'land']) {
    const spring = motion.SPRING[key];
    assert.ok(spring.damping > 0 && spring.stiffness > 0, key);
  }
  for (const key of ['out', 'in', 'inOut', 'charge']) assert.equal(motion.BEZIER[key].length, 4, key);
  assert.ok(motion.DURATION.exit < motion.DURATION.enter, 'exits are faster than entrances');
});

test('the big moments draw their gold from the shared GoldBurst and timings from motion.ts', () => {
  const files = {
    'src/components/CoinCatchReveal.tsx': ['GoldBurst', 'SparkleBurst', 'ShineSweep', "momentBeats('coinReveal'", 'flashPeak('],
    'src/components/CoinLevelingModal.tsx': ['GoldBurst', 'SparkleBurst', 'ShineSweep', 'chargeStyle', 'Almost there!'],
    'src/screens/StoreScreen/SetCompleteReveal.tsx': ['GoldBurst', 'SparkleBurst', "momentBeats('setComplete'", 'MEDAL'],
    'src/components/DailyGiftModal.tsx': ['GoldBurst', 'SPRING.pop'],
  };
  for (const [file, needles] of Object.entries(files)) {
    const src = read(file);
    for (const needle of needles) assert.ok(src.includes(needle), `${file} uses ${needle}`);
  }
  // The old flat gray ray sticks and the invisible charge bar are gone.
  assert.ok(!read('src/components/CoinCatchReveal.tsx').includes("rgba(255, 244, 176, 0.5)"), 'no flat gray rays');
  assert.ok(!read('src/components/CoinLevelingModal.tsx').includes("backgroundColor: 'rgba(255,255,255,0.1)'"), 'no invisible track');
  assert.ok(!read('src/components/CoinLevelingModal.tsx').includes('iterations: 20'), 'the shake no longer outlasts the charge');
});

test('GoldBurst is cheap: images only, no SVG, no layout callbacks, rays rest when not allowed', () => {
  const src = read('src/ui/GoldBurst.tsx');
  assert.ok(!src.includes('react-native-svg'), 'no SVG (reanimated 3.16.7 + RNSVG onLayout crash)');
  assert.ok(!/onLayout/.test(src), 'no layout callbacks');
  assert.ok(src.includes('raysMayTurn(budget, reduced)'), 'the turn follows the power budget');
  assert.ok(src.includes('cancelAnimation(turn)'), 'the turn stops when not allowed and on unmount');
});

test('GoldBurst turns nothing while the gold is invisible (closed chest, setup frames)', () => {
  const src = read('src/ui/GoldBurst.tsx');
  assert.ok(motion.RAY_TURN_FROM > 0 && motion.RAY_TURN_FROM <= 0.1, 'a small visibility threshold');
  assert.ok(src.includes('useAnimatedReaction('), 'watched on the UI thread');
  assert.ok(src.includes('amount.value > RAY_TURN_FROM'), 'the turn waits for the gold to show');
  // No mount-time endless loop: withRepeat lives only inside the reaction.
  const effectStart = src.indexOf('useEffect(');
  const effectBody = src.slice(effectStart, src.indexOf(';', src.indexOf('[turn]', effectStart)));
  assert.ok(!effectBody.includes('withRepeat'), 'the mount effect only cancels');
});

test('GoldBurst draws one fan with a soft falloff (no counter-rotating second fan, no moire)', () => {
  const src = read('src/ui/GoldBurst.tsx');
  assert.ok(src.includes('rays-gold-fade.webp'), 'the faded fan');
  assert.ok(!src.includes('rays-tint.webp') && !src.includes('rays-tint-18.webp'), 'no hard-edged fans');
  assert.ok(!/softRaysStyle|9 - turn\.value/.test(src), 'no second fan turning the other way');
  assert.ok(fs.existsSync(path.join(root, 'assets/images/reveal/rays-gold-fade.webp')), 'asset ships with the bundle');
});

test('every big-moment and reward file speaks the shared motion language', () => {
  const files = [
    'src/components/CoinCatchReveal.tsx', 'src/components/CoinLevelingModal.tsx', 'src/components/DailyGiftModal.tsx',
    'src/screens/StoreScreen/SetCompleteReveal.tsx', 'src/screens/pins/BoxReveal.tsx', 'src/components/PostWinRewardsModal.tsx',
    'src/gamekit/results/ResultsCard.tsx', 'src/screens/StoreScreen/TryOnSheet.tsx', 'src/screens/StoreScreen/ShopTile.tsx',
  ];
  for (const file of files) {
    const src = read(file);
    assert.ok(/from '(\.\.\/)+ui\/motion(Easing)?'/.test(src), `${file} imports ui/motion`);
  }
  // Gold moments use the shared gold, not a one-off starburst.
  assert.ok(read('src/components/PostWinRewardsModal.tsx').includes('<GoldBurst'), 'the Coin Caught card glows the same gold');
  assert.ok(!read('src/components/PostWinRewardsModal.tsx').includes('duration: 14000'), 'no private ray spin');
});

test('Set Complete: pieces snap on before the bloom, and the XP counts on the UI thread', () => {
  const beats = motion.momentBeats('setComplete', { reduced: false });
  const snaps = motion.pieceSnapTimes(4, beats);
  assert.equal(snaps.length, 4);
  for (let i = 1; i < snaps.length; i += 1) assert.ok(snaps[i] > snaps[i - 1], 'one at a time');
  assert.ok(snaps[snaps.length - 1] < beats.burstAt, 'the last piece lands before the burst');
  assert.ok(snaps[0] >= 200, 'after the stage pops');
  assert.equal(motion.pieceSnapTimes(12, beats).length, 6, 'capped');
  assert.equal(motion.pieceSnapTimes(3, motion.momentBeats('setComplete', { reduced: true })).length, 0, 'Reduce Motion: all at once');
  const src = read('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.ok(src.includes('useAnimatedProps') && src.includes('XpCount'), 'count on the UI thread');
  assert.ok(!src.includes('setXpShown'), 'no setState per count step');
  assert.ok(src.includes('Math.max(1, Math.round(shown.value))'), 'never +0 XP');
});

test('the chaser escalates past the Golden Box', () => {
  const chaser = motion.momentBeats('chaser', { reduced: false });
  const box = motion.momentBeats('box', { reduced: false });
  assert.ok(chaser.anticipation > box.anticipation, 'a longer build');
  const rattles = motion.chaserRattles(chaser);
  assert.equal(rattles.length, 3, 'three rattles');
  assert.ok(rattles[2].deg > rattles[0].deg, 'each one stronger');
  assert.ok(rattles[2].at < chaser.anticipation, 'inside the build');
  const src = read('src/screens/pins/BoxReveal.tsx');
  assert.ok(src.includes('sparkle2'), 'a second sparkle wave');
  assert.ok(src.includes('stampFlash'), 'the serial gets its own hit-stop flash');
  assert.ok(src.includes('chaserRim'), 'a gold rim marks the gold edition');
  assert.ok(src.includes('<RadialFlash flash={flash}'), 'the box flash pops on the box');
  assert.ok(!/StyleSheet\.absoluteFill, styles\.flash/.test(src), 'no full-screen white wash');
});

test('daily chest: the wallet changes only when the coins land, and the old glow is gone', () => {
  const src = read('src/components/DailyGiftModal.tsx');
  const confirmAt = src.indexOf('acknowledgedGift.current = confirmed;');
  const afterConfirm = src.slice(confirmAt, confirmAt + 220);
  assert.ok(!/\n\s*void refreshPlayer\?\.\(\);\n/.test(afterConfirm), 'no wallet refresh at the lid pop');
  assert.ok(src.includes('settleWallet()'), 'refresh after the coins land');
  assert.ok(src.includes('<WalletCoin'), 'coins fly to the wallet');
  assert.ok(!src.includes('styles.glow'), 'the old glow View is gone');
  assert.ok(src.includes('withTiming(0.85, { duration: 40 })'), 'a visible squash with a held beat');
});

test('the level-up payoff is bigger than the card and the tier is unmistakable', () => {
  const src = read('src/components/CoinLevelingModal.tsx');
  assert.ok(src.includes('measureAnchor()'), 'the burst is anchored on the coin');
  assert.ok(src.includes('zIndex: 30') && src.includes('<SparkleBurst progress={sparkle} radius={SCREEN_W * 0.46}'), 'sparkles fly over the card edges');
  assert.ok(src.includes("toValue: 1.35"), 'the new coin pops to 1.35x');
  assert.ok(src.includes('<TierRim'), 'a tier-coloured rim');
  assert.ok(src.includes('SLOW_SERVER_LABEL_MS'), 'Almost there! comes in time for a slow server');
  assert.ok(src.includes('slow.value = uiDelay(SLOW_SERVER_LABEL_MS'), 'the label swaps on the UI thread, even with a busy JS thread');
  assert.ok(motion.SLOW_SERVER_LABEL_MS < 2000 && motion.SLOW_SERVER_LABEL_MS > 900, 'after the charge, before 2 s');
});

test('Set Complete never shows an empty plinth', () => {
  const src = read('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.ok(src.includes("?? previewLook(player?.inventory, [], 'player')"), 'falls back to the player look');
  assert.ok(src.includes('<Image source={MEDAL}'), 'then to the gold crown medal');
});
