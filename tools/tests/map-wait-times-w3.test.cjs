// Fix round w3, lane map: T020 limited tag names its ride, T021 find a ride by name on Wait Times,
// T026 honest copy when the live feed is empty, T144 chip rows say there is more, T149 the wait number
// never shrinks to nothing, T190 the Community Center and Gym clocks are focus-gated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file, requireMap = {}) => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText,
    { module: mod, exports: mod.exports, require: name => requireMap[name] ?? {}, Math, Number });
  return mod.exports;
};
const layout = load('src/screens/ExploreScreen/parkMapLayout.ts');
const wait = read('src/screens/QueueTimesScreen.tsx');

test('T020: a limited coin names its ride on the tag, above the date', () => {
  const named = layout.rideTagSize('limited', 'LIMITED · LEAVES NOV 30', 'Main Street Cinema');
  assert.equal(named.h, 34, 'two lines');
  assert.ok(named.w >= 26 + 'Main Street Cinema'.length * 6.6 - 1, 'wide enough for the name');
  assert.ok(named.w <= 184);
  assert.equal(layout.rideTagSize('limited', 'LIMITED · LEAVES OCT 31').h, 22, 'no name: the old one-line tag');
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(marker, /<Text style=\{styles\.limitedName\} numberOfLines=\{1\}>\{task\.name\}<\/Text>/);
  assert.match(marker, /rideTagSize\(tagKind, limited\?\.toUpperCase\(\) \?\? '', task\.name\)/, 'the declutter reserves the two-line tag');
  assert.match(read('src/screens/ExploreScreen.tsx'), /limitedText: task\.limited\?\.active \? limitedLabel\(task\.limited\) : null, name: task\.name,/);
  assert.doesNotMatch(marker, /limitedBadge\}><GameIcon name="timer"/, 'a sparkle, not a stopwatch');
});

test('T021: Wait Times finds a ride by name across every ride', () => {
  const W = load('src/services/lineplay/queueWaitPresentation.ts');
  assert.equal(typeof W.searchKey, 'function');
  assert.equal(W.searchKey('Pirates of the Caribbean'), 'piratesofthecaribbean');
  assert.ok(W.searchKey("Peter Pan's Flight").includes(W.searchKey('peter pans')));
  assert.match(wait, /<SearchField placeholder="Find a ride" onChangeText=\{setQuery\} accessibilityLabel="Find a ride by name" \/>/);
  assert.match(wait, /if \(wanted\) return data\.filter\(e => searchKey\(e\.name\)\.includes\(wanted\)\)/);
});

test('T026: an empty live feed says the feed is not reaching us, and that rides still work', () => {
  assert.match(wait, /export const WAIT_FEED_EMPTY_COPY = 'Live wait times are not reaching us right now\. Rides still work\.';/);
  assert.doesNotMatch(wait, /This park has no wait times right now/);
  assert.doesNotMatch(wait, /'NO TIMES POSTED'/);
});

test('T144: the resort tabs and the gear chips show a fade and an arrow while chips are hidden to the right', () => {
  const hint = load('src/components/EdgeScrollHint.tsx', { react: { useCallback: f => f, useState: v => [v, () => {}] },
    'react-native': { StyleSheet: { create: o => o, absoluteFill: {} } } });
  assert.equal(hint.moreToTheRight(320, 600, 0), true);
  assert.equal(hint.moreToTheRight(320, 600, 276), false, 'at the end of the row');
  assert.equal(hint.moreToTheRight(320, 325, 0), false, 'a row that just fits');
  assert.equal(hint.moreToTheRight(0, 600, 0), false, 'not laid out yet');
  assert.match(wait, /<EdgeScrollHint more=\{parkHint\.more\}/);
  assert.match(read('src/screens/StoreScreen/GearShelf.tsx'), /<EdgeScrollHint more=\{chipHint\.more\} color=\{S\.panel\}/);
});

test('T149: the wait number has a fixed size by digit count, never adjustsFontSizeToFit', () => {
  const card = wait.slice(wait.indexOf('const RideCard = ('), wait.indexOf('const ParkPill'));
  assert.doesNotMatch(card, /adjustsFontSizeToFit/);
  assert.match(card, /fontSize: badgeFontSize\(badge\.text\)/);
  const W = load('src/services/lineplay/queueWaitPresentation.ts');
  assert.equal(W.badgeFontSize('5'), 22);
  assert.equal(W.badgeFontSize('45'), 22);
  assert.equal(W.badgeFontSize('120'), 18);
});

test('T190: the Community Center poll and the Gym clock run only while their screen is focused', () => {
  const center = read('src/screens/CommunityCenterScreen.tsx');
  assert.doesNotMatch(center, /setInterval\(async \(\) => \{\s*const prevCount/);
  assert.match(center, /useLivePoll\(fetchCenter, 15000, \{ focused: screenFocused, immediate: false, key: parkId \}\);/);
  const gym = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(gym, /const clockLive = screenFocused && appActive;/);
  assert.match(gym, /if \(battleSeconds == null \|\| !clockLive\) return;/);
});
