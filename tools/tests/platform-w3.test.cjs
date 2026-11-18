const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('T173: I promise wakes only after the three rules showed, and a stray tab-bar tap only closes the sheet', () => {
  const src = read('src/screens/threads/RulesCard.tsx');
  assert.match(src, /export const PROMISE_READY_MS = RULE_STEP_MS \* RULES\.length \+ 450;/);
  assert.match(src, /timers\.push\(setTimeout\(\(\) => setReady\(true\), PROMISE_READY_MS\)\);/);
  assert.match(src, /label="I promise"\n\s*icon="check"\n\s*disabled=\{!ready\}\n\s*onPress=\{\(\) => \{\n\s*if \(!ready\) return;/);
  // The promise is never the lowest button: Not now sits under it, over the tab bar.
  const promise = src.indexOf('label="I promise"');
  const notNow = src.indexOf('label="Not now"');
  assert.ok(promise > 0 && notNow > promise, 'Not now comes after (below) I promise');
  assert.match(src, /if \(!visible\) \{ rows\.forEach\(v => \{ v\.value = 0; \}\); setReady\(false\);/, 'every open starts locked again');
  assert.match(src, /withSpring\(1, SPRING\.settle\)/, 'rules settle in on springs');
});

const { loadTs } = require('./helpers/ts-module.cjs');

test('T174: Welcome never shows the server sentence, and a late save is never "taken" for the player’s own name', () => {
  const W = loadTs('src/screens/welcomeCopy.ts');
  assert.equal(W.welcomeSaveLine({ code: 'ECONNABORTED' }), 'The game is slow right now. Tap Let’s Go again.');
  assert.equal(W.welcomeSaveLine({ response: { status: 500, data: { message: 'Server Error' } } }), 'The game is slow right now. Tap Let’s Go again.');
  assert.equal(W.welcomeSaveLine({ response: { status: 422, data: { errors: { username: ['The username has already been taken.'] } } } }),
    'That name is taken. Try another, or tap the sparkle for a new one!');
  assert.equal(W.welcomeSaveLine({ response: { status: 422, data: { errors: { username: ['The username contains a word that is not allowed.'] }, message: 'raw' } } }),
    'Pick a different name, or tap the sparkle for a new one!', 'never the raw server sentence');
  assert.equal(W.nameSaved('RocketChomp', 'rocketchomp'), true);
  assert.equal(W.nameSaved(null, 'RocketChomp'), false);
  const src = read('src/screens/WelcomeScreen.tsx');
  assert.match(src, /const saved = await refreshPlayer\(\)\.then\(p => p\?\.username, \(\) => null\);\n\s*if \(nameSaved\(saved, name\)\) \{ celebrate\(\); return; \}\n\s*setServerError\(welcomeSaveLine\(error\)\);/);
  assert.match(src, /await updatePlayer\(\{ username: name \}\);\n\s*await refreshPlayer\(\)\.catch\(\(\) => undefined\);/, 'a saved name never turns into an error because /me was slow');
  assert.doesNotMatch(src, /error\?\.response\?\.data\?\.message/, 'no server sentence on screen');
});

test('T185: the name field counts letters and says when it cut a long name; T182: the shark fits its room', () => {
  const src = read('src/screens/WelcomeScreen.tsx');
  assert.match(src, /\{`\$\{username\.length\}\/\$\{NAME_MAX\}`\}/);
  assert.match(src, /setCut\(clean\.length > NAME_MAX\);\n\s*setUsername\(clean\.slice\(0, NAME_MAX\)\);/);
  assert.match(src, /\$\{NAME_MAX\} letters is the most\. We kept \$\{username\}/);
  assert.doesNotMatch(src, /maxLength=\{12\}/, 'no silent cut by the text field');
  assert.match(src, /style=\{\[styles\.shark, \{ width: sharkSize, height: sharkSize \}\]\}/);
  const m = src.match(/export function welcomeSharkSize\(stageHeight: number\): number \{[\s\S]*?\n\}/);
  assert.ok(m);
  const size = new Function(`const SHARK_BOB_ROOM = 16; ${m[0].replace('export ', '').replace(/: number/g, '')}; return welcomeSharkSize;`)();
  assert.equal(size(0), 260);
  assert.equal(size(200), 168, 'a short stage gets a smaller shark (stage minus its bob)');
  assert.equal(size(600), 260);
});

test('T181: the location card is right at the park and at home, and after Don’t Allow it says location is off', () => {
  const src = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  assert.match(src, /park: 'Win ride coins at the park\.'/);
  assert.match(src, /offTitle: 'Location is off',\n\s*off: 'Turn it on in Settings to see the rides near you\.'/);
  assert.match(src, /\{canAsk \? PRIMER_COPY\.title : PRIMER_COPY\.offTitle\}/);
  assert.match(src, /: <Text style=\{styles\.body\}>\{PRIMER_COPY\.off\}<\/Text>\}/);
});

test('T184: the game motion hook knows Reduce Motion on the first render (off means entrances play)', () => {
  const react = { useState: v => [typeof v === 'function' ? v() : v, () => {}], useEffect() {} };
  const rn = { AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) } };
  const hook = startup => loadTs('src/hooks/useReducedGameMotion.ts', {
    react, 'react-native': rn,
    '../ui/useUiReducedMotion': loadTs('src/ui/useUiReducedMotion.ts', { react, 'react-native': rn, 'react-native-reanimated': { useReducedMotion: () => startup } }),
  }).default;
  assert.equal(hook(false)(), false, 'motion on: the first render animates (it used to start true for everyone)');
  assert.equal(hook(true)(), true);
});

