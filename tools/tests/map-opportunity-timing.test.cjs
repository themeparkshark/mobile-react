const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, extras = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Number, Math, ...extras }, { filename: file });
  return module.exports;
}
const timing = load('src/screens/ExploreScreen/mapOpportunityTiming.ts');
const now = Date.parse('2026-09-29T22:00:00Z');

test('map timers interpret database timestamps as UTC and preserve ISO offsets', () => {
  assert.equal(timing.gameTimestamp('2026-09-29 22:00:00'), now);
  assert.equal(timing.gameTimestamp('2026-09-29T22:00:00.000000Z'), now);
  assert.equal(timing.gameTimestamp('2026-09-29T15:00:00-07:00'), now);
  assert.equal(timing.gameTimestamp(null), null);
  assert.equal(timing.gameTimestamp('invalid'), null);
});
test('expired and future map opportunities are hidden without hiding permanent ride coins', () => {
  assert.equal(timing.opportunityIsActive({}, now), true);
  assert.equal(timing.opportunityIsActive({ active_to: null }, now), true);
  assert.equal(timing.opportunityIsActive({ active_to: '2026-09-29 22:00:00' }, now), false);
  assert.equal(timing.opportunityIsActive({ active_from: '2026-09-29 22:01:00' }, now), false);
  assert.equal(timing.opportunityIsActive({ active_to: 'invalid' }, now), false);
  assert.equal(timing.opportunityIsActive({ active_from: '2026-09-29 21:59:00', active_to: '2026-09-29 22:01:00' }, now), true);
});
test('map refresh targets the earliest boundary without looping on expired or invalid timers', () => {
  assert.equal(timing.nextOpportunityRefresh([{ active_to: '2026-09-29 22:00:02' }], now), 2050);
  assert.equal(timing.nextOpportunityRefresh([{ active_from: '2026-09-29 22:00:01' }], now), 1050);
  assert.equal(timing.nextOpportunityRefresh([{ active_to: '2026-09-29 21:00:00' }, { active_to: 'invalid' }], now), 60000);
});

test('a ride in range is playable only inside its window and while the live feed has it open', () => {
  const ride = (model) => ({ type: 'task', model });
  assert.equal(timing.nearbyOpportunityOpen(undefined, null, now), false);
  assert.equal(timing.nearbyOpportunityOpen(ride({}), null, now), true, 'a ride with no window is always on');
  assert.equal(timing.nearbyOpportunityOpen(ride({ active_from: '2026-09-29 22:30:00' }), null, now), false, 'resting until later');
  assert.equal(timing.nearbyOpportunityOpen(ride({ active_to: '2026-09-29 21:59:00' }), null, now), false, 'window over');
  assert.equal(timing.nearbyOpportunityOpen(ride({ active_from: '2026-09-29 21:00:00', active_to: '2026-09-29 23:00:00' }), 'OPERATING', now), true);
  for (const status of ['DOWN', 'CLOSED', 'REFURBISHMENT']) {
    assert.equal(timing.nearbyOpportunityOpen(ride({}), status, now), false, status);
  }
  assert.equal(timing.nearbyOpportunityOpen({ type: 'coin', model: { active_to: '2026-09-29 21:00:00' } }, null, now), false);
  assert.equal(timing.nearbyOpportunityOpen({ type: 'secret_task', model: {} }, 'CLOSED', now), true, 'live status is for rides only');
  assert.equal(timing.nearbyOpportunityOpen({ type: 'item', model: { active_from: '2026-09-29 23:00:00' } }, null, now), true, 'untimed kinds ignore stray fields');
});

