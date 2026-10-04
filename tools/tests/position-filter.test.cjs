const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/position-filter.test.cjs
// The shark stood still while the phone's GPS wandered: these traces are the
// jitter patterns from a phone indoors, between buildings and walking, and
// the filter must keep the shark calm without losing a real walk.

const pf = loadTs('src/context/positionFilter.ts');

// Seeded noise so a trace is the same on every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function gauss(r) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const M_PER_DEG_LAT = 111_320;
const HOME = { latitude: 33.81, longitude: -117.92 };
function offset(p, northM, eastM) {
  return { latitude: p.latitude + northM / M_PER_DEG_LAT,
    longitude: p.longitude + eastM / (M_PER_DEG_LAT * Math.cos(p.latitude * Math.PI / 180)) };
}
function run(filter, fixes) {
  const published = [];
  const verdicts = fixes.map(fix => {
    const v = filter.push(fix);
    if (v.kind === 'publish') published.push({ ...v.position, t: fix.timestamp });
    return v;
  });
  return { published, verdicts };
}

/** Standing still indoors: 1 Hz fixes, 12 to 30 m accuracy, the reported points wander about that much. */
function standingTrace(seed, seconds = 120) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < seconds; i++) {
    const acc = 12 + 18 * r();
    out.push({ ...offset(HOME, gauss(r) * acc * 0.6, gauss(r) * acc * 0.6), accuracy: acc, speed: -1, timestamp: 1e12 + i * 1000 });
  }
  return out;
}

test('standing still with wandering GPS: the shark barely moves and soon settles', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const trace = standingTrace(seed);
    const { published } = run(new pf.PositionFilter(), trace);
    const rawSpread = Math.max(...trace.map(f => pf.metersBetween(HOME, f)));
    const shown = Math.max(...published.map(p => pf.metersBetween(HOME, p)));
    assert.ok(rawSpread > 25, `trace ${seed} is really jittery (${rawSpread.toFixed(1)} m)`);
    assert.ok(shown < rawSpread / 2, `seed ${seed}: shark stays near home (${shown.toFixed(1)} m vs raw ${rawSpread.toFixed(1)} m)`);
    // After the first 20 s the estimate has settled: few, small moves.
    const late = published.filter(p => p.t >= 1e12 + 20_000);
    assert.ok(late.length <= 12, `seed ${seed}: ${late.length} moves in 100 s of standing still`);
    for (let i = 1; i < published.length; i++) {
      assert.ok(pf.metersBetween(published[i - 1], published[i]) < 15, `seed ${seed}: no hop over 15 m while standing`);
    }
  }
});

test('a single far-off fix (multipath, a cell fix) never moves the shark', () => {
  const trace = standingTrace(7, 30);
  trace[10] = { ...offset(HOME, 400, -250), accuracy: 15, speed: -1, timestamp: trace[10].timestamp };
  trace[20] = { ...offset(HOME, -90, 60), accuracy: 120, speed: -1, timestamp: trace[20].timestamp };
  const filter = new pf.PositionFilter();
  const { published, verdicts } = run(filter, trace);
  assert.equal(verdicts[10].kind, 'reject');
  assert.equal(verdicts[10].reason, 'speed');
  assert.equal(verdicts[20].kind, 'reject');
  assert.equal(verdicts[20].reason, 'inaccurate');
  for (const p of published) assert.ok(pf.metersBetween(HOME, p) < 30, 'the outliers never reach the map');
});

test('a fix vaguer than the estimate is skipped, but a long run indoors is still taken (lightly)', () => {
  const filter = new pf.PositionFilter();
  filter.push({ ...HOME, accuracy: 8, timestamp: 0 });
  const far = offset(HOME, 30, 0);
  const v1 = filter.push({ ...far, accuracy: 65, timestamp: 1000 });
  assert.equal(v1.kind, 'reject');
  filter.push({ ...far, accuracy: 65, timestamp: 2000 });
  const v3 = filter.push({ ...far, accuracy: 65, timestamp: 3000 });
  assert.notEqual(v3.kind, 'reject', 'a run of vague fixes is not ignored forever');
  const est = filter.current;
  assert.ok(pf.metersBetween(HOME, est) < 6, 'and a vague fix only nudges a precise estimate');
});

test('walking: the shark follows the real path closely and moves on almost every step', () => {
  const r = rng(11);
  const fixes = [];
  const truth = [];
  for (let i = 0; i < 90; i++) {
    const t = offset(HOME, i * 1.4, i * 0.3); // 1.43 m/s
    truth.push(t);
    fixes.push({ ...offset(t, gauss(r) * 4, gauss(r) * 4), accuracy: 6 + 4 * r(), speed: 1.4, timestamp: i * 1000 });
  }
  const filter = new pf.PositionFilter();
  const { published, verdicts } = run(filter, fixes);
  assert.ok(published.length >= 60, `kept up with the walk (${published.length} moves in 90 s)`);
  assert.equal(verdicts.filter(v => v.kind === 'reject').length, 0);
  // Lag and noise both stay small against the true path.
  let worst = 0;
  for (let i = 20; i < 90; i++) {
    if (verdicts[i].kind !== 'publish') continue;
    worst = Math.max(worst, pf.metersBetween(truth[i], verdicts[i].position));
  }
  assert.ok(worst < 10, `within 10 m of the real path (worst ${worst.toFixed(1)} m)`);
  const end = pf.metersBetween(truth[89], filter.current);
  assert.ok(end < 6, `ends near the real spot (${end.toFixed(1)} m)`);
});