test('T177: every outlined title is one element for VoiceOver (never the sizer and eight outline copies)', () => {
  const stroked = read('src/components/StrokedText.tsx');
  assert.match(stroked, /accessible accessibilityRole=\{accessibilityRole\} accessibilityLabel=\{children\}/);
  assert.match(read('src/components/Ribbon.tsx'), /accessibilityRole="header"/);
  assert.match(read('src/components/Topbar/TopbarText.tsx'), /accessible accessibilityRole="header" accessibilityLabel=\{label\}/);
  assert.match(read('src/share/Outlined.tsx'), /accessible accessibilityRole="text" accessibilityLabel=\{text\}/);
  assert.match(read('src/games/trivia-duel/ui/Overlays.tsx'), /<View style=\{style\} accessible accessibilityRole="text" accessibilityLabel=\{text\}>/);
  assert.match(read('src/games/boss/bash/BashParts.tsx'), /accessibilityElementsHidden importantForAccessibility="no">\{text\}<\/Text>\)\}/);
});

test('T179: small header, profile, pin and wait-time targets reach 44 pt', () => {
  assert.match(read('src/components/Button.tsx'), /hitSlop=\{BUTTON_HIT_SLOP\}/);
  assert.match(read('src/components/Button.tsx'), /BUTTON_HIT_SLOP = \{ top: 8, bottom: 8, left: 8, right: 8 \}/);
  assert.match(read('src/components/Topbar/Currency.tsx'), /hitSlop=\{PILL_HIT_SLOP\}/);
  assert.match(read('src/components/Topbar/Currency.tsx'), /PILL_HIT_SLOP = \{ top: 8, bottom: 8/);
  assert.match(read('src/components/Topbar.tsx'), /accessibilityLabel="Back"\n\s*\/\/ T179[^\n]*\n\s*hitSlop=\{8\}/);
  assert.match(read('src/screens/QueueTimesScreen.tsx'), /my next coin`\} hitSlop=\{HIT_SLOP\}/);
  assert.match(read('src/screens/pins/Lanyard.tsx'), /hitSlop=\{Math\.max\(6, Math\.ceil\(\(48 - pinSize\) \/ 2\)\)\}/);
});

test('T183: the guide card grows with Larger Text up to 1.3x and wraps instead of clipping', () => {
  const src = read('src/components/guide/NextCoinCard.tsx');
  assert.match(src, /export const CARD_TEXT_MAX = 1\.3;/);
  assert.match(src, /<Text style=\{styles\.title\} numberOfLines=\{3\} maxFontSizeMultiplier=\{CARD_TEXT_MAX\}>/);
  assert.match(src, /<Text style=\{styles\.line\} numberOfLines=\{3\} maxFontSizeMultiplier=\{CARD_TEXT_MAX\}>/);
  assert.equal((src.match(/maxFontSizeMultiplier=\{CARD_TEXT_MAX\}/g) || []).length, 5, 'every word on the card');
});

test('T180: shelf and closet loads retry once quietly, then show his shark with one button; the coach waits for a shelf', async () => {
  const Q = loadTs('src/api/quietRetry.ts');
  let calls = 0;
  const flaky = async () => { calls += 1; if (calls === 1) throw { code: 'ECONNABORTED' }; return 'shelf'; };
  assert.equal(await Q.quietRetry(flaky, async () => undefined), 'shelf');
  assert.equal(calls, 2, 'one silent retry');
  calls = 0;
  await assert.rejects(Q.quietRetry(async () => { calls += 1; throw { response: { status: 403 } }; }, async () => undefined));
  assert.equal(calls, 1, 'a refusal is not asked again');
  const park = read('src/screens/ParkScreen.tsx');
  assert.match(park, /await quietRetry\(\(\) => loadParkShelf\(Number\(park\), Number\(player\)\), undefined, \(\) => active\);/);
  assert.match(park, /<SharkLoader state="error" title="Your shelf didn’t load"/, 'navy words on the light shelf water');
  assert.doesNotMatch(park, /Could not load your park progress/);
  assert.match(park, /!loading && !progressStale && !!currentPark && !tutorialActive/, 'Finn never teaches over a failed shelf');
  const closet = read('src/screens/InventoryScreen.tsx');
  assert.match(closet, /quietRetry\(\(\) => getItemTypes\(\)\)/);
  assert.match(closet, /quietRetry\(\(\) => getItems\(currentItemType\.id, page, pin\), undefined, \(\) => !cancelled\)/);
  assert.equal((closet.match(/<SharkLoader state="error"/g) || []).length, 2);
  assert.doesNotMatch(closet, /\{loadError\} Tap to try again\./);
  const banner = read('src/components/OfflineBanner.tsx');
  assert.match(banner, /TOP_LEFT_DOCK_ROUTES: ReadonlySet<string> = new Set\(\['TeamSelection'\]\)/, 'the team pick title is never covered');
});

test('T186: the team card pictures "for keeps" with a lock', () => {
  const src = read('src/screens/GymBattle/TeamSelectionScreen.tsx');
  assert.match(src, /<GameIcon name="lock" size=\{26\} \/>\n\s*<Text style=\{s\.warnText\}>This is for keeps/);
});

test('T175: a treat catch plays at once on a slow server and its claim finishes in the claim queue', async () => {
  const H = loadTs('src/screens/ExploreScreen/homeCatch.ts', { './findPresentation': { catchErrorLine: (s, e) => e ?? (s === 410 ? 'gone' : 'Could not catch it. Tap to try again.') } });
  const item = { id: 5, name: 'Galaxy Swirl Churro', rarity: 2, set_name: 'Churro Collection' };
  const fix = { latitude: 33.68, longitude: -117.82 };
  const queued = [];
  let release;
  // A server that answers after the budget: the moment does not wait for it.
  const slow = () => new Promise(resolve => { release = resolve; });
  const quick = await H.catchFindQuick(slow, item, 9, fix, { catch_style: 'chomp' }, c => queued.push(c), 10, ms => new Promise(r => setTimeout(r, ms)));
  assert.equal(quick.kind, 'caught');
  assert.equal(quick.pending, true);
  assert.equal(quick.data.rewards.coins, 0, 'no reward numbers the phone cannot promise');
  assert.equal(quick.data.item.name, 'Galaxy Swirl Churro');
  release({ data: { rewards: { coins: 1 } } });
  // A timeout after the moment started: the claim goes to the queue.
  const timedOut = async () => { throw { code: 'ECONNABORTED' }; };
  const r2 = await H.catchFindQuick(timedOut, item, 10, fix, undefined, c => queued.push(c), 1000, () => new Promise(() => {}));
  assert.equal(r2.kind, 'caught');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].pivotId, 10);
  // A quick real answer is used as is; a refusal in time still says so.
  const ok = await H.catchFindQuick(async () => ({ data: { rewards: { coins: 3 } } }), item, 11, fix, undefined, () => {}, 1000, () => new Promise(() => {}));
  assert.equal(ok.data.rewards.coins, 3);
  assert.equal(ok.pending, undefined);
  const gone = await H.catchFindQuick(async () => { throw { response: { status: 410 } }; }, item, 12, fix, undefined, () => {}, 1000, () => new Promise(() => {}));
  assert.equal(gone.kind, 'gone');
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /catchFindQuick\(latest\.current\.redeem, item, pivotId, latest\.current\.getFix\(\), \{ catch_style: 'chomp' \}, queueCatchClaim\)/);
  assert.match(src, /catchFind\(latest\.current\.redeem, req\.item\.id, req\.pivotId, latest\.current\.getFix\(\), details\)/, 'Ride Photo keeps the server’s roll');
  const q = read('src/services/catchClaimQueue.ts');
  assert.match(q, /storageKey: 'home_catch_claim_queue'/);
  assert.match(q, /if \(typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429\) return true;/);
});