function clock() {
  const slots = []; const timers = new Map(); let index = 0; let effects = []; let dirty = true;
  let time = now; let focused = true; let enabled = true; let listener; let calls = 0; let timerId = 0; let value;
  const items = [{ active_to: '2026-09-29 22:00:02' }];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    useState(initial) {
      const key = index++;
      slots[key] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[key].value, next => {
        const value = typeof next === 'function' ? next(slots[key].value) : next;
        if (value !== slots[key].value) { slots[key].value = value; dirty = true; }
      }];
    },
    useEffect(fn, deps) {
      const key = index++;
      if (!slots[key] || !same(slots[key].deps, deps)) {
        const previous = slots[key]; slots[key] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[key].cleanup = fn(); });
      }
    },
  };
  const DateClock = class extends Date { static now() { return time; } };
  const localTiming = load('src/screens/ExploreScreen/mapOpportunityTiming.ts', { Date: DateClock });
  const hook = load('src/hooks/useMapOpportunityClock.ts', {
    Date: DateClock,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'react') return react;
      if (name === '@react-navigation/native') return { useIsFocused: () => focused };
      if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener(event, fn) { listener = fn; return { remove() {} }; } } };
      if (name.endsWith('mapOpportunityTiming')) return localTiming;
      throw new Error(name);
    },
  }).default;
  const refresh = () => { calls++; return Promise.reject(new Error('Offline')); };
  function render() {
    let attempts = 0;
    do {
      assert.ok(attempts++ < 10); dirty = false; index = 0; effects = [];
      value = hook(items, refresh, enabled); effects.forEach(fn => fn());
    } while (dirty);
  }
  render();
  return {
    get calls() { return calls; }, get value() { return value; }, get timers() { return timers.size; },
    advance(ms) {
      time += ms;
      for (const [id, entry] of [...timers]) if (entry.at <= time) { timers.delete(id); entry.fn(); }
      render();
    },
    focus(next) { focused = next; render(); },
    foreground(next) { listener(next ? 'active' : 'background'); render(); },
    enable(next) { enabled = next; render(); },
  };
}
test('foreground map refreshes at expiry, pauses off screen, and resumes with a fresh clock', () => {
  const map = clock();
  assert.equal(map.calls, 1);
  map.advance(2050);
  assert.equal(map.calls, 2);
  assert.equal(map.value, now + 2050);
  map.advance(1000);
  assert.equal(map.calls, 2, 'failed expiry refresh does not loop');
  map.focus(false);
  assert.equal(map.timers, 0);
  map.advance(60000);
  assert.equal(map.calls, 2);
  map.focus(true);
  assert.equal(map.calls, 3);
  map.foreground(false);
  assert.equal(map.timers, 0);
  map.foreground(true);
  assert.equal(map.calls, 4);
  map.enable(false);
  assert.equal(map.timers, 0);
});

test('nearbyRideClosedReason says why a ride in range cannot be played', () => {
  const now = Date.parse('2026-10-23T18:00:00Z');
  const ride = extra => ({ type: 'task', model: { id: 1, ...extra } });
  assert.equal(timing.nearbyRideClosedReason(ride({}), 'OPERATING', now), null);
  assert.deepEqual({ ...timing.nearbyRideClosedReason(ride({ active_from: '2026-10-23 20:00:00' }), null, now) },
    { kind: 'resting', at: Date.parse('2026-10-23T20:00:00Z') });
  assert.equal(timing.nearbyRideClosedReason(ride({}), 'DOWN', now).kind, 'down');
  assert.equal(timing.nearbyRideClosedReason(ride({}), 'REFURBISHMENT', now).kind, 'repairs');
  assert.equal(timing.nearbyRideClosedReason(ride({}), 'CLOSED', now).kind, 'closed');
  assert.equal(timing.nearbyRideClosedReason(ride({ active_to: '2026-10-23 17:00:00' }), null, now).kind, 'closed');
  assert.equal(timing.nearbyRideClosedReason({ type: 'coin', model: { active_from: '2026-10-23 20:00:00' } }, null, now), null);
  assert.equal(timing.nearbyRideClosedReason(null, null, now), null);
});

test('the Ride Control bar only says every ride is open when that is true', () => {
  const open = input => timing.everyRideTrulyOpen({ loaded: true, restingCount: 0, liveStatuses: [], ...input });
  assert.equal(open({}), true);
  assert.equal(open({ liveStatuses: ['OPERATING', null, undefined] }), true);
  // Rides not loaded yet (the map call failed): never claim it.
  assert.equal(open({ loaded: false }), false);
  // A ride resting until "Back 2:15 PM" sits on the map.
  assert.equal(open({ restingCount: 1 }), false);
  // A ride the live feed shows down, closed or in refurbishment.
  for (const status of ['DOWN', 'CLOSED', 'REFURBISHMENT']) assert.equal(open({ liveStatuses: ['OPERATING', status] }), false);
});
