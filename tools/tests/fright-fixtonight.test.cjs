/** Panel round 1 fix-tonight list: one test per item, rule names in the titles. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { load, haunt } = require('./helpers/fright-fixtures.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const lines = JSON.parse(read('src/services/fright/content/lines.json'));
const copy = loadTs('src/services/fright/copy.ts', { './content/lines.json': lines });
const pace = load('pace');
const layout = load('layout');

test('Q2 queue copy: entry toast invites play; no phones-away, eyes-up or Shusher countdown in the queue', () => {
  assert.equal(copy.COPY.inLineToast, 'You\'re in line! Play while you wait.');
  assert.equal(copy.COPY.outOfHaunt, 'Out of the haunt? Tap below.');
  assert.equal(pace.pillSubLine({ inLine: { name: 'The Robot City', minutes: 12 }, done: 0, total: 10 }), 'In line: The Robot City · 12 min');
  for (const file of ['src/components/fright/FrightPill.tsx', 'src/components/fright/FrightSheet.tsx',
    'src/components/fright/useFrightEngine.ts', 'src/services/fright/copy.ts']) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /phones away|Phones down|Eyes up|shusherEnter/i, file);
  }
  const sheet = read('src/components/fright/FrightSheet.tsx');
  assert.match(sheet, /engine\.quiet \? \([\s\S]*?inLineWait[\s\S]*?\) : \([\s\S]*?outOfHaunt/, '"Out of the haunt?" only after min_done_at');
});

test('Q3 findable haunts: openSheetAt(key) is wired to the map as onHauntPress; the sheet scrolls and highlights', () => {
  const engine = read('src/components/fright/useFrightEngine.ts');
  assert.match(engine, /const openSheetAt = useCallback\(\(key: string\)/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /onHauntPress: frightEngine\.openSheetAt/);
  const sheet = read('src/components/fright/FrightSheet.tsx');
  assert.match(sheet, /engine\.focusKey/);
  assert.match(sheet, /scrollTo\(/);
});

test('Q3 pill sub-line: the shortest open line, one meaningful line, no duplicate counts', () => {
  const spots = [haunt('a', { name: 'The Robot City', posted_minutes: 25, sort: 1 }),
    haunt('b', { name: 'The Farmhouse UFO', posted_minutes: 10, sort: 2 }),
    haunt('c', { name: 'The Clockwork Puzzle Box', posted_minutes: 5, status: 'CLOSED', sort: 3 }),
    haunt('d', { name: 'The Wild Zoo After Dark', posted_minutes: 3, accepting: false, sort: 4 })];
  assert.equal(pace.shortestLineText(spots, []), 'Shortest: The Farmhouse UFO · 10 min');
  assert.equal(pace.shortestLineText(spots, ['b']), 'Shortest: The Robot City · 25 min', 'done tonight is skipped');
  assert.equal(pace.shortestLineText([haunt('z', { posted_minutes: null })], []), null);
  const short = pace.shortestLineText(spots, []);
  assert.equal(pace.pillSubLine({ done: 0, total: 10, shortest: short }), short);
  assert.equal(pace.pillSubLine({ done: 0, total: 10, shortest: null }), 'Tap a haunt to log it');
  assert.equal(pace.pillSubLine({ gatesOpen: '6:30 PM', done: 0, total: 10, shortest: short }), 'Gates open 6:30 PM');
  assert.doesNotMatch(pace.pillSubLine({ done: 0, total: 10, shortest: short }), /0 of 10|to go/);
});

test('Q3 disabled "I\'m in line" shows a visible kid-friendly reason', () => {
  assert.equal(pace.enterBlockText({ ok: false, reason: 'too_far', distance: 137 }), 'Walk closer · 140 m');
  assert.equal(pace.enterBlockText({ ok: false, reason: 'not_accepting' }), 'Closed right now');
  assert.equal(pace.enterBlockText({ ok: false, reason: 'no_fix' }), 'Finding your GPS...');
  assert.equal(pace.enterBlockText({ ok: true }), null);
  assert.match(read('src/components/fright/FrightSheet.tsx'), /<Text style=\{styles\.blocked\}>\{blocked\}<\/Text>/);
});

test('Q4 every Marquee and card load has a 12 s timeout, failure copy and a visible Retry', async () => {
  const timeout = load('timeout');
  assert.equal(timeout.LOAD_TIMEOUT_MS, 12_000);
  assert.equal(await timeout.withTimeout(new Promise(() => {}), 20), null, 'a hung request ends');
  assert.equal(await timeout.withTimeout(Promise.reject(new Error('x')), 20), null);
  assert.equal(await timeout.withTimeout(Promise.resolve(7), 20), 7);
  for (const file of ['src/components/fright/MarqueeRecap.tsx', 'src/components/fright/FrightCardScreen.tsx']) {
    const src = read(file);
    assert.match(src, /withTimeout\(/, file);
    assert.match(src, /label="Retry"/, file);
    assert.match(src, /Couldn\\'t load/, file);
  }
});

test('Q5 tutorial truth: no "see what the fans think"; rank card says ranks count until fan data exists', () => {
  assert.equal(copy.fanCompare(null, null), 'Your ranks count toward the fan rankings.');
  assert.equal(copy.fanCompare(2, 1), 'You have it #2. Fans have it #1.');
  for (const file of ['src/services/fright/tutorial.ts', 'src/components/fright/RankCard.tsx', 'src/services/fright/copy.ts']) {
    assert.doesNotMatch(read(file), /fans think/i, file);
  }
});

test('Re-swim asks about the last score', () => {
  assert.equal(copy.rankPrompt('The Robot City', true, 'k', 4), 'Re-swim! Still a four?');
  assert.equal(copy.rankPrompt('The Robot City', true, 'k', null), 'Re-swim! How was it this time?');
  assert.match(copy.rankPrompt('The Robot City', false, 'k', null), /How many fins\?$/);
});

test('Q7 pill art: the bundled lantern is the default for everyone; server art only overrides', () => {
  assert.ok(fs.existsSync(path.join(root, 'src/components/fright/art/lantern.webp')));
  const pill = read('src/components/fright/FrightPill.tsx');
  assert.match(pill, /require\('\.\/art\/lantern\.webp'\)/);
  assert.match(pill, /uri=\{engine\.art\.chip\}[\s\S]*?fallback=\{<Image source=\{LANTERN\}/);
});

test('Q8 coach marks and toasts sit below the pill, never on top of it', () => {
  assert.equal(layout.overlayTop(180, 40, 99), 148, 'pill bottom 180 in window, box at 40: 140 + 8');
  assert.equal(layout.overlayTop(null, 40, 99), 99, 'unmeasured: fallback');
  assert.equal(layout.overlayTop(120, null, 0), 128);
  assert.match(read('src/components/fright/FrightPill.tsx'), /measureInWindow/);
  assert.match(read('src/components/fright/FrightLayer.tsx'), /overlayTop\(engine\.pillBottom/);
});

test('Q9 battery: looping ambience is opt-in (default off, server ambience_default), tier cap goes to the map', () => {
  const engine = read('src/components/fright/useFrightEngine.ts');
  assert.match(engine, /ambient \?\? \(tonight\?\.config\?\.ambience_default === true\)/);
  assert.match(read('src/components/fright/FrightSheet.tsx'), /COPY\.ambient/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /tierCap: frightNight\.tonight\.config\?\.fx_tier_cap/);
  assert.match(explore, /ambience: frightEngine\.ambient/);
});

test('Q10 "EVERY RIDE IS OPEN" hides while the mode is ON and stays otherwise', () => {
  const bar = read('src/components/RideControlBar.tsx');
  assert.match(bar, /hideAllOpen \? 'RIDE CONTROL' : 'EVERY RIDE IS OPEN'/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /hideAllOpen=\{frightNight\.modeOn\}/);
});
