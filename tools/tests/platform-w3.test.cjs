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
