const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const s = loadTs('src/components/map/declutter/solver.ts');
const { DeclutterStore } = loadTs('src/components/map/declutter/store.ts');
const L = loadTs('src/screens/ExploreScreen/parkMapLayout.ts');

// Universal Studios Florida, Fin-ister Nights zoom, a 393x700 map view.
const USF = { latitude: 28.4752, longitude: -81.4685 };
const frame = (over = {}) => ({ ...USF, zoom: 17.6, bearing: 0, width: 393, height: 700, ...over });
const mpp = 40075016.686 * Math.cos(USF.latitude * Math.PI / 180) / (512 * 2 ** 17.6);
/** A point dx, dy screen points from the view centre at bearing 0. */
const at = (dx, dy) => ({ latitude: USF.latitude - (dy * mpp) / 111320,
  longitude: USF.longitude + (dx * mpp) / (111320 * Math.cos(USF.latitude * Math.PI / 180)) });
const ride = (id, dx, dy, extra = {}) => ({ id: `ride:${id}`, ...at(dx, dy), priority: 300, body: L.RIDE_BODY, group: 'ride', recedeScale: L.RIDE_RECEDE, ...extra });
const haunt = (key, dx, dy, extra = {}) => ({ id: `haunt:${key}`, ...at(dx, dy), priority: 520, body: L.HAUNT_BODY, group: 'haunt', recedeScale: L.HAUNT_RECEDE, ...extra });
const coin = (id, dx, dy) => ({ id: `coin:${id}`, ...at(dx, dy), priority: 460, body: L.COIN_BODY, tag: { w: 64, h: 30 } });

function rects(items, out, f) {
  return items.filter(item => !item.tagObstacleOnly && out.get(item.id).visible).map(item => {
    const p = s.project(item.latitude, item.longitude, f);
    const k = out.get(item.id).scale;
    return { item, body: { x: p.x + item.body.x * k, y: p.y + item.body.y * k, w: item.body.w * k, h: item.body.h * k }, p };
  });
}

/** Seeded RNG so the dense scene is the same every run. */
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

function denseScene(seed = 7) {
  const r = rng(seed);
  const items = [];
  for (let i = 0; i < 44; i++) items.push(ride(i, (r() - 0.5) * 520, (r() - 0.5) * 900, { priority: 300 + Math.floor(r() * 40) }));
  for (let i = 0; i < 10; i++) items.push(haunt(`h${i}`, (r() - 0.5) * 420, (r() - 0.5) * 760));
  for (let i = 0; i < 16; i++) items.push(coin(i, (r() - 0.5) * 420, (r() - 0.5) * 760));
  items.push({ id: 'gym', ...at(40, 120), priority: 1000, fixed: true, body: L.GYM_BODY });
  return items;
}

test('projection: the camera centre is the view centre; bearing turns the map under fixed-up markers', () => {
  const c = s.project(USF.latitude, USF.longitude, frame());
  assert.ok(Math.abs(c.x - 196.5) < 1e-6 && Math.abs(c.y - 350) < 1e-6);
  const east = at(100, 0);
  const north = s.project(east.latitude, east.longitude, frame());
  assert.ok(Math.abs(north.x - 296.5) < 0.5 && Math.abs(north.y - 350) < 0.5, 'bearing 0: east is right');
  const turned = s.project(east.latitude, east.longitude, frame({ bearing: 90 }));
  assert.ok(Math.abs(turned.x - 196.5) < 0.5 && Math.abs(turned.y - 250) < 0.5, 'heading east: east is up');
});

test('same-group stacks fold into the strongest island and count by weight', () => {
  const items = [ride(1, 0, 0, { weight: 3 }), ride(2, 10, 6, { priority: 340 }), ride(3, 150, 0)];
  const out = s.solveLayout(items, frame());
  assert.equal(out.get('ride:2').visible, true, 'the higher priority ride survives');
  assert.equal(out.get('ride:1').visible, false);
  assert.equal(out.get('ride:1').foldedInto, 'ride:2');
  assert.equal(out.get('ride:2').folded, 3, 'a pre-folded stack of 3 adds 3');
  assert.equal(out.get('ride:3').visible, true);
});

