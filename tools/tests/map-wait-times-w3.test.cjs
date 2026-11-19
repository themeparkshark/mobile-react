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
  // Merge w3: lane shelf T228 (decision default) takes the Limited tag off the map; the shelf shows it with its date.
  // The map still passes the ride name, so a tag that ever returns names its ride.
  assert.match(read('src/screens/ExploreScreen.tsx'), /limitedText: null, name: task\.name,/);
  assert.doesNotMatch(marker, /limitedBadge\}><GameIcon name="timer"/, 'a sparkle, not a stopwatch');
});

test('T021: Wait Times finds a ride by name across every ride', () => {
  const W = load('src/services/lineplay/queueWaitPresentation.ts');
  assert.equal(typeof W.searchKey, 'function');
  assert.equal(W.searchKey('Pirates of the Caribbean'), 'piratesofthecaribbean');
  assert.ok(W.searchKey("Peter Pan's Flight").includes(W.searchKey('peter pans')));
  assert.match(wait, /<SearchField placeholder="Find a ride" onChangeText=\{setQuery\} accessibilityLabel="Find a ride by name" \/>/);
  assert.match(wait, /\{\(loading \|\| attractions\.length > 0 \|\| !!query\) && \(\s*<View style=\{styles\.searchWrap\}>/, 'never remounts mid-search');
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
});

test('T190 hold: no bare interval left on the Gym or Community Center screens (every clock is focus and app gated)', () => {
  for (const file of ['src/screens/GymBattle/GymBattleScreen.tsx', 'src/screens/CommunityCenterScreen.tsx']) {
    const src = read(file);
    assert.doesNotMatch(src, /setInterval\(/, `${file} still runs a setInterval`);
    assert.doesNotMatch(src, /AppState\.currentState === 'active'/, `${file} gates a poll on app state only`);
  }
  const gym = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(gym, /useLivePoll\(fetchGym, 30000, \{ focused: screenFocused, immediate: false, key: parkId \}\);/);
  for (const k of ['attack', 'checkin', 'defend']) {
    assert.match(gym, new RegExp(`useLiveCountdown\\(gymPlayer\\?\\.seconds_until_${k}, clockLive, refetchGym, gymPlayer\\)`));
  }
  const center = read('src/screens/CommunityCenterScreen.tsx');
  assert.match(center, /const clocksLive = screenFocused && appActive;/);
  assert.match(center, /useLiveCountdown\(showCooldownModal \? cooldownSeconds : 0, clocksLive, onCooldownModalDone\)/);
  assert.match(center, /useLiveCountdown\(center\?\.give_cooldown_remaining, clocksLive, onGiveReady, center\)/);
});

// A tiny hooks harness: enough of React to run useLiveCountdown's effects in order.
function hookHarness() {
  const slots = [];
  let i = 0;
  let pending = [];
  const React = {
    useRef: v => { const k = i++; if (!(k in slots)) slots[k] = { current: v }; return slots[k]; },
    useState: init => {
      const k = i++;
      if (!(k in slots)) slots[k] = { v: typeof init === 'function' ? init() : init };
      const slot = slots[k];
      return [slot.v, next => { slot.v = typeof next === 'function' ? next(slot.v) : next; }];
    },
    useEffect: (fn, deps) => {
      const k = i++;
      const prev = slots[k];
      const changed = !prev || !deps || deps.some((d, n) => !Object.is(d, prev.deps[n]));
      if (changed) { pending.push(() => { if (prev && prev.cleanup) prev.cleanup(); const c = fn(); slots[k] = { deps, cleanup: c }; }); }
      else slots[k] = prev;
    },
  };
  return {
    React,
    render(run) { i = 0; pending = []; const out = run(); pending.forEach(f => f()); return out; },
  };
}

test('T190 hold: useLiveCountdown never ticks while hidden, reads the clock on return and calls onDone once', () => {
  const h = hookHarness();
  let now = 1_000_000;
  const timers = new Map();
  let nextId = 1;
  const clock = {
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearInterval: id => { timers.delete(id); },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read('src/hooks/useLiveCountdown.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: name => (name === 'react' ? h.React : {}), Math, Date: { now: () => now }, ...clock });
  const useLiveCountdown = mod.exports.default;
  let done = 0;
  const onDone = () => { done += 1; };
  const tick = () => { for (const t of [...timers.values()]) t.fn(); };

  let left = h.render(() => useLiveCountdown(10, true, onDone, 'a'));
  assert.equal(left, 10);
  assert.equal(timers.size, 1, 'one clock while live');
  now += 3000; tick();
  left = h.render(() => useLiveCountdown(10, true, onDone, 'a'));
  assert.equal(left, 7);

  h.render(() => useLiveCountdown(10, false, onDone, 'a'));
  assert.equal(timers.size, 0, 'hidden: no clock at all');
  now += 20000;
  assert.equal(done, 0, 'nothing ran while hidden');

  left = h.render(() => useLiveCountdown(10, true, onDone, 'a'));
  left = h.render(() => useLiveCountdown(10, true, onDone, 'a'));
  assert.equal(left, 0, 'on return it reads the real time left, no drift');
  assert.equal(done, 1, 'the expiry while hidden still refreshes once');
  assert.equal(timers.size, 0, 'a finished countdown keeps no clock');
  h.render(() => useLiveCountdown(10, true, onDone, 'a'));
  assert.equal(done, 1, 'onDone only once');

  // A refetch with a new stamp restarts from the server value.
  left = h.render(() => useLiveCountdown(10, true, onDone, 'b'));
  left = h.render(() => useLiveCountdown(10, true, onDone, 'b'));
  assert.equal(left, 10);
  assert.equal(timers.size, 1);
});
