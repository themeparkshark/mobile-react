const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const layout = loadTs('src/screens/ExploreScreen/homeMapLayout.ts');
const chest = loadTs('src/screens/ExploreScreen/dailyChestPresence.ts');

const tagRect = (r, angle) => {
  const c = layout.grabTagCenter(r, angle);
  const { width, height } = layout.GRAB_TAG_SIZE;
  return { left: c.x - width / 2, right: c.x + width / 2, top: c.y - height / 2, bottom: c.y + height / 2 };
};
const clear = (r, angle, finds) => finds.every(f => !layout.rectsOverlap(tagRect(r, angle), layout.findRect(f)));

test('GRAB ZONE tag: top of the circle when nothing is there', () => {
  assert.equal(layout.pickGrabTagAngle(150, []), 0);
  assert.equal(layout.pickGrabTagAngle(150, [{ x: 0, y: 140 }]), 0, 'a find below the shark leaves the top free');
});

test('GRAB ZONE tag never sits under a find label (the 70 m find just above the circle)', () => {
  // QA screenshot: a find whose label hung over the top of the circle.
  const finds = [{ x: 40, y: -205 }];
  const angle = layout.pickGrabTagAngle(150, finds);
  assert.notEqual(angle, 0);
  assert.ok(clear(150, angle, finds));
});

test('GRAB ZONE tag: crowded circles still find a gap, and the least-covered spot wins otherwise', () => {
  const ring = [0, 35, -35, 70].map(a => { const c = layout.grabTagCenter(150, a); return { x: c.x, y: c.y + 10 }; });
  const angle = layout.pickGrabTagAngle(150, ring);
  assert.ok(clear(150, angle, ring), `angle ${angle} is clear`);
  const everywhere = layout.GRAB_TAG_ANGLES.map(a => layout.grabTagCenter(150, a));
  assert.ok(layout.GRAB_TAG_ANGLES.includes(layout.pickGrabTagAngle(150, everywhere)));
});

test('a find just outside the radius is marked as on the edge; in range or far away is not', () => {
  const ppm = 3; // points per metre near the follow zoom
  const R = 50;
  assert.equal(layout.findOnZoneEdge(60, R, ppm), true, '60 m with a 50 m zone touches the line');
  assert.equal(layout.findOnZoneEdge(50, R, ppm), false, 'in range is grabbable, not dimmed');
  assert.equal(layout.findOnZoneEdge(45, R, ppm), false);
  assert.equal(layout.findOnZoneEdge(80, R, ppm), false, 'clear of the line');
  assert.equal(layout.findOnZoneEdge(null, R, ppm), false);
  assert.equal(layout.findOnZoneEdge(60, R, 0), false);
});

test('Next park trip chip: stays full when clear, folds over a find, slides below one under its coin', () => {
  const chip = { left: 16, top: 150, right: 160, bottom: 196 };
  assert.deepEqual({ ...layout.placeTripChip(chip, 44, [{ x: 300, y: 400 }]) }, { collapsed: false, nudge: 0 });
  // A find under the words, not the coin: fold only.
  assert.deepEqual({ ...layout.placeTripChip(chip, 44, [{ x: 150, y: 180 }]) }, { collapsed: true, nudge: 0 });
  // A find under the coin: fold and slide just below its label.
  const under = layout.placeTripChip(chip, 44, [{ x: 70, y: 200 }]);
  assert.equal(under.collapsed, true);
  const rect = layout.findRect({ x: 70, y: 200 });
  assert.ok(chip.top + under.nudge >= rect.bottom, 'the coin clears the find');
  assert.ok(under.nudge <= layout.CHIP_MAX_NUDGE);
  // No chip measured yet: nothing changes.
  assert.deepEqual({ ...layout.placeTripChip(null, 44, [{ x: 70, y: 200 }]) }, { collapsed: false, nudge: 0 });
});

test('daily chest: dismissed stays away for the day, a new day or a new chest presents again', () => {
  chest.resetChestDismissal();
  const morning = new Date(2026, 9, 1, 9, 0);
  assert.equal(chest.chestDismissed(7, morning), false);
  chest.markChestDismissed(7, morning);
  assert.equal(chest.chestDismissed(7, new Date(2026, 9, 1, 23, 59)), true);
  assert.equal(chest.chestDismissed(7, new Date(2026, 9, 2, 0, 1)), false, 'the next day');
  assert.equal(chest.chestDismissed(8, morning), false, 'tomorrow\'s chest');
  chest.resetChestDismissal();
  assert.equal(chest.chestDismissed(7, morning), false, 'a fresh app open');
});

test('daily chest: the button opens it whenever the screen is free, even before the first catch', () => {
  const base = { unclaimed: true, autoReady: false, screenFree: true, requested: false, dismissed: false };
  assert.equal(chest.chestShouldShow(base), false, 'waits for the queue on its own');
  assert.equal(chest.chestShouldShow({ ...base, autoReady: true }), true);
  assert.equal(chest.chestShouldShow({ ...base, autoReady: true, dismissed: true }), false);
  assert.equal(chest.chestShouldShow({ ...base, dismissed: true, requested: true }), true);
  assert.equal(chest.chestShouldShow({ ...base, requested: true, screenFree: false }), false, 'never over a find or dialog');
  assert.equal(chest.chestShouldShow({ ...base, unclaimed: false, requested: true }), false);
});

test('home map only measures finds after the map has settled (MapLibre "Invalid react tag")', () => {
  const fs = require('node:fs'), path = require('node:path');
  const home = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ExploreScreen/HomeExplore.tsx'), 'utf8');
  assert.match(home, /if \(!project \|\| mapSettled === 0 \|\|/);
  assert.match(home, /onZoneEdge=\{!inRange && findOnZoneEdge\(/);
  assert.match(home, /collapsed=\{chipPlacement\.collapsed\}/);
});
