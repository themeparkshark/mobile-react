const assert = require('node:assert/strict');
const test = require('node:test');
const { load, T, reef, north } = require('./helpers/fright-fixtures.cjs');

const finds = load('finds');
const now = T('2026-10-09T21:00:00-04:00');
const carnival = reef('usf26-tidepool-carnival');
const far = reef('usf26-clown-cove', { latitude: carnival.latitude + 0.01 });
const fix = (meters, at, accuracy = 10) => ({ ...north(carnival, meters), accuracy, at });

test('F1: two fixes >= 45 s apart, both inside the reef radius, find it; the first fix is held', () => {
  let step = finds.reefStep(null, [carnival, far], [], fix(20, now));
  assert.equal(step.hold.key, carnival.key);
  assert.equal(step.found, null);
  step = finds.reefStep(step.hold, [carnival, far], [], fix(30, now + 30_000));
  assert.equal(step.found, null, '30 s is too soon');
  step = finds.reefStep(step.hold, [carnival, far], [], fix(25, now + 45_000));
  assert.equal(step.found.key, carnival.key);
  assert.equal(step.found.fixes[0].at, now);
  assert.equal(step.found.fixes[1].at, now + 45_000);
  assert.equal(step.hold, null);
});

test('F1: leaving the reef drops the hold; found tonight is skipped; poor accuracy is ignored', () => {
  let step = finds.reefStep(null, [carnival], [], fix(20, now));
  step = finds.reefStep(step.hold, [carnival], [], fix(150, now + 20_000));
  assert.equal(step.hold, null);
  step = finds.reefStep(step.hold, [carnival], [], fix(20, now + 50_000));
  assert.equal(step.found, null, 'the clock restarts on re-entry');
  assert.equal(finds.reefStep(null, [carnival], [carnival.key], fix(20, now)).hold, null, 'once per night');
  const held = finds.reefStep(null, [carnival], [], fix(20, now)).hold;
  assert.equal(finds.reefStep(held, [carnival], [], fix(20, now + 60_000, 80)).found, null, 'a poor fix never finds');
  assert.equal(Object.keys(finds.toWireFix(fix(1, now))).sort().join(','), 'accuracy,at,latitude,longitude');
});

test('F3: the encounter is catchable only while live, within 40 m; the first catch of the night picks a side', () => {
  const encounter = { key: 'enc-chuckles', critter: 'chuckles', name: 'Chuckles the Chum Jester', line: 'Something is giggling.',
    latitude: carnival.latitude, longitude: carnival.longitude, radius: 0,
    starts_at: '2026-10-09T23:08:00-04:00', ends_at: '2026-10-09T23:15:00-04:00', caught: false };
  const inWindow = T('2026-10-09T23:11:00-04:00');
  assert.equal(finds.encounterLive(encounter, inWindow), true);
  assert.equal(finds.encounterLive(encounter, T('2026-10-09T23:15:00-04:00')), false);
  assert.equal(finds.encounterLive({ ...encounter, caught: true }, inWindow), false);
  assert.equal(finds.encounterInRange(encounter, fix(35, inWindow), inWindow), true);
  assert.equal(finds.encounterInRange(encounter, fix(45, inWindow), inWindow), false, '40 m default');
  assert.equal(finds.encounterInRange(encounter, fix(10, inWindow, 90), inWindow), false, 'poor fix');
  assert.equal(finds.encounterMinutesLeft(encounter, inWindow), 4);
  assert.equal(finds.needsSidePick({ side: null }), true);
  assert.equal(finds.needsSidePick({ side: 'chaos' }), false);
  assert.equal(finds.needsSidePick({ side: null }, 'control'), false, 'a side picked offline tonight counts');
});