test('a haunt never gets covered: a colliding ride recedes when that clears it, else hides', () => {
  const near = s.solveLayout([haunt('barn', 0, 0), ride(1, 52, 10)], frame());
  assert.equal(near.get('haunt:barn').visible, true);
  assert.equal(near.get('haunt:barn').scale, 1);
  assert.equal(near.get('ride:1').visible, true);
  assert.equal(near.get('ride:1').scale, L.RIDE_RECEDE, 'shrinks toward its ground point');
  assert.equal(near.get('ride:1').dim, true);
  const onTop = s.solveLayout([haunt('barn', 0, 0), ride(1, 4, 4)], frame());
  assert.equal(onTop.get('ride:1').visible, false);
  assert.equal(onTop.get('ride:1').reason, 'collision');
});

test('the player\'s own picks beat the night: an adventure ride stays full size and the haunt recedes', () => {
  const items = L.buildParkLayout({ nightMode: true,
    rides: [{ id: 1, ...at(50, 4), members: 0, selected: false, adventure: true, playable: false, goal: false, rush: false, near: false, closed: false, tag: { w: 92, h: 22 } }],
    haunts: [{ key: 'tv', ...at(0, 0), closed: false }] });
  const out = s.solveLayout(items, frame());
  assert.equal(out.get('ride:1').scale, 1);
  assert.equal(out.get('haunt:tv').visible, true);
  assert.equal(out.get('haunt:tv').scale, L.HAUNT_RECEDE);
  assert.ok(out.get('ride:1').tag, 'the ADVENTURE chip stays attached to its island');
});

test('night mode: closed rides recede and dim, open rides and haunts stay full; day mode leaves closed rides full size', () => {
  const base = { members: 0, selected: false, adventure: false, playable: false, goal: false, rush: false, near: false, tag: null };
  const rides = [{ id: 1, ...at(-150, 0), ...base, closed: true }, { id: 2, ...at(150, 0), ...base, closed: false }];
  const night = s.solveLayout(L.buildParkLayout({ nightMode: true, rides, haunts: [{ key: 'h', ...at(0, 200), closed: false }] }), frame());
  assert.equal(night.get('ride:1').scale, L.RIDE_RECEDE);
  assert.equal(night.get('ride:1').dim, true);
  assert.equal(night.get('ride:2').scale, 1);
  assert.equal(night.get('haunt:h').scale, 1);
  const day = s.solveLayout(L.buildParkLayout({ nightMode: false, rides }), frame());
  assert.equal(day.get('ride:1').scale, 1);
});

test('HUD insets: art mostly under the status row or a button column hides; the selected ride never does', () => {
  const insets = s.resolveInsets(L.parkMapInsets({ hudBottom: 76, left: null, right: null, bottomLeft: 250, bottomRight: 216 }), 393, 700);
  const items = [ride(1, 0, -300), ride(2, -170, 320), ride(3, 0, 0), ride(4, 0, -300 + 400, {}), ride(5, 30, -305, { pinned: true })];
  const out = s.solveLayout(items, frame(), { insets });
  assert.equal(out.get('ride:1').reason, 'inset', 'under the status row (the old peeking LIMITED label)');
  assert.equal(out.get('ride:2').reason, 'inset', 'under the bottom-left buttons');
  assert.equal(out.get('ride:3').visible, true);
  assert.equal(out.get('ride:5').visible, true);
});

test('off screen: art wholly outside the view hides (no stale marker lingering at the edge); partly in view stays', () => {
  const out = s.solveLayout([ride(1, 0, -500), ride(2, -215, 0), ride(3, 0, 0)], frame());
  assert.equal(out.get('ride:1').reason, 'offscreen');
  assert.equal(out.get('ride:2').visible, true, 'its art still reaches into the view');
  assert.equal(out.get('ride:3').visible, true);
});

