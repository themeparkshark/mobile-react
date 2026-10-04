'use strict';
// Living map, part 4: player presence (sparkle trail, arrival burst, collect flight).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const presence = loadTs('src/components/map/alive/presence.ts');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const BASE = { latitude: 28.4177, longitude: -81.5812 };
const north = meters => ({ latitude: BASE.latitude + meters / 111320, longitude: BASE.longitude });

test('the trail drops a sparkle every few metres of real walking, capped', () => {
  let trail = [];
  for (let m = 0, t = 0; m <= 40; m += 5, t += 10_000) trail = presence.pushTrail(trail, north(m), t, { cap: 6 });
  assert.equal(trail.length, 4, 'only the sparkles still glowing (40 s life at 10 s a step)');
  assert.ok(presence.TRAIL_LIFE_MS >= 30_000, 'lingers long enough to peek out from under the shark');
  trail = [];
  for (let m = 0; m <= 40; m += 5) trail = presence.pushTrail(trail, north(m), 0, { cap: 6 });
  assert.equal(trail.length, 6, 'capped at the tier budget');
  assert.deepEqual(plain(trail.map(p => p.id)), [4, 5, 6, 7, 8, 9], 'ids keep counting so markers never reuse a key');
});

test('standing still adds nothing; a GPS jump clears the trail instead of streaking across the park', () => {
  let trail = presence.pushTrail([], north(0), 0, { cap: 6 });
  const same = presence.pushTrail(trail, north(1.5), 100, { cap: 6 });
  assert.equal(same, trail, 'GPS wobble under 4 m is not walking (same array, no re-render)');
  trail = presence.pushTrail(trail, north(6), 200, { cap: 6 });
  assert.equal(trail.length, 2);
  const jumped = presence.pushTrail(trail, north(300), 300, { cap: 6 });
  assert.equal(jumped.length, 1, 'a 294 m jump starts over');
  assert.equal(presence.pushTrail(trail, north(10), 300, { cap: 0 }).length, 0, 'calm leaves no trail');
  assert.equal(presence.pushTrail([], { latitude: Number.NaN, longitude: 1 }, 0, { cap: 6 }).length, 0);
});

test('arrival bursts once per ride per ten minutes', () => {
  assert.equal(presence.arrivalBurstAllowed(undefined, 0), true);
  assert.equal(presence.arrivalBurstAllowed(0, 60_000), false, 'GPS dipping in and out of range');
  assert.equal(presence.arrivalBurstAllowed(0, presence.ARRIVAL_COOLDOWN_MS), true);
});

test('the collected coin arcs above both ends and lands exactly on the shelf button', () => {
  const from = { x: 200, y: 420 };
  const to = { x: 340, y: 720 };
  assert.deepEqual(plain(presence.flightPoint(from, to, 0)), from);
  assert.deepEqual(plain(presence.flightPoint(from, to, 1)), to);
  assert.deepEqual(plain(presence.flightPoint(from, to, 2)), to, 'clamped');
  let highest = Infinity;
  let lastX = -Infinity;
  for (let t = 0; t <= 1; t += 0.05) {
    const p = presence.flightPoint(from, to, t);
    highest = Math.min(highest, p.y);
    assert.ok(p.x >= lastX - 1e-9, 'always heading toward the shelf');
    lastX = p.x;
  }
  assert.ok(highest < from.y - 40, 'tossed up before it falls onto the shelf');
  assert.equal(presence.metersBetween(BASE, north(25)).toFixed(1), '25.0');
});

test('presence is wired: trail under the islands, arrival burst on entering range, flight after the reward closes', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<SharkWake moving=\{wake\} trail=\{wakeTrail\} \/>/, 'the wake rides with the shark while it walks');
  assert.match(map, /const walking = distMeters >= 1 && distMeters < 60 && /, 'GPS wobble and jumps do not stir the wake');
  const trail = map.indexOf('<SharkTrail');
  assert.ok(trail > 0 && trail < map.indexOf('{children}</MapQueryContext.Provider>'));
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(marker, /if \(playable && !wasPlayable\.current && arrivalBurstAllowed\(lastArrival\.get\(task\.id\), Date\.now\(\)\)\)/);
  assert.match(marker, /if \(!calm\) setBurst/, 'Reduce Motion keeps the buzz but skips the burst');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /if \(!pendingCollect \|\| redeemFlowOpen\) return;/, 'waits for the reward flow to close');
  assert.match(explore, /if \(!mapFocusedRef\.current\) return;/, '"View coin" leaves the map: no flight');
  assert.match(explore, /<Animated\.View ref=\{avatarRef\}/);
});
