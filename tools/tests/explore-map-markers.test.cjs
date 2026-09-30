const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const m = loadTs('src/screens/ExploreScreen/mapMarkerPresentation.ts');

test('ring colours: no neon green; red only in the last five minutes', () => {
  assert.equal(m.markerRingColor({ rush: false, team: null, urgent: false, near: false }), '#0879ca');
  assert.equal(m.markerRingColor({ rush: false, team: null, urgent: false, near: true }), '#ffcf3b');
  assert.equal(m.markerRingColor({ rush: false, team: null, urgent: true, near: true }), '#ef4a3c');
  assert.equal(m.markerRingColor({ rush: false, team: '#123456', urgent: true, near: false }), '#123456');
  assert.equal(m.markerRingColor({ rush: true, team: '#123456', urgent: true, near: false }), '#ffcf3b');
  for (const args of [[false, null, false, false], [false, null, false, true], [false, null, true, false]]) {
    assert.notEqual(m.markerRingColor({ rush: args[0], team: args[1], urgent: args[2], near: args[3] }).toLowerCase(), '#4ade80');
  }
});

test('one badge per island: rush > adventure > goal > collection state', () => {
  assert.equal(m.markerBadge({ rush: true, adventure: true, goal: true, owned: false }), 'rush');
  assert.equal(m.markerBadge({ rush: false, adventure: true, goal: true, owned: false }), 'adventure');
  assert.equal(m.markerBadge({ rush: false, adventure: false, goal: true, owned: false }), 'goal');
  assert.equal(m.markerBadge({ rush: false, adventure: false, goal: false, owned: false }), 'new');
  assert.equal(m.markerBadge({ rush: false, adventure: false, goal: false, owned: true }), 'level');
});

test('declutter: rides within 48px fold under the highest priority island; the selected ride stands alone', () => {
  // The USH stack: a dozen rides 1-2 m apart at follow zoom.
  const stack = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, latitude: 34.13808 + i * 0.00001, longitude: -118.3538 }));
  const far = { id: 99, latitude: 34.1400, longitude: -118.3538 };
  const clusters = m.clusterMarkers([...stack, far], 17.6);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].members.length, 11);
  const withPriority = m.clusterMarkers(stack.map(item => item.id === 7 ? { ...item, priority: 50 } : item), 17.6);
  assert.equal(withPriority[0].lead.id, 7, 'the adventure ride leads its island');
  const pinned = m.clusterMarkers(stack.map(item => item.id === 3 ? { ...item, pinned: true } : item), 17.6);
  assert.equal(pinned.find(c => c.lead.id === 3).members.length, 0);
  assert.equal(pinned.length, 2);
  // Zoomed far in, 48px is under a metre: nothing folds.
  assert.equal(m.clusterMarkers(stack, 22).length, 12);
});

test('metres per pixel follows 512px tiles, and the reveal stagger is capped', () => {
  assert.ok(Math.abs(m.metersPerPixel(17.6, 34.138) - 0.327) < 0.01);
  assert.deepEqual(plain([...m.revealDelays([5, 6, 7], 55, 100)]), [[5, 0], [6, 55], [7, 100]]);
  assert.match(m.restingLabel(Date.parse('2026-09-30T21:00:00Z'), 'en-US'), /^Back \d{1,2}:00 (AM|PM)$/);
});