test('tags: never on art, other tags, the player, an inset or the screen edge; a far slot draws a leader', () => {
  const items = [haunt('a', 0, 0), coin(1, 0, -100), coin(2, 60, -100),
    { id: 'player', ...at(0, 60), priority: 0, tagObstacleOnly: true, body: { x: -26, y: -52, w: 52, h: 60 } }];
  const f = frame();
  const out = s.solveLayout(items, f);
  const placedBodies = rects(items, out, f).map(r => r.body);
  const tagBoxes = [];
  for (const item of items.filter(i => i.tag)) {
    const placement = out.get(item.id);
    if (!placement.visible || !placement.tag) continue;
    const p = s.project(item.latitude, item.longitude, f);
    const box = { x: p.x + placement.tag.x, y: p.y + placement.tag.y, w: item.tag.w, h: item.tag.h };
    for (const body of placedBodies) assert.ok(s.overlapArea(box, body) <= 2 || body.x === p.x + item.body.x, `${item.id} tag clear of art`);
    for (const other of tagBoxes) assert.equal(s.overlapArea(box, other), 0);
    tagBoxes.push(box);
    assert.ok(box.x >= 4 && box.y >= 4 && box.x + box.w <= 389 && box.y + box.h <= 696);
  }
  // Fence a coin's near slots so only a far one is free.
  const fenced = s.solveLayout([coin(9, 0, 0)], f, { insets: [
    { x: 196.5 - 19 - 80, y: 308, w: 238, h: 22 },
    { x: 196.5 + 19, y: 330, w: 80, h: 140 }, { x: 196.5 - 19 - 80, y: 330, w: 80, h: 140 },
    { x: 196.5 - 60, y: 350 + 19, w: 120, h: 50 }] });
  const tag = fenced.get('coin:9').tag;
  assert.ok(tag && tag.side.startsWith('far') && tag.leader, 'a far slot with a leader line');
});

test('dense park at night: no two visible art boxes overlap past the threshold; priority always wins', () => {
  const items = denseScene();
  for (const bearing of [0, 37, 90, 215]) {
    for (const zoom of [16.2, 17.6, 18.6]) {
      const f = frame({ bearing, zoom });
      const out = s.solveLayout(items, f);
      const onScreen = r => r.body.x + r.body.w > 0 && r.body.y + r.body.h > 0 && r.body.x < f.width && r.body.y < f.height;
      const all = rects(items, out, f);
      const shown = all.filter(onScreen);
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          const a = shown[i], b = shown[j];
          if (a.item.fixed && b.item.fixed) continue;
          assert.ok(s.overlapShare(a.body, b.body) <= 0.14 + 1e-9, `${a.item.id} x ${b.item.id} at z${zoom} b${bearing}`);
        }
      }
      // A hidden marker was beaten by something stronger it collides with (or an inset/zoom/fold rule).
      for (const item of items) {
        const placement = out.get(item.id);
        if (placement.reason === 'collision') {
          const p = s.project(item.latitude, item.longitude, f);
          const mine = { x: p.x + item.body.x * (item.recedeScale ?? 1), y: p.y + item.body.y * (item.recedeScale ?? 1),
            w: item.body.w * (item.recedeScale ?? 1), h: item.body.h * (item.recedeScale ?? 1) };
          assert.ok(all.some(other => s.overlapShare(mine, other.body) > 0.14 && (other.item.fixed || other.item.priority >= item.priority)),
            `${item.id} hid behind a stronger marker`);
        }
      }
      // Nothing silently vanishes: every hidden marker says why.
      for (const item of items) {
        const placement = out.get(item.id);
        if (!placement.visible) assert.ok(['collision', 'folded', 'inset', 'zoom', 'offscreen'].includes(placement.reason));
        if (placement.reason === 'folded') assert.equal(out.get(placement.foldedInto).visible, true);
      }
    }
  }
});

