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
// Pure helpers and constants out of a .tsx file (loadTs cannot load JSX): the exported function is transpiled alone.
const tsLib = require(path.join(root, 'node_modules/typescript'));
function pureFrom(file, name, scope = {}) {
  const src = read(file);
  const start = src.indexOf(`export function ${name}(`);
  const end = src.indexOf('\n}\n', start) + 2; // a top-level function ends at a closing brace in column 0
  const js = tsLib.transpileModule(src.slice(start, end).replace('export ', ''), { compilerOptions: { target: 'ES2020' } }).outputText;
  return new Function(...Object.keys(scope), `${js}; return ${name};`)(...Object.values(scope));
}
const constFrom = (file, name) => Number((read(file).match(new RegExp(`const ${name} = ([0-9.]+);`)) || [])[1]);


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
  assert.ok(Math.abs(motion.chargeFill(1000, 1000) - motion.CHARGE_REACH) < 1e-9, 'the charge ends at CHARGE_REACH');
  for (let t = 100; t <= 1000; t += 100) {
    assert.ok(motion.chargeFill(t, 1000) - motion.chargeFill(t - 100, 1000) > 0.08, `every 100 ms of the charge is visibly fuller (${t})`);
  }
  let last = 0;
  for (let t = 0; t <= 12000; t += 250) {
    const v = motion.chargeFill(t, 1000);
    assert.ok(v >= last, 'only moves forward');
    assert.ok(v < 1, 'never full before the server says yes');
    last = v;
  }
  assert.ok(motion.chargeFill(6000, 1000) > 0.9, 'still creeping while a slow server answers');
});

