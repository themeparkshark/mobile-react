'use strict';
// Living map, part 5: the night show synced to real showtimes, and friends as ghost sharks.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const night = loadTs('src/components/map/alive/nightShow.ts');
const friends = loadTs('src/components/map/alive/friendsNearby.ts');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

const CURVE = [[0, 0.6], [0.03, 0.85], [0.08, 0.35], [0.3, 0.75], [0.36, 0.3], [0.6, 0.8], [0.87, 1], [0.985, 1], [1, 0]];
const show = (starts, ends, extra = {}) => ({
  kind: 'fireworks', label: 'Fireworks', where: 'Over the castle', starts_at: starts, ends_at: ends,
  duration_seconds: (Date.parse(ends) - Date.parse(starts)) / 1000, finale_seconds: 120, finale_fireworks: true,
  anchor: { latitude: 28.41985, longitude: -81.58125 }, curve: CURVE, timezone: 'America/New_York', ...extra,
});
const MK = show('2026-10-05T21:00:00-04:00', '2026-10-05T21:18:00-04:00');

test('phases: teaser in the hour before, live during, done after', () => {
  const at = iso => night.showPhase(MK, Date.parse(iso));
  assert.equal(at('2026-10-05T19:59:00-04:00'), 'none');
  assert.equal(at('2026-10-05T20:00:00-04:00'), 'teaser');
  assert.equal(at('2026-10-05T20:59:59-04:00'), 'teaser');
  assert.equal(at('2026-10-05T21:00:00-04:00'), 'live');
  assert.equal(at('2026-10-05T21:17:59-04:00'), 'live');
  assert.equal(at('2026-10-05T21:18:00-04:00'), 'done');
  assert.equal(night.showPhase(null, Date.now()), 'none');
  assert.equal(night.showPhase(show('nope', 'nope'), Date.now()), 'none', 'bad times: no show');
});

test('time zones: the teaser reads park time whatever the phone is set to, and phases are absolute instants', () => {
  assert.equal(night.teaserText(MK), 'Fireworks tonight at 9:00 PM');
  const anaheim = show('2026-10-01T21:30:00-07:00', '2026-10-01T21:40:00-07:00', { timezone: 'America/Los_Angeles' });
  assert.equal(night.teaserText(anaheim), 'Fireworks tonight at 9:30 PM');
  // The same instant in UTC: 04:30Z is 9:30 PM in Anaheim, live there.
  assert.equal(night.showPhase(anaheim, Date.parse('2026-10-02T04:35:00Z')), 'live');
  assert.equal(night.showPhase(MK, Date.parse('2026-10-06T01:05:00Z')), 'live', '01:05Z is 9:05 PM in Orlando');
  assert.equal(night.parkClock('2026-10-05T00:15:00-04:00'), '12:15 AM');
  assert.equal(night.parkClock('2026-10-05T12:05:00-04:00'), '12:05 PM');
  assert.equal(night.parkClock('garbage'), null);
  assert.equal(night.liveText(MK), 'Fireworks now! Over the castle');
  for (const text of [night.teaserText(MK), night.liveText(MK)]) assert.ok(!/[—–]/.test(text), 'no em or en dashes');
});

test('a show crossing midnight stays live past 12 AM and ends on time', () => {
  const late = show('2026-10-01T23:50:00-04:00', '2026-10-02T00:10:00-04:00');
  assert.equal(night.teaserText(late), 'Fireworks tonight at 11:50 PM');
  assert.equal(night.showPhase(late, Date.parse('2026-10-01T23:00:00-04:00')), 'teaser');
  assert.equal(night.showPhase(late, Date.parse('2026-10-02T00:05:00-04:00')), 'live');
  assert.equal(night.showPhase(late, Date.parse('2026-10-02T00:10:00-04:00')), 'done');
  assert.equal(Math.round(night.showSecond(late, Date.parse('2026-10-02T00:05:00-04:00'))), 900, '15 minutes in');
  const encore = show('2026-10-02T00:15:00-04:00', '2026-10-02T00:25:00-04:00');
  assert.equal(night.teaserText(encore), 'Fireworks tonight at 12:15 AM');
});

test('intensity follows the arc and is zero outside the show', () => {
  assert.equal(night.intensityAt(CURVE, -0.1), 0);
  assert.equal(night.intensityAt(CURVE, 1.1), 0);
  assert.equal(night.intensityAt(CURVE, 0), 0.6);
  assert.equal(night.intensityAt(CURVE, 0.9), 1);
  assert.equal(night.intensityAt(CURVE, 1), 0);
  assert.ok(Math.abs(night.intensityAt(CURVE, 0.015) - 0.725) < 1e-9, 'linear between points');
  assert.equal(night.intensityAt([], 0.5), 0);
});

