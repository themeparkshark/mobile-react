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
  // T2 (arcade plan, Nov 20 2026): a ride island never wears a timer chip; the leave date is a date on the coin card.
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(marker, /const showTimer = false;/);
  assert.doesNotMatch(marker, /MarkerTimer|Leaves soon|timerUrgent/);
});

test('T006 hold: no minutes chip on a Rush island, and a placed chip never floats off its leader line', () => {
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.doesNotMatch(marker, /RUSH \{live\?\.wait \?\? rush\.wait\} MIN/, 'RUSH 15 MIN read as a clock');
  assert.match(marker, /<Text style=\{styles\.rushText\}>SHORT LINE<\/Text>/);
  // Every chip text a park island can wear: none carries a number of minutes.
  const chipTexts = [...marker.matchAll(/<Text style=\{styles\.(rushText|adventureText|goalText|limitedText)[^>]*>([^<]*)<\/Text>/g)].map(m => m[2]);
  assert.ok(chipTexts.length >= 3);
  for (const t of chipTexts) assert.doesNotMatch(t, /MIN|min\b/, `chip text ${t}`);
  // The standing lift only moves a chip with no solver slot. The solver already keeps chips off the shark
  // (tagObstacleOnly), so lifting a placed chip again left it 46 pt above its leader line (int1-25).
  assert.match(marker, /<View style=\{playable && placement\.tag === undefined \? styles\.standingLift : null\}>/);
  assert.doesNotMatch(marker, /<View style=\{playable \? styles\.standingLift : null\}>/);
});

test('T006 hold: standing at a timed island, its Leaves soon chip never sits under the coin chip beside the shark', () => {
  const map = read('src/components/Map.tsx');
  // The obstacle is the drawn chip: styles.underChip (left 80, top 34, a 46 pt disc) in the shark box grounded at (50, 100).
  assert.match(map, /const SHARK_GROUND = \{ x: 50, y: 100 \} as const;/);
  assert.match(map, /underChip: \{ position: 'absolute', left: 80, top: 34, zIndex: 3 \},/);
  assert.match(map, /underChipDisc: \{ width: 46, height: 46,/);
  assert.match(map, /export const UNDER_CHIP_BODY = \{ x: 80 - 50 - 3, y: 34 - 100 - 3, w: 46 \+ 6, h: 46 \+ 6 \} as const;/);
  assert.match(map, /\.\.\.\(underShark \? \[\{ id: 'player-chip', latitude: location\.latitude, longitude: location\.longitude, priority: 0,\n\s+tagObstacleOnly: true, body: UNDER_CHIP_BODY \}\] : \[\]\)/);
  // The solver keeps a ride's timer chip off it (Mad Tea Party, device shot h1-41: the chip read "...ves soon").
  const { loadTs } = require('./helpers/ts-module.cjs');
  const S = loadTs('src/components/map/declutter/solver.ts');
  const L = loadTs('src/screens/ExploreScreen/parkMapLayout.ts');
  const f = { latitude: 33.8135, longitude: -117.9184, zoom: 18, bearing: 0, width: 402, height: 874 };
  const ride = { id: 'ride:120', latitude: 33.8135, longitude: -117.9184, priority: 300, body: L.RIDE_BODY, group: 'ride',
    tag: L.rideTagSize('timer') };
  const chip = { x: 80 - 50 - 3, y: 34 - 100 - 3, w: 52, h: 52 };
  const items = [ride, { id: 'player', latitude: 33.8135, longitude: -117.9184, priority: 0, tagObstacleOnly: true, body: { x: -38, y: -96, w: 76, h: 102 } },
    { id: 'player-chip', latitude: 33.8135, longitude: -117.9184, priority: 0, tagObstacleOnly: true, body: chip }];
  const out = S.solveLayout(items, f);
  const p = S.project(ride.latitude, ride.longitude, f);
  const tag = out.get('ride:120').tag;
  assert.ok(tag, 'the chip still shows');
  const r = { x: p.x + tag.x, y: p.y + tag.y, w: ride.tag.w, h: ride.tag.h };
  const c = { x: p.x + chip.x, y: p.y + chip.y, w: chip.w, h: chip.h };
  assert.ok(!(r.x < c.x + c.w && c.x < r.x + r.w && r.y < c.y + c.h && c.y < r.y + r.h), `clear of the coin chip: ${JSON.stringify(r)}`);
});
