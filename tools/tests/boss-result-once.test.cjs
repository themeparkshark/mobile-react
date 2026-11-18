// T002: BOSS RAID OVER reopened on every map focus (COLLECT returned early on an owner check, so the
// key was never stored and the raid never acknowledged), and it opened by itself while walking.
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
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: name => requireMap[name] ?? {}, Date, Math, Number });
  return mod.exports;
};
const still = load('src/hooks/useStillMoment.ts', { react: { useEffect() {}, useRef() { return {}; }, useState() { return [false, () => {}]; } } });
const queue = load('src/screens/ExploreScreen/mapPresentationQueue.ts', { '../../components/map/statusStack': { HUD_BOTTOM: 0 } });
const flow = read('src/components/boss/BossRaidFlow.tsx');

test('a still moment means staying within a few metres for a while', () => {
  const t0 = 1_000_000;
  let a = still.nextStillAnchor(null, { latitude: 33.81, longitude: -117.919 }, t0);
  assert.equal(still.isStill(a, t0 + 5000), false);
  a = still.nextStillAnchor(a, { latitude: 33.81003, longitude: -117.919 }, t0 + 6000); // about 3 m of GPS drift
  assert.equal(a.since, t0, 'drift keeps the anchor');
  assert.equal(still.isStill(a, t0 + still.STILL_HOLD_MS), true);
  a = still.nextStillAnchor(a, { latitude: 33.8104, longitude: -117.919 }, t0 + 20_000); // 44 m: walking
  assert.equal(a.since, t0 + 20_000, 'a step restarts the clock');
  assert.equal(still.isStill(a, t0 + 21_000), false);
  assert.equal(still.isStill(null, t0), false, 'no fix: not still');
});

test('the raid result waits out the first 30 s at a park and a game, but not the guide walk state', () => {
  const base = { atPark: true, now: 100_000, arrivedAt: 50_000, walkingToTarget: true, playing: false, winCardClosedAt: null, autoOpenUsed: false };
  assert.equal(queue.autoOpenAllowed('raid_result', base), true, 'guide says walk, the player stands still: allowed');
  assert.equal(queue.autoOpenAllowed('raid_result', { ...base, arrivedAt: 80_000 }), false, 'first 30 s');
  assert.equal(queue.autoOpenAllowed('raid_result', { ...base, playing: true }), false);
  assert.equal(queue.autoOpenAllowed('raid_result', { ...base, autoOpenUsed: true }), false, 'one automatic open per app open');
  assert.equal(queue.autoOpenAllowed('event_recap', base), false, 'other kinds still wait for the walk to end');
});

test('COLLECT always stores the key and acknowledges the raid it showed', () => {
  const dismiss = flow.slice(flow.indexOf('const dismissCelebration = () => {'), flow.indexOf('const closeSheet = '));
  assert.doesNotMatch(dismiss, /if \(owner\.current !== ownerKey\) return;/, 'no early return before storing');
  assert.match(dismiss, /AsyncStorage\.setItem\(celebratedKey\(owned, celebrate\.id\), '1'\)/);
  assert.match(dismiss, /acknowledgeRaid\(celebrate\.id\)/);
  assert.ok(dismiss.indexOf('acknowledgeRaid') < dismiss.indexOf('onClose()'), 'settled before the sheet closes');
});

test('the card opens by itself only at a still moment, once per session, through the attention queue', () => {
  const effect = flow.slice(flow.indexOf('const still = useStillMoment(location);'), flow.indexOf('const dismissCelebration'));
  assert.match(effect, /if \(presentedThisSession\.has\(key\)\) return;/, 'a remounted map never puts it up again');
  assert.match(effect, /if \(!asked && !stillRef\.current\) return;/, 'never while walking');
  assert.match(effect, /attentionGate\.request\('raid_result'\)/);
  assert.match(effect, /presentedThisSession\.add\(key\);/);
  assert.match(flow, /^const presentedThisSession = new Set<string>\(\);/m, 'module level: survives a remount');
});