test('the photosensitivity cap is one number, local flashes included', () => {
  const burst = read('src/ui/GoldBurst.tsx');
  assert.ok(burst.includes('opacity: Math.min(FLASH_MAX_OPACITY, flash.value)'), 'RadialFlash never passes FLASH_MAX_OPACITY');
  assert.ok(!burst.includes('FLASH_MAX_OPACITY * 2'), 'no doubled local cap');
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
  assert.ok(/tint=\{pull\.is_chaser \? CHASER_GOLD/.test(src), 'the chaser pin itself is gold (its art re-coloured), so "Gold" matches what you see');
  assert.ok(!src.includes('chaserRim'), 'no separate rim to sit off-centre on the art');
  assert.ok(!/rotateY|perspective/.test(src), 'a flat flip: no 3D turn to split the pin against the card');
  assert.ok(/pinBackGold/.test(src) && /pinBack: \{[^}]*borderColor: BRAND\.navy/.test(src), 'the pin back is outlined metal, never a grey disc');
  const pin = read('src/screens/pinTrading/EnamelPin.tsx');
  assert.ok(!/blendMode="color"/.test(pin), 'no flat colour swap that turns the chaser into a plain gold disc');
  assert.ok(!/ColorMatrix/.test(pin), 'no recolour of the art: the chaser keeps its own light-blue enamel');
  assert.ok(/FOIL_EDGE/.test(pin) && /FOIL_LIP/.test(pin) && /colors=\{foilStops\(tint\)\}/.test(pin), 'a polished gold foil rim with a pale inner lip frames the untouched art');
  assert.ok(/<Twinkles radius=\{pinSize \* 0\.58\} on=\{phase === 'show' && !still && ambient\}/.test(src), 'twinkles wink around the chaser only while ambient motion is allowed');
  assert.ok(/p\?\.is_chaser && ambient\s*\n?\s*\? withDelay\(450, withRepeat/.test(src), 'the chaser glint repeats only while ambient motion is allowed');
  assert.ok(!/blendMode="overlay"/.test(pin), 'no faint overlay that leaves the chaser looking blue');
  assert.ok(!/LIMITED \\u00b7 #/.test(src), 'the serial shows twice (stamp and badge), not three times');
  // The serial stamp slams from oversize and never dips below its own size (no underdamped spring through an open interpolate).
  assert.ok(!/stamp\.value = withDelay\(250, withSpring/.test(src), 'no spring on the stamp slam');
  assert.ok(src.includes('[2.4, 1], Extrapolation.CLAMP'), 'the stamp scale is clamped');
  assert.ok(motion.SLAM_SQUASH <= 0.08, 'the impact squash stays under 8 percent');
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
  assert.ok(src.includes('uiTiming(1.35'), 'the new coin pops to 1.35x');
  assert.ok(!/Animated\.(loop|spring|timing)\((shakeAnim|coinScale|successScale)/.test(src), 'the level-up runs on one engine (Reanimated)');
  assert.ok(src.includes('spin={false}'), 'the full-screen fan never keeps turning behind an open card');
  assert.ok(src.includes('estimatedWidth={SUCCESS_CTA_WIDTH}'), 'the Awesome! label is there on the first success frame');
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

test('the coin art runs on one UI-thread clock, so a level change restarts nothing', () => {
  const demo = read('src/components/CoinUpgradeDemo.tsx');
  assert.ok(!/Animated\.loop|new Animated\.Value|useNativeDriver/.test(demo), 'no legacy Animated loops left in the coin art');
  assert.ok(demo.includes('useFrameCallback') && demo.includes('frame.setActive(running)'), 'one frame clock, paused when still');
  assert.ok(demo.includes('const running = animate && !reducedMotion && budget.ambient;'), 'stops with Reduce Motion, animate off, idle or background');
  assert.ok(/on\.value === 0 \|\| local < 0/.test(demo), 'flares and bolts hide while the clock is paused, never frozen mid-flash');
  const burst = read('src/components/coin/LevelUpBurst.tsx');
  assert.ok(burst.includes("from 'react-native-reanimated'") && !burst.includes('useNativeDriver'), 'the burst ring and shards are Reanimated too');
  assert.ok(burst.includes('t.value <= 0 ? 0'), 'shards stay hidden until the burst');
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.ok(modal.includes("{!reducedMotion && (\n                        <>\n                          <View pointerEvents=\"none\" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>\n                            <ShineSweep"), 'the coin sparkles and shine are mounted with the card, before the charge');
  assert.ok(modal.includes("{anchor && !reducedMotion && ("), 'the over-card sparkles and ring are mounted before the charge');
  assert.ok(modal.includes('onLayout={() => { if (!anchor) measureAnchor(); }}'), 'the coin is measured as soon as it lays out');
});

test('the level-up payoff grows with every tier, Legendary clearly the biggest', () => {
  const fields = ['fanPeak', 'fanHold', 'fanScale', 'ringReach', 'ringWidth', 'sparkleWaves', 'sparkles'];
  let prev = null;
  for (let level = 2; level <= 10; level += 1) {
    const p = motion.levelUpPayoff(level);
    if (prev) for (const f of fields) assert.ok(p[f] >= prev[f], `${f} never shrinks at level ${level}`);
    prev = p;
  }
  const silver = motion.levelUpPayoff(2);
  const legendary = motion.levelUpPayoff(5);
  assert.equal(legendary.fanPeak, 1, 'Legendary fan at full strength');
  assert.ok(legendary.fanHold >= 0.8, 'the fan stays lit behind the Legendary card');
  assert.ok(legendary.fanScale >= 2.2 && silver.fanScale <= 1.6, 'Legendary rays reach well past the card, Silver stays close');
  assert.equal(legendary.sparkleWaves, 2, 'a second sparkle wave from Legendary');
  assert.ok(legendary.ringReach > silver.ringReach + 0.3 && legendary.ringWidth > silver.ringWidth, 'a clearly bigger ring than Silver');
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.ok(modal.includes('uiTiming(payoff.fanPeak') && modal.includes('uiTiming(payoff.fanHold'), 'the big fan follows the ladder');
  assert.ok(modal.includes('progress={sparkle2}'), 'the second wave is drawn');
});

test('the level-up card is readable without reading: tier chip first, bonuses as a picture and a number', () => {
  const model = loadTs('src/components/coin/progressionModel.ts');
  assert.deepEqual({ ...model.perkChip({ type: 'gym_points', value: 500, name: 'Gym bonus' }) }, { icon: 'trophy', label: '+500' });
  assert.deepEqual({ ...model.perkChip({ type: 'bonus_parts', value: 3, name: 'Parts' }) }, { icon: 'parts', label: '+3' });
  assert.equal(model.perkChip({ type: 'cosmetic', value: 0, name: 'Gold rim' }).label, 'Gold rim');
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.ok(!modal.includes('New Bonuses Unlocked'), 'no small-caps bonus header');
  assert.ok(modal.indexOf('backgroundColor: coinTier(nextLevel).ring') < modal.lastIndexOf('{nextVisualReward}'), 'the tier chip comes first');
  const tips = read('src/services/help/helpTopics.ts');
  assert.ok(!tips.includes("body: 'There are 10 levels, all the way up to Shark Crown.'"), 'the first level-up tip never contradicts the dot row');
});

test('the daily chest wallet counts up from the balance before the claim', () => {
  const src = read('src/components/DailyGiftModal.tsx');
  assert.ok(src.includes('walletBefore.current = player?.coins ?? null;'), 'captured at the chest tap');
  assert.ok(src.includes('start: Math.max(0, walletBefore.current ?? (player?.coins ?? 0))'), 'the chip starts from it');
});

test('the gold chaser foil: bright to deep gold across the rim, the art itself untouched', () => {
  const { foilStops } = loadTs('src/screens/pinTrading/EnamelPin.tsx', {
    '@shopify/react-native-skia': {}, 'expo-image': {}, react: { memo: (c) => c }, 'react-native': { StyleSheet: { absoluteFill: {} } },
    'react-native-reanimated': {}, './pinImageCache': {}, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'f' },
  });
  const stops = foilStops('#f2b72c');
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  assert.equal(stops.length, 4);
  assert.equal(stops[1], '#f2b72c', 'the tint itself in the middle');
  assert.ok(lum(stops[0]) > lum(stops[1]) && lum(stops[1]) > lum(stops[2]), 'light catches the top-left, the edge goes deep');
  stops.forEach(c => { const n = parseInt(c.slice(1), 16); assert.ok((n >> 16) > (n & 255) + 40, `${c} stays warm gold, never grey`); });
  assert.ok(motion.DURATION.twinkle >= 1800 && motion.DURATION.glintGap >= 1000, 'resting gold moves slowly (no busy flicker)');
});

test('coin reveal backdrop: a pre-softened small copy of the water world under a strong veil, no runtime blur', () => {
  const src = read('src/components/CoinCatchReveal.tsx');
  assert.ok(src.includes("reveal/water-soft.webp"), 'the softened world copy');
  assert.ok(!/blurRadius=/.test(src), 'no runtime blur of a full-size image on the reveal frame');
  const veil = Number((src.match(/const WORLD_VEIL = ([0-9.]+);/) || [])[1]);
  assert.ok(veil >= 0.88 && veil < 1, `props stop reading as shapes, the water tint stays (${veil})`);
  assert.ok(fs.statSync(path.join(root, 'assets/images/reveal/water-soft.webp')).size < 8000, 'tiny asset');
});

test('wave 3: no big moment waits on the network or reflows at its payoff', () => {
  const reveal = read('src/components/CoinCatchReveal.tsx');
  assert.ok(/placeholder=\{GENERIC_COIN\}/.test(reveal), 'a cold coin image shows the house coin from frame 1, then the real art fades in');
  assert.ok(/withTiming\(0\.95, \{ duration: windFor, easing: EASE\.charge \}\)/.test(reveal), 'the pre-burst hold is a visible wind-up');
  const win = read('src/components/PostWinRewardsModal.tsx');
  assert.ok(/Image\.prefetch\(\[taskCoinUrl\], 'memory-disk'\)/.test(win), 'the coin art is warmed while the game is played');
  const modal = read('src/components/CoinLevelingModal.tsx');
  // Wave 3 round 3: the tip sits inside the success content (above the button), in the held height's spare room.
  assert.ok(!/bottom: 18 \}\}>\s*<OneTimeTip id="first_level_up"/.test(modal), 'the first level-up tip no longer floats over the button');
  const tip = read('src/components/help/CoachTip.tsx');
  assert.ok(/okPill: \{[^}]*minHeight: 40/.test(tip), 'OK is a real gold button');
  const demo = read('src/components/CoinUpgradeDemo.tsx');
  const movers = demo.slice(demo.indexOf('function GlowDot'), demo.indexOf('/** A light ray'));
  assert.ok(!/shadowRadius/.test(movers), 'no iOS shadow on any orbiting dot (recomputed every frame)');
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.ok(/<GameIcon name=\{PRIZE\[kind\]\.icon\} size=\{chestSize \* 0\.4\} \/>/.test(chest), 'a non-coin prize climbs out of the chest and stays');
});

test('wave 3: the level-up card says each prize with a picture and a number, in plain words', () => {
  const m = loadTs('src/components/coin/progressionModel.ts');
  const fx = loadTs('src/components/coin/previewFixtures.ts');
  const badges = m.revealBadges(fx.previewUnlocks(6), 80);
  assert.equal(JSON.stringify(badges.map(b => [b.icon, b.label])), JSON.stringify([['xp', '+80'], ['coins', '+100']]));
  assert.equal(m.revealCard(fx.previewUnlocks(5), 60).line, 'More Parts when you play in line', 'no grown-up maths for a kid');
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.ok(/\{state !== 'success' && <View style=\{\{\s*flexDirection: 'row'/.test(modal), 'the success card does not repeat the tier a third time');
});

test('wave 3 round 2: a wind-up grows every frame, bigger and faster', () => {
  const ms = 900;
  const amp = (w0, w1) => { let m = 0; for (let w = w0; w < w1; w += 0.002) m = Math.max(m, Math.abs(motion.windupWobble(w, ms, 1.5, 6))); return m; };
  assert.equal(motion.windupWobble(0, ms), 0, 'still before the charge');
  assert.equal(motion.windupWobble(1, ms), 0, 'still once the burst lands');
  assert.ok(amp(0.85, 0.99) > amp(0.01, 0.15) * 2.5, 'the wobble ends much bigger than it starts');
  const crossings = (w0, w1) => { let n = 0, last = motion.windupWobble(w0 + 0.0005, ms); for (let w = w0 + 0.001; w < w1; w += 0.001) { const v = motion.windupWobble(w, ms); if (Math.sign(v) !== Math.sign(last) && v !== 0) n += 1; last = v; } return n; };
  assert.ok(crossings(0.8, 1) > crossings(0, 0.2) * 1.8, 'and faster');
  const burst = read('src/ui/GoldBurst.tsx');
  assert.ok(burst.includes('export function GatherRings'), 'shared gold rings that close in on a charging prize (for the Wow lanes too)');
});

test('wave 3 round 2: the level-up card never empties, collapses or mounts the next tier on the burst', () => {
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.ok(!/scale: Math\.max\(0, successIn\.value\)/.test(modal), 'the success content is never scaled to nothing on its first frame');
  assert.ok(modal.includes('scale: 0.84 + 0.16 * successIn.value'), 'it stamps in from a little small, already visible');
  assert.ok(modal.includes("<View style={{ alignSelf: 'stretch', height: CTA_HEIGHT, justifyContent: 'center', marginHorizontal: 14, marginBottom: 14 }}>"), 'the charge bar takes the Level Up button\'s own spot');
  assert.equal((modal.match(/<YellowButton/g) || []).length, 2, 'one CTA from Level Up! to Awesome! (never remounted), plus the max-level Nice!');
  assert.ok(modal.includes("(state === 'preview' || state === 'confirm' || state === 'leveling') && !isMaxLevel"), 'the card body stays during the charge');
  assert.ok(!modal.includes('LEVELING STATE'), 'no separate short charging card');
  assert.ok(modal.includes('<OneTimeTip id="coin_card" ready={visible && (state === \'preview\' || state === \'leveling\')} compact instantExit'), 'the card tip leaves at once at the tap (no stray fading pill over the coin)');
  assert.ok(read('src/components/help/CoachTip.tsx').includes('exiting={reduced || instantExit ? undefined') && read('src/components/help/CoachTip.tsx').includes('entering={reduced || instantExit ? undefined'), 'CoachTip can skip its layout animation');
  assert.ok(modal.includes('Math.min(contentHeight.current, viewportHeight.current - 14)') && modal.includes('const heldStyle = useAnimatedStyle(() => ({ minHeight: held.value }))'), 'the card keeps its height through the success card');
  assert.ok(/level=\{nextLevel\}[\s\S]{0,300}animate=\{state === 'success'\}/.test(modal), 'the next tier is mounted (still) before the burst');
  assert.ok(modal.includes('windupWobble(windup.value, CHARGE_MS') && modal.includes('<GatherRings progress={gatherRing}'), 'the charge visibly builds');
  assert.ok(/uiRepeat\(uiSequence\(uiTiming\(1\.25/.test(modal) && /uiRepeat\(uiSequence\(uiTiming\(0\.82/.test(modal), 'a slow server gets a humming coin and a pulsing glow');
});

test('wave 3 round 2: the coin reveal winds up, hands straight to the summary and shows where to tap', () => {
  const reveal = read('src/components/CoinCatchReveal.tsx');
  assert.ok(reveal.includes('<GatherRings progress={rings}') && reveal.includes('windupWobble(windup.value, WINDUP_MS'), 'rings close in, the wobble speeds up');
  assert.ok(reveal.includes('callbacks.current.onExit?.()'), 'the summary is told when the coin starts to leave');
  assert.ok(!reveal.includes('Tap to continue</Text>') && reveal.includes('styles.tapPill'), 'a big gold tap pill, not tiny text');
  const win = read('src/components/PostWinRewardsModal.tsx');
  assert.ok(win.includes('onExit={() => setHanding(true)}') && win.includes('opacity: revealed ? 1 : 0'), 'the summary fades in under the departing coin');
});

test('wave 3 round 2: the daily chest rattles while it waits, bursts on a non-coin day, one picture of the prize', () => {
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.ok(/withRepeat\(withSequence\(\.\.\.\[8, -10, 10, -8, 0\]/.test(chest), 'it keeps rattling while the server answers');
  assert.ok(chest.includes('seamStyle') && chest.includes('cancelAnimation(shake); shake.value = withTiming(0'), 'the rattle stops and the lid seam blazes on the pop');
  assert.ok(chest.includes('{coinDay && <GameIcon name={PRIZE[kind].icon} size={56} />}'), 'no second energy picture');
  assert.ok(chest.includes('<CountUpText') && !/setTimeout\(step, 32\)/.test(chest), 'the count runs on the UI thread');
});

test('wave 3 round 2: the gold chaser reads gold and stops its glint on Battery Saver', () => {
  const pin = read('src/screens/pinTrading/EnamelPin.tsx');
  assert.ok(Number((pin.match(/const FOIL_EDGE = ([0-9.]+);/) || [])[1]) >= 0.09, 'a thick foil rim');
  assert.ok(pin.includes('BEVEL_LIGHT') && pin.includes('BEVEL_DEEP'), 'with a bevel');
  const box = read('src/screens/pins/BoxReveal.tsx');
  assert.ok(/if \(ambient \|\| !glintLooping\.current\) return;[\s\S]{0,80}cancelAnimation\(shine\)/.test(box), 'the looping glint stops when ambient motion is not allowed');
  assert.ok(/pull\.is_chaser && \(\s*<Image source=\{SOFT\}[^>]*tintColor="#ffc93c"/.test(box), 'a warm gold backlight behind the chaser');
});

test('wave 3 round 3: the first level-up tip never covers Awesome!, and the success card fits its payoff', () => {
  const modal = read('src/components/CoinLevelingModal.tsx');
  const success = modal.slice(modal.indexOf('── SUCCESS STATE ──'), modal.indexOf('── The one CTA ──'));
  assert.ok(success.includes('<OneTimeTip id="first_level_up"'), 'the tip is inside the success content, above the button');
  assert.equal((modal.match(/<OneTimeTip id="first_level_up"/g) || []).length, 2, 'on the success card, or once on the next coin card (never absolute over the CTA)');
  assert.ok(/successBox\.current\.outer = event\.nativeEvent\.layout\.height/.test(modal) && /successBox\.current\.inner = event\.nativeEvent\.layout\.height/.test(modal), 'the spare room in the success box is measured');
  assert.ok(/held\.value = uiTiming\(target, \{ duration: SUCCESS_SNUG_MS, easing: EASE\.out \}\)/.test(modal), 'the card eases down to the payoff on the UI thread');
  const LV = 'src/components/CoinLevelingModal.tsx';
  assert.ok(constFrom(LV, 'SUCCESS_SNUG_GAP') <= 24, 'no empty band over 24 pt is left');
  assert.ok(constFrom(LV, 'SUCCESS_SNUG_MS') >= 120 && constFrom(LV, 'SUCCESS_SNUG_MS') <= 220, 'fits while the content stamps in, before Awesome! shows');
});

test('wave 3 round 3: Gold, Prismatic and Legendary success coins look different without text', () => {
  const LV = 'src/components/CoinLevelingModal.tsx';
  const tierPlateLook = pureFrom('src/components/coin/TierPlate.tsx', 'tierPlateLook', { coinTier: loadTs('src/constants/coinTiers.ts').coinTier });
  const gold = tierPlateLook(3), prism = tierPlateLook(4), legend = tierPlateLook(5);
  assert.equal(gold.rays, 0, 'Gold: a plain gold plate');
  assert.ok(prism.rays > 0 && prism.colors[1] === '#ffffff', 'Prismatic: water-blue and white rays');
  assert.ok(legend.rays > prism.rays && legend.reach > prism.reach, 'Legendary: the biggest sunburst');
  assert.ok(constFrom(LV, 'SUCCESS_COIN_SCALE') >= 1.15, 'the new coin settles bigger (about 142 pt)');
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.ok(modal.includes('<TierPlate level={nextLevel} size={120} progress={plate} />'), 'the plate is mounted with the card, hidden at 0');
  const plate = read('src/components/coin/TierPlate.tsx');
  assert.ok(!/shadowRadius|withRepeat|uiRepeat/.test(plate), 'still once it lands, no shadow');
});

test('wave 3 round 3: the TAP! pill draws whole, the title leaves before the summary, confetti clears the coin', () => {
  const reveal = read('src/components/CoinCatchReveal.tsx');
  const pill = reveal.slice(reveal.indexOf('  tapPill: {'), reveal.indexOf('  tapText:'));
  assert.ok(!/borderBottomWidth/.test(pill), 'one uniform border (a thicker bottom border drew a half-filled pill on iOS)');
  assert.ok(reveal.includes('<View style={styles.tapLip} />'), 'the gold lip is its own view under the pill');
  assert.ok(/titleOut\.value = withDelay\(Math\.max\(0, exitAt - TITLE_OUT_MS\)/.test(reveal), 'the title fades out before the coin leaves');
  assert.ok(reveal.includes('(1 - titleOut.value)'), 'and its opacity follows that');
  assert.ok(!reveal.includes('#fb923c'), 'no orange confetti');
  assert.ok(/translateX: x \+ piece\.ux \* r0/.test(reveal) && /const CONFETTI_SPAWN = 0\.(6[5-9]|[7-9])/.test(reveal), 'pieces start past the rim at the punch');
});

test('wave 3 round 3: the non-coin chest really opens, and the count box follows Dynamic Type', () => {
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.equal((chest.match(/source=\{CHEST_CLOSED\}/g) || []).length, 3, 'the same art: whole at rest, clipped into body and lid only while the lid is up (no new art)');
  assert.ok(/rotateX: `\$\{LID_HINGE_DEG \* lid\.value\}deg`/.test(chest) && chest.includes("transformOrigin: 'top'"), 'the lid hinges back at its top edge');
  const DG = 'src/components/DailyGiftModal.tsx';
  const hinge = constFrom(DG, 'LID_HINGE_DEG');
  assert.ok(hinge >= 20 && hinge <= 30, 'about 25 degrees');
  const countWidth = pureFrom(DG, 'countWidth');
  assert.ok(countWidth(20, 2) >= countWidth(20) * 2 - 1, 'a large text size widens the number box');
  assert.equal(countWidth(20, 0.8), countWidth(20), 'never narrower than the base');
});

test('wave 3 round 3: the chaser art sits inside its gold rim', () => {
  const pin = read('src/screens/pinTrading/EnamelPin.tsx');
  assert.ok(/blendMode="dstOut"/.test(pin) && /const FOIL_INSET = 0\.0[4-8]/.test(pin), 'the foil laps over the art edge, so no blue edge shows outside the gold');
  assert.ok(!/ColorMatrix/.test(pin), 'the art keeps its own light-blue colours (no colour blend)');
});

test('wave 3 round 3: on a short phone the success card keeps Awesome! on screen', () => {
  const modal = read('src/components/CoinLevelingModal.tsx');
  assert.ok(modal.includes('export const SHORT_PHONE = SCREEN_H < 740;'), 'an SE-height phone gets the tight success card');
  assert.ok(/ready=\{visible && state === 'success' && tipRoom\}/.test(modal), 'the first-time tip shows only when the card has room for it');
  assert.ok(/const room = outer - inner - SUCCESS_BOX_PAD \* 2;/.test(modal) && /room >= TIP_ROOM/.test(modal), 'room is measured from the success box');
  assert.ok(modal.includes("display: state === 'success' && SHORT_PHONE ? 'none' : 'flex'"), 'the extra line is dropped on a short phone');
});

test('wave 3 round 4: the energy-day chest pops its lid and lands shut, whole art at rest (no cut edge, no slab)', () => {
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.ok(!/chestInside/.test(chest), 'no flat dark inside slab');
  assert.ok(/const wholeChestStyle = useAnimatedStyle\(\(\) => \(\{ opacity: lid\.value > LID_AT_REST \? 0 : 1 \}\)\)/.test(chest), 'at rest the chest is one whole picture');
  assert.ok(/const lidStyle = useAnimatedStyle\(\(\) => \(\{\s*transform:/.test(chest), 'the lid copy is always drawn (it sits over the whole picture at rest), so the first popped frame has its lid');
  const celebrate = chest.slice(chest.indexOf('const celebrate = '), chest.indexOf('const open = async'));
  const lidLine = celebrate.slice(celebrate.indexOf('lid.value = withSequence('), celebrate.indexOf('pop.value = withSequence('));
  assert.ok(/withTiming\(0, \{ duration: 90, easing: EASE\.in \}\)\);\s*$/.test(lidLine), 'the lid lands shut (its last step ends at 0)');
  assert.ok(/seam\.value = withSequence\([\s\S]*withTiming\(0, \{ duration: 260/.test(celebrate), 'the light goes back in with the lid');
  assert.ok(/seam\.value = 0; lid\.value = 0;/.test(chest), 'reduced motion: a whole shut chest');
});

test('wave 3 round 4: Awesome! never moves after it shows, and the CTA is pinned under the scrolling card', () => {
  const modal = read('src/components/CoinLevelingModal.tsx');
  const scrollEnd = modal.indexOf('</ScrollView>');
  assert.ok(modal.indexOf('── The one CTA ──') > scrollEnd, 'the one CTA sits outside the ScrollView (an iPhone SE sees Level Up! on the first frame)');
  assert.ok(/<Reanimated\.View style=\{ctaStyle\} pointerEvents=\{state === 'leveling' \|\| \(state === 'success' && !ctaLive\) \? 'none' : 'auto'\}>/.test(modal), 'not tappable until it has landed');
  const snug = modal.slice(modal.indexOf('  const snug = () => {'), modal.indexOf('  if (!rideCoin) return null;'));
  assert.ok(/if \(snugDone\.current \|\| outer <= 0 \|\| inner <= 0\) return;/.test(snug), 'it fits once, on the first measure');
  assert.ok(snug.indexOf('held.value = uiTiming(') < snug.indexOf('revealCta(SUCCESS_SNUG_MS)'), 'Awesome! pops in once the card has its final height');
  assert.ok(!/SUCCESS_SNUG_AFTER_MS/.test(modal), 'no hollow hold before the fit');
  assert.ok(/hideCta\(\);/.test(modal.slice(modal.indexOf('const handleLevelUp'), modal.indexOf('const plan = levelUpFx'))), 'hidden under the charge bar from the tap');
  assert.ok(/flexShrink: 1,\s*\}\}>\s*<ScrollView/.test(modal), 'the card shrinks to the screen, the scroll area gives way, the CTA stays');
  assert.ok(/<OneTimeTip id="first_level_up" ready=\{visible && \(state === 'preview' \|\| state === 'leveling'\) && currentLevel >= 2\}/.test(modal), 'a kid who missed the tip sees it once on the next coin card');
});

test('wave 3 round 4: tier plates have ink edges, Prismatic has a few long rays, rings glow without shadows', () => {
  const tierPlateLook = pureFrom('src/components/coin/TierPlate.tsx', 'tierPlateLook', { coinTier: loadTs('src/constants/coinTiers.ts').coinTier });
  const prism = tierPlateLook(4), legend = tierPlateLook(5);
  assert.ok(prism.rays <= 8 && prism.reach >= 1.38, 'Prismatic: 8 chunky rays, not a gear edge');
  assert.ok(legend.rays > prism.rays && legend.reach > prism.reach, 'Legendary is still the biggest sunburst');
  const plate = read('src/components/coin/TierPlate.tsx');
  assert.ok(/borderBottomColor: PLATE_INK/.test(plate), 'every ray has an ink edge behind it');
  assert.ok(/backgroundColor: PLATE_INK/.test(plate), 'the disc has an ink outline');
  const demo = read('src/components/CoinUpgradeDemo.tsx');
  assert.ok(!/shadowRadius: 1[0-2]\b/.test(demo), 'the pulsing and spinning rings have no iOS shadow');
  assert.equal((demo.match(/<View style=\{\[s\.softRing/g) || []).length, 2, 'they glow with a soft drawn ring instead');
});

test('wave 3 round 4: the queued or recovered Set Complete times like the inline one', () => {
  const reveal = read('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.ok(reveal.includes('entering={still || bridged ? undefined : FadeIn.duration(DURATION.base)}'), 'one cross-fade time for both paths');
});

test('wave 3 rerun round 2: the box reveal footer fades in, so Done never shows a frame as a blank pill', () => {
  const box = read('src/screens/pins/BoxReveal.tsx');
  assert.ok(/<Animated\.View entering=\{still \? undefined : FadeIn\.duration\(180\)\} style=\{\[styles\.footer/.test(box), 'the footer fades in on the UI thread');
  assert.ok(/onPress=\{next\} \/>\s*<\/Animated\.View>/.test(box), 'the Done button sits inside the fading footer');
});

test('wave 3 rerun round 2: the daily chest card keeps one height from the tap to the prize', () => {
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.ok(!/bodyBandStyle/.test(chest), 'the body copy is never hidden, so it never draws late');
  assert.ok(/<View style=\{styles\.footerSlot\}>\s*<Pressable onPress=\{dismiss\} disabled=\{phase !== 'open'\}/.test(chest), 'Awesome! is laid out from the start');
  assert.ok(/style=\{\[styles\.button, phase !== 'open' && styles\.waiting\]\}/.test(chest), 'it stays hidden until the chest opens');
  assert.ok(/styles\.laterButton, styles\.laterInSlot/.test(chest), 'Back to map sits in the same spot while the chest is shut');
  assert.ok(!/\{phase === 'open' && \(\s*<Pressable onPress=\{dismiss\}/.test(chest), 'no button mounts at the payoff');
});

test('wave 3 rerun round 2: "Opening your chest" fades on the UI thread as the lid pops', () => {
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.ok(/<Animated\.Text style=\{\[styles\.hint, hintStyle\]\}>/.test(chest), 'the hint is driven by a shared value');
  const celebrate = chest.slice(chest.indexOf('const celebrate = '), chest.indexOf('const open = async'));
  assert.ok(/hintOut\.value = withTiming\(1, \{ duration: 90 \}\);/.test(celebrate), 'it fades with the pop');
  assert.ok(/cancelAnimation\(hintOut\); hintOut\.value = 0;\s*setPhase\('opening'\);/.test(chest), 'every claim starts with the words showing');
  assert.ok(!/useLayoutEffect/.test(chest), 'the pop still starts at once on the UI thread');
});
