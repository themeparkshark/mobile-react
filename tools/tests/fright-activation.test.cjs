const assert = require('node:assert/strict');
const test = require('node:test');
const { load, T, tonight, event, USH_NIGHT } = require('./helpers/fright-fixtures.cjs');

const phase = load('phase');
const hooks = load('hooks');
const store = hooks;
const config = load('config');

const live = T('2026-10-09T20:00:00-04:00');

test('R6: mode ON needs the LocationContext park to be the event park AND early/live/last_call', () => {
  assert.equal(phase.isModeOn({ locationParkId: 3, tonight: tonight(), now: live }), true);
  assert.equal(phase.isModeOn({ locationParkId: 1, tonight: tonight(), now: live }), false, 'other park');
  assert.equal(phase.isModeOn({ locationParkId: null, tonight: tonight(), now: live }), false, 'not in a park');
  assert.equal(phase.isModeOn({ locationParkId: 3, tonight: tonight(), now: T('2026-10-10T02:30:00-04:00') }), false, 'after');
  assert.equal(phase.isModeOn({ locationParkId: 3, tonight: tonight(), now: T('2026-10-10T01:45:00-04:00') }), true, 'last call');
  assert.equal(phase.isModeOn({ locationParkId: 3, tonight: tonight({ enabled: false }), now: live }), false, 'kill switch');
  assert.equal(phase.isModeOn({ locationParkId: 3, tonight: tonight({ event: null }), now: live }), false);
  const ush = tonight({ event: event(1), night: USH_NIGHT });
  assert.equal(phase.isModeOn({ locationParkId: 1, tonight: ush, now: T('2026-10-09T17:30:00-07:00') }), true, 'early access');
});

test('L6: frightPhotoTheme gives the spooky variant only while the mode is ON; isFrightModeOn reads the snapshot', () => {
  assert.equal(hooks.frightPhotoTheme({ modeOn: false }), null);
  const theme = hooks.frightPhotoTheme({ modeOn: true });
  assert.equal(theme.backdrop, 'farNight');
  assert.equal(theme.frame, 'lantern');
  assert.match(theme.tint, /^rgba\(/);
  assert.equal(hooks.isFrightModeOn(), false);
  store.publishFrightSnapshot({ ...store.FRIGHT_OFF, modeOn: true, phase: 'live', parkId: 3 });
  assert.equal(hooks.isFrightModeOn(), true);
  assert.notEqual(hooks.frightPhotoTheme(), null);
  assert.equal(hooks.isFrightModeOn({ locationParkId: 1, tonight: tonight(), now: live }), false);
  store.publishFrightSnapshot(store.FRIGHT_OFF);
});

test('mode name lives in ONE config and prefers the server event.title', () => {
  assert.equal(config.FRIGHT_MODE_NAME, 'Fin-ister Nights');
  assert.equal(config.frightModeName(null), 'Fin-ister Nights');
  assert.equal(config.frightModeName({ title: '  ' }), 'Fin-ister Nights');
  assert.equal(config.frightModeName({ title: 'Fin-ister Nights 2027' }), 'Fin-ister Nights 2027');
});
