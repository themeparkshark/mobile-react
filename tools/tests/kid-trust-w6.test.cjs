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
  const help = loadModule('src/services/help/helpTopics.ts');
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
    const body = help.LINEPLAY_INTRO_BODY[state];
    if (cardSaysNoParts || state !== 'on') assert.doesNotMatch(body, /earns? Ride Parts/, JSON.stringify(rewards));
  }
  assert.match(help.LINEPLAY_INTRO_BODY.on, /earns Ride Parts/);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /const introBody = LINEPLAY_INTRO_BODY\[linePartsState\(rewards\)\];/);
  assert.match(screen, /<OneTimeTip id="lineplay_intro"[^>]*body=\{introBody\}/);
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /const noPartsHere = !completed && !rewardTrackingAvailable && \(lineRewardsReady === false \|\| rewardUnavailable\);/);
});