test('the burst schedule is deterministic, capped, and its finale lands on the real end', () => {
  const bursts = night.burstSchedule(MK);
  assert.deepEqual(plain(night.burstSchedule(MK)), plain(bursts), 'same show, same bursts');
  assert.ok(bursts.length > 300 && bursts.length <= night.MAX_BURSTS, `${bursts.length} bursts`);
  for (let i = 1; i < bursts.length; i++) assert.ok(bursts[i].t >= bursts[i - 1].t, 'time ordered');
  const duration = MK.duration_seconds;
  assert.ok(bursts.every(b => b.t >= 0 && b.t < duration), 'nothing after the show ends');
  assert.ok(duration - bursts[bursts.length - 1].t <= 2.5, 'the last burst lands within seconds of the real end');
  const rate = (from, to) => bursts.filter(b => b.t >= from && b.t < to).length / (to - from);
  const finale = rate(duration - MK.finale_seconds, duration);
  assert.ok(finale > rate(0, duration - MK.finale_seconds) * 2, 'the finale is a barrage');
  assert.ok(rate(0.08 * duration, 0.2 * duration) < rate(0.27 * duration, 0.33 * duration), 'quiet story beats, then a peak');
  assert.ok(bursts.every(b => b.type <= 1), 'fireworks only');
  const water = night.burstSchedule({ ...MK, kind: 'water', finale_fireworks: false });
  assert.ok(water.every(b => b.type === 2), 'a water show is fountains');
  const ending = night.burstSchedule({ ...MK, kind: 'water', finale_fireworks: true });
  assert.ok(ending.some(b => b.type <= 1) && ending.filter(b => b.type <= 1).every(b => b.t >= duration - MK.finale_seconds),
    'a water show that ends in fireworks fires them only in the finale');
  // A very long show is still capped.
  const long = show('2026-10-05T21:00:00-04:00', '2026-10-06T03:00:00-04:00');
  assert.ok(night.burstSchedule(long).length <= night.MAX_BURSTS);
  assert.deepEqual(plain(night.burstSchedule({ ...MK, duration_seconds: 0 })), []);
});

test('ghost sharks: fresh friends in range only, fading with age, nearest first, capped', () => {
  const now = Date.parse('2026-10-01T20:00:00Z');
  const me = { latitude: 28.4185, longitude: -81.5812 };
  const ago = minutes => new Date(now - minutes * 60_000).toISOString();
  const north = m => me.latitude + m / 111320;
  const list = [
    { id: 1, name: 'Ava', latitude: north(80), longitude: me.longitude, seen_at: ago(1) },
    { id: 2, name: 'Ben', latitude: north(20), longitude: me.longitude, seen_at: ago(6) },
    { id: 3, name: 'Cy', latitude: north(900), longitude: me.longitude, seen_at: ago(1) },
    { id: 4, name: 'Di', latitude: north(10), longitude: me.longitude, seen_at: ago(12) },
    { id: 5, name: 'Ed', latitude: Number.NaN, longitude: me.longitude, seen_at: ago(1) },
  ];
  const ghosts = friends.ghostSharks(list, me, now, 5);
  assert.deepEqual(plain(ghosts.map(g => g.name)), ['Ben', 'Ava'], 'out of range, stale and broken entries drop');
  assert.equal(ghosts[1].fade, 1, 'fresh');
  assert.ok(ghosts[0].fade < 1 && ghosts[0].fade > 0.35, 'fading');
  assert.equal(friends.ghostSharks(list, me, now, 1).length, 1);
  assert.deepEqual(plain(friends.ghostSharks(undefined, me, now, 5)), []);
});

test('the night show is wired to the map: pill only in a free slot, layer over the anchor, our own sound', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  // The show joins the one HUD row; the status stack ranks it (live outranks Fin-ister, a teaser waits behind it).
  assert.match(explore, /const nightPill = !!nightShow\.show && \(nightShow\.phase === 'teaser' \|\| nightShow\.phase === 'live'\)/);
  assert.match(explore, /show: nightPill \? \(nightShow\.phase === 'live' \? 'live' : 'teaser'\) : null/);
  assert.match(explore, /<NightShowLayer show=\{nightShow\.show\} live=\{nightShow\.phase === 'live'\} \/>/);
  const layer = read('src/components/map/alive/NightShowLayer.tsx');
  assert.match(layer, /const on = live && running && slots > 0 && bursts\.length > 0/, 'Reduce Motion (calm) and a paused map draw nothing');
  assert.match(layer, /<Marker coordinate=\{show\.anchor\}/);
  assert.match(layer, /firework_pop\.mp3/);
  assert.ok(fs.existsSync(path.join(__dirname, '../../assets/sounds/firework_pop.mp3')));
  const api = read('src/api/endpoints/parks/nightShow.ts');
  assert.match(api, /catch \{\n    return null;/, 'no data or an error is simply no show');
});
