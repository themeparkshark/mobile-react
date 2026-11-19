// T006: no clocks on the map or in raids. Minutes chips on timed finds read as walking time, and
// "28 min left", "19 min left" and a 20 to 0 Boss Fight countdown are fake urgency for a kid.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('src/helpers/calmTime.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: mod, exports: mod.exports, Date, Number });
const T = mod.exports;

test('a timed find says it stays a little while, then leaves soon, in words', () => {
  assert.equal(T.stayWords(45 * 60_000), 'Here for a little while');
  assert.equal(T.stayWords(10 * 60_000 + 1), 'Here for a little while');
  assert.equal(T.stayWords(10 * 60_000), 'Leaves soon');
  assert.equal(T.stayWords(20_000), 'Leaves soon');
  assert.equal(T.stayWords(0), null, 'gone: no chip at all');
  assert.equal(T.leavesSoon(4 * 60_000), true);
  assert.equal(T.leavesSoon(30 * 60_000), false);
  // It wakes at the soon line and at zero, never once a minute.
  assert.equal(T.msUntilStayWordsChange(30 * 60_000), 20 * 60_000 + 50);
  assert.equal(T.msUntilStayWordsChange(5 * 60_000), 5 * 60_000 + 50);
  // Home treats: only their last five minutes (a calm home map).
  assert.equal(T.leavesSoon(8 * 60_000, T.HOME_LEAVES_SOON_MS), false);
  assert.equal(T.leavesSoon(4 * 60_000, T.HOME_LEAVES_SOON_MS), true);
});

test('a raid says when it ends as a time of day', () => {
  const at = new Date(2026, 10, 18, 13, 50, 0);
  assert.equal(T.endsAtWords(at), 'Ends at 1:50');
  assert.equal(T.endsAtWords(new Date(2026, 10, 18, 14, 0, 0), { lower: true }), 'ends at 2:00');
  assert.equal(T.endsAtWords(new Date(2026, 10, 18, 0, 5, 0)), 'Ends at 12:05');
  assert.equal(T.endsAtWords('not a date'), null);
  assert.equal(T.endsAtWords(null), null);
});

const minutesClock = /\d+\} ?min left|\} min left|min left`|\{mins\} min|\{minsLeft\}|\{raidMinutes\}m|\$\{Math\.ceil\(left \/ (1000|60_000)\)\}/;
test('the map, its finds and the raid screens draw no minutes and no countdown digits', () => {
  for (const file of ['src/screens/ExploreScreen/TaskMarker.tsx', 'src/screens/ExploreScreen/Coin.tsx', 'src/screens/ExploreScreen/Key.tsx',
    'src/screens/ExploreScreen/Redeemable.tsx', 'src/screens/ExploreScreen/PrepItem.tsx', 'src/screens/ExploreScreen/FindLife.tsx',
    'src/components/LiveEventsPill.tsx', 'src/components/home/HomeLive.tsx', 'src/components/boss/BossJoinCard.tsx',
    'src/games/boss/bash/BossBash.tsx']) {
    const src = read(file);
    assert.doesNotMatch(src, minutesClock, `${file}: no minutes clock`);
    assert.doesNotMatch(src, /from 'react-countdown'/, `${file}: no per-second Countdown`);
  }
  const join = read('src/components/boss/BossJoinCard.tsx');
  assert.match(join, /endsAtWords\(endsAt\)/);
  assert.doesNotMatch(join, /<GameIcon name="timer"/, 'no stopwatch on the raid sheet');
  const pill = read('src/components/LiveEventsPill.tsx');
  assert.match(pill, /export function endsLabel\(endsAt: string, now: number\): string \{/);
  assert.match(read('src/components/home/HomeLive.tsx'), /raidEnds\(liveRaid\.raid\.ends_at, \{ lower: true \}\)/);
});

test('the Boss Fight fills a round bar on the UI thread: no seconds, no 3-2-1, no victory digits', () => {
  const bash = read('src/games/boss/bash/BossBash.tsx');
  assert.doesNotMatch(bash, /function SecondsLeft|<SecondsLeft|function VictoryClock|<VictoryClock/);
  assert.doesNotMatch(bash, /addFx\(\{ t: 'count', text: String\(left\) \}/, 'no spoken 3, 2, 1');
  assert.doesNotMatch(bash, /seconds left/);
  assert.match(bash, /function RoundBar\(\{ clock \}: \{ clock: SharedValue<number> \}\)/);
  assert.match(bash, /const fill = useAnimatedStyle\(\(\) => \{\s*const p = Math\.min\(1, Math\.max\(0, clock\.value \/ ROUND_MS\)\);/);
  assert.match(bash, /<RoundBar clock=\{clock\} \/>/);
  assert.match(bash, /text: 'LAST HITS!'/);
});

test('an island shows its chip only in the last ten minutes, as LEAVES SOON', () => {
  const layout = read('src/screens/ExploreScreen/parkMapLayout.ts');
  assert.match(layout, /export const URGENT_MS = LEAVES_SOON_MS;/);
  assert.match(layout, /const showTimer = timed && !rush && expiresAt! - now <= URGENT_MS;/);
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(marker, /const showTimer = !resting && expiresAt !== null && expiresAt > Date\.now\(\) && !rush && timerUrgent;/);
  assert.match(marker, /const timerUrgent = !resting && stay === 'Leaves soon';/);
});