test('deterministic: the same scene in any order gives the same answer', () => {
  const items = denseScene(11);
  const a = plain([...s.solveLayout(items, frame({ bearing: 33 })).entries()]);
  const shuffled = [...items].sort(() => 0).reverse();
  const b = plain([...s.solveLayout(shuffled, frame({ bearing: 33 })).entries()]);
  assert.deepEqual(a.sort((x, y) => x[0] < y[0] ? -1 : 1), b.sort((x, y) => x[0] < y[0] ? -1 : 1));
});

test('hysteresis: a marker already shown survives a borderline overlap (no flicker on a tiny camera nudge)', () => {
  // Overlap share ~0.17: above the 0.14 threshold, under 0.14 + 0.08.
  const items = [{ id: 'a', ...at(0, 0), priority: 10, body: { x: -20, y: -20, w: 40, h: 40 } },
    { id: 'b', ...at(33, 0), priority: 5, body: { x: -20, y: -20, w: 40, h: 40 } }];
  const fresh = s.solveLayout(items, frame());
  assert.equal(fresh.get('b').visible, false);
  const prev = new Map([['a', fresh.get('a')], ['b', { ...fresh.get('b'), visible: true }]]);
  assert.equal(s.solveLayout(items, frame(), { previous: prev }).get('b').visible, true);
});

test('zoom LOD: finds and chips step back when zoomed out', () => {
  const items = L.buildParkLayout({ nightMode: false, rides: [],
    finds: [{ id: 'coin:1', ...at(0, 0), kind: 'coin' }, { id: 'coin:2', ...at(150, 0), kind: 'coin' }] });
  assert.equal(s.solveLayout(items, frame({ zoom: 15.2 })).get('coin:1').reason, 'zoom');
  const mid = s.solveLayout(items, frame({ zoom: 16 }));
  assert.equal(mid.get('coin:1').visible, true);
  assert.equal(mid.get('coin:1').tag, null, 'the timer chip waits for a closer zoom');
  assert.ok(s.solveLayout(items, frame()).get('coin:1').tag);
});

test('store: a publish wakes only the markers whose placement changed', () => {
  const store = new DeclutterStore();
  const woke = [];
  store.subscribe('a', () => woke.push('a'));
  store.subscribe('b', () => woke.push('b'));
  const v = { visible: true, scale: 1, dim: false, folded: 0, foldedInto: null, reason: null };
  store.publish(new Map([['a', v], ['b', v]]));
  woke.length = 0;
  const kept = store.get('a');
  store.publish(new Map([['a', { ...v }], ['b', { ...v, visible: false, reason: 'collision' }]]));
  assert.deepEqual(woke, ['b']);
  assert.equal(store.get('a'), kept, 'unchanged placements keep their object');
});

test('battery: a full park solves in well under a frame', () => {
  const items = [...denseScene(3), ...denseScene(5).map(item => ({ ...item, id: `${item.id}-2` }))];
  for (let i = 0; i < 5; i++) s.solveLayout(items, frame({ bearing: i }));
  // Best of 20, so a busy CI box does not flake the budget.
  let best = Infinity;
  for (let i = 0; i < 20; i++) {
    const start = process.hrtime.bigint();
    s.solveLayout(items, frame({ bearing: i * 17 }));
    best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6);
  }
  assert.ok(best < 8, `${best.toFixed(2)} ms per pass for ${items.length} markers`);
});

test('ride chips: one chip per island, badge first, sized to its text', () => {
  assert.equal(L.rideTagKind({ badge: 'rush', showTimer: true }), 'rush');
  assert.equal(L.rideTagKind({ badge: 'new', showTimer: true }), 'timer');
  assert.equal(L.rideTagKind({ badge: 'level', showTimer: false }), null);
  assert.ok(L.rideTagSize('limited', 'LIMITED · LEAVES OCT 31').w >= 150);
});