test('really somewhere else (out of the car at the park): the filter re-seats after a short run', () => {
  const filter = new pf.PositionFilter();
  for (let i = 0; i < 5; i++) filter.push({ ...HOME, accuracy: 10, timestamp: i * 1000 });
  const park = offset(HOME, 3000, 0);
  const verdicts = [5, 6, 7].map(i => filter.push({ ...park, accuracy: 10, timestamp: i * 1000 }));
  assert.equal(verdicts[0].kind, 'reject');
  assert.equal(verdicts[2].kind, 'publish');
  assert.equal(verdicts[2].reseated, true);
  assert.ok(pf.metersBetween(park, filter.current) < 1);
});

test('back after a long silence (app in the background): the next fix is taken straight away', () => {
  const filter = new pf.PositionFilter();
  filter.push({ ...HOME, accuracy: 10, timestamp: 0 });
  const later = offset(HOME, 800, 0);
  const v = filter.push({ ...later, accuracy: 10, timestamp: 5 * 60_000 });
  assert.equal(v.kind, 'publish');
  assert.ok(pf.metersBetween(later, v.position) < 1);
});

test('broken fixes are refused: NaN, (0,0), out of range, and out of order', () => {
  const filter = new pf.PositionFilter();
  assert.equal(filter.push({ latitude: NaN, longitude: 1, timestamp: 0 }).kind, 'reject');
  assert.equal(filter.push({ latitude: 0, longitude: 0, timestamp: 0 }).kind, 'reject');
  assert.equal(filter.push({ latitude: 95, longitude: 0, timestamp: 0 }).kind, 'reject');
  assert.equal(filter.current, null, 'nothing published yet');
  filter.push({ ...HOME, accuracy: 10, timestamp: 10_000 });
  const old = filter.push({ ...offset(HOME, 5, 5), accuracy: 5, timestamp: 9_000 });
  assert.equal(old.kind, 'reject');
  assert.equal(old.reason, 'stale');
});

test('the first fix shows the shark at once, however vague it is', () => {
  const filter = new pf.PositionFilter();
  const v = filter.push({ ...HOME, accuracy: 120, timestamp: 0 });
  assert.equal(v.kind, 'publish');
  // and a better fix right after is accepted, never "inaccurate"
  const v2 = filter.push({ ...offset(HOME, 40, 0), accuracy: 10, timestamp: 1000 });
  assert.notEqual(v2.kind, 'reject');
});

const glide = loadTs('src/components/map/glide.ts');

test('the shark glides 600 to 1000 ms between fixes, jumps only for a re-seat', () => {
  assert.equal(glide.glideDurationMs(HOME, offset(HOME, 2, 0)), 600, 'a step');
  assert.equal(glide.glideDurationMs(HOME, offset(HOME, 10, 0)), 800, 'a stride');
  assert.equal(glide.glideDurationMs(HOME, offset(HOME, 40, 0)), 1000, 'capped at 1 s');
  assert.equal(glide.glideDurationMs(HOME, offset(HOME, 400, 0)), 0, 'a re-seat jumps');
  assert.equal(glide.glideDurationMs(HOME, offset(HOME, 0.1, 0)), 0, 'nothing to see');
  const mid = glide.glidePoint(HOME, offset(HOME, 10, 0), 0.5);
  const d = pf.metersBetween(HOME, mid);
  assert.ok(d > 5 && d < 10, `ease-out: past halfway at half time (${d.toFixed(2)} m)`);
  const end = glide.glidePoint(HOME, offset(HOME, 10, 0), 1);
  assert.equal(end.latitude, offset(HOME, 10, 0).latitude);
  assert.equal(end.longitude, offset(HOME, 10, 0).longitude);
});

test('the player shark glides as one stable marker and the watcher filters every fix', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
  const gliding = read('src/components/map/GlidingMarker.tsx');
  // Same Marker every frame: only the coordinate prop changes, never a key or a remount.
  assert.doesNotMatch(gliding, /key=/);
  assert.match(gliding, /<Marker coordinate=\{shown\} hidden=\{hidden\} anchor=\{anchor\}>/);
  const provider = read('src/context/LocationProvider.tsx');
  const watcher = provider.slice(provider.indexOf('Location.watchPositionAsync('), provider.indexOf('restartAfterError,', provider.indexOf('Location.watchPositionAsync(')));
  assert.match(watcher, /positionFilter\(\)\.push\(/);
  assert.match(watcher, /accuracy: locationUpdate\.coords\.accuracy/);
  assert.match(watcher, /if \(verdict\.kind !== 'publish'\) return;/);
  assert.match(provider, /positionFilterRef\.current\?\.reset\(\)/);
});
