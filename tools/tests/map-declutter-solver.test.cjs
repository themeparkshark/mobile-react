const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const s = loadTs('src/components/map/declutter/solver.ts');
const { DeclutterStore } = loadTs('src/components/map/declutter/store.ts');
const L = loadTs('src/screens/ExploreScreen/parkMapLayout.ts');
const { USF_RIDES } = loadTs('src/components/map/declutter/preview/usfRides.ts');
const { USF_FRIGHT_SPOTS } = loadTs('src/components/map/fright/preview/usfFixture.ts');

// Universal Studios Florida, a 393 x 700 map view.
const USF = { latitude: 28.4756, longitude: -81.4679 };
const frame = (over = {}) => ({ ...USF, zoom: 17.6, bearing: 0, width: 393, height: 700, ...over });
const mpp = zoom => 40075016.686 * Math.cos(USF.latitude * Math.PI / 180) / (512 * 2 ** zoom);
/** A point dx, dy screen points from the view centre at bearing 0 and zoom 17.6. */
const at = (dx, dy, zoom = 17.6) => ({ latitude: USF.latitude - (dy * mpp(zoom)) / 111320,
  longitude: USF.longitude + (dx * mpp(zoom)) / (111320 * Math.cos(USF.latitude * Math.PI / 180)) });
const rideAt = (id, dx, dy, extra = {}) => ({ id: `ride:${id}`, ...at(dx, dy), priority: 300, body: L.RIDE_BODY, group: 'ride', recedeScale: L.RIDE_RECEDE, ...extra });
const hauntAt = (key, dx, dy, extra = {}) => ({ id: `haunt:${key}`, ...at(dx, dy), priority: 520, body: L.HAUNT_BODY, group: 'haunt', recedeScale: L.HAUNT_RECEDE, ...extra });
const coinAt = (id, dx, dy) => ({ id: `coin:${id}`, ...at(dx, dy), priority: 460, body: L.COIN_BODY, tag: { w: 72, h: 30 } });
const ALLOWED = 0.04;

/** Placed art (body and extras) and chip boxes for a result. */
function boxes(items, out, f) {
  const art = [], chips = [];
  for (const item of items) {
    if (item.tagObstacleOnly) continue;
    const placement = out.get(item.id);
    if (!placement.visible) continue;
    const p = s.project(item.latitude, item.longitude, f);
    const k = placement.scale;
    const body = item.bodyFor ? item.bodyFor(f.zoom) : item.body;
    const rect = r => ({ x: p.x + r.x * k, y: p.y + r.y * k, w: r.w * k, h: r.h * k });
    art.push({ id: item.id, item, rect: rect(body) });
    for (const extra of item.extras ?? []) art.push({ id: item.id, item, rect: rect(extra), extra: true });
    if (placement.tag && item.tag) chips.push({ id: item.id, rect: { x: p.x + placement.tag.x, y: p.y + placement.tag.y, w: item.tag.w, h: item.tag.h } });
  }
  return { art, chips };
}

/** Real USF data: production ride spots, the Fin-ister haunts and reefs, coins among them, the encounter. */
function usfScene() {
  const rides = USF_RIDES.map((ride, i) => ({ id: ride.id, latitude: ride.latitude, longitude: ride.longitude, selected: false,
    adventure: i === 5, playable: false, goal: false, rush: false, near: false, closed: i % 4 === 0,
    tag: i % 3 === 0 ? L.rideTagSize('timer') : null }));
  const finds = Array.from({ length: 8 }, (_, i) => ({ id: `coin:${i}`, kind: i % 3 ? 'coin' : 'key',
    latitude: 28.4752 + (i * 0.0007) % 0.005, longitude: -81.4702 + (i * 0.0011) % 0.004 }));
  const haunts = USF_FRIGHT_SPOTS.filter(spot => spot.kind === 'haunt').map(spot => ({ key: spot.key, latitude: spot.latitude,
    longitude: spot.longitude, closed: spot.status !== 'OPERATING' }));
  const reefs = USF_FRIGHT_SPOTS.filter(spot => spot.kind === 'reef').map(spot => ({ key: spot.key, latitude: spot.latitude,
    longitude: spot.longitude, radius: spot.radius }));
  return L.buildParkLayout({ nightMode: true, rides, finds, haunts, reefs,
    fixed: [{ id: 'encounter', latitude: 28.4757, longitude: -81.4674, kind: 'encounter', radius: 40 }] });
}

/** The 154-marker stress set: USF plus 90 rides and 30 coins packed around the park. */
function stressScene() {
  const extra = L.buildParkLayout({ nightMode: true,
    rides: Array.from({ length: 90 }, (_, i) => ({ id: 2000 + i, latitude: 28.4751 + (Math.floor(i / 9) + ((i * 37) % 10) / 20) * 0.00055,
      longitude: -81.4700 + ((i % 9) + ((i * 53) % 10) / 20) * 0.0004, selected: false, adventure: false, playable: false, goal: false,
      rush: false, near: i % 7 === 0, closed: i % 5 === 0, tag: i % 4 === 0 ? L.rideTagSize('timer') : null })),
    finds: Array.from({ length: 30 }, (_, i) => ({ id: `coin:s${i}`, kind: 'coin', ...offset(((i * 71) % 400) - 200, ((i * 113) % 500) - 150) })),
  });
  return [...usfScene(), ...extra];
}
function offset(east, north) {
  return { latitude: USF.latitude + north / 111320, longitude: USF.longitude + east / (111320 * Math.cos(USF.latitude * Math.PI / 180)) };
}

const INSETS = s.resolveInsets(L.parkMapInsets({ hudBottom: 76, left: null, right: null, bottomLeft: 166, bottomRight: L.BOTTOM_RIGHT_COLUMN }), 393, 700);

test('projection: the camera centre is the view centre; bearing turns the map under fixed-up markers', () => {
  const c = s.project(USF.latitude, USF.longitude, frame());
  assert.ok(Math.abs(c.x - 196.5) < 1e-6 && Math.abs(c.y - 350) < 1e-6);
  const east = at(100, 0);
  const p = s.project(east.latitude, east.longitude, frame());
  assert.ok(Math.abs(p.x - 296.5) < 0.5 && Math.abs(p.y - 350) < 0.5, 'bearing 0: east is right');
  const turned = s.project(east.latitude, east.longitude, frame({ bearing: 90 }));
  assert.ok(Math.abs(turned.x - 196.5) < 0.5 && Math.abs(turned.y - 250) < 0.5, 'heading east: east is up');
});

test('footprints are the drawn art with its glow: islands 72 x 88, coins and keys 48, the haunt facade 96 x 100 plus its name chip', () => {
  assert.deepEqual(plain(L.RIDE_BODY), { x: -36, y: -84, w: 72, h: 88 }, 'down to the island base');
  assert.equal(L.COIN_BODY.w, 48);
  assert.equal(L.COIN_BODY.h, 48);
  assert.deepEqual(plain(L.HAUNT_BODY), { x: -48, y: -82, w: 96, h: 100 });
  assert.ok(L.HAUNT_CHIP.y >= 18, 'the chip sits under the facade');
  const reef = L.reefBody(90, 28.4754);
  assert.ok(reef(18.8).w > reef(16.4).w, 'a reef patch grows with the zoom, like its critters wander');
  const ring = L.encounterBody(40, 28.4757);
  assert.ok(ring(18.8).w >= ring(17.6).w && ring(15.8).w >= 120);
});

test('USF and the 154-marker stress set at z15.8, 16.4, 17.6, 18.8 and 19.4: zero art on art, zero chip on art', () => {
  for (const [name, items] of [['usf', usfScene()], ['stress', stressScene()]]) {
    for (const zoom of [15.8, 16.4, 17.6, 18.8, 19.4]) {
      for (const bearing of [0, 140]) {
        const f = frame({ zoom, bearing });
        const out = s.solveLayout(items, f, { insets: INSETS });
        const { art, chips } = boxes(items, out, f);
        for (let i = 0; i < art.length; i++) {
          for (let j = i + 1; j < art.length; j++) {
            const a = art[i], b = art[j];
            if (a.id === b.id || (a.item.fixed && b.item.fixed)) continue;
            assert.ok(s.overlapShare(a.rect, b.rect) <= ALLOWED + 1e-9, `${name} z${zoom} b${bearing}: ${a.id} on ${b.id}`);
          }
        }
        for (const chip of chips) {
          for (const a of art) {
            if (a.id === chip.id && !a.extra) continue;
            assert.equal(s.overlapArea(chip.rect, a.rect), 0, `${name} z${zoom}: ${chip.id} chip on ${a.id}`);
          }
          for (const other of chips) if (other !== chip) assert.equal(s.overlapArea(chip.rect, other.rect), 0, `${name}: chips ${chip.id} and ${other.id}`);
          for (const inset of INSETS) assert.equal(s.overlapArea(chip.rect, inset), 0, `${name}: chip ${chip.id} under the HUD`);
        }
        // Buttons are hard insets: no art at all under the bottom columns (6 pt gap included).
        for (const a of art) {
          if (a.item.pinned) continue;
          // Fixed art keeps its core (central 120 pt) clear; its wide ring or mist may pass under.
          const r = a.item.fixed && !a.extra ? { x: a.rect.x + (a.rect.w - Math.min(a.rect.w, s.FIXED_CORE)) / 2,
            y: a.rect.y + (a.rect.h - Math.min(a.rect.h, s.FIXED_CORE)) / 2, w: Math.min(a.rect.w, s.FIXED_CORE), h: Math.min(a.rect.h, s.FIXED_CORE) } : a.rect;
          for (const inset of INSETS.filter(inset => inset.share === 0)) {
            assert.equal(s.overlapArea(r, inset), 0, `${name} z${zoom}: ${a.id} under a button`);
          }
        }
        // Nothing vanishes without a reason, and a fold always lands on a shown host.
        for (const item of items) {
          const placement = out.get(item.id);
          if (!placement.visible) assert.ok(['collision', 'folded', 'inset', 'zoom', 'offscreen'].includes(placement.reason));
          if (placement.reason === 'folded') assert.equal(out.get(placement.foldedInto).visible, true);
        }
        // The Fin-ister encounter is fixed art: drawn unless it would sit under a button or off screen.
        assert.ok(out.get('encounter').visible || ['inset', 'offscreen'].includes(out.get('encounter').reason));
      }
    }
  }
});

test('same-group stacks fold into the strongest island; a ride hidden by a haunt still counts in the nearest ride\'s +N', () => {
  const out = s.solveLayout([rideAt(1, 0, 0, { weight: 3 }), rideAt(2, 10, 6, { priority: 340 }), rideAt(3, 150, 0)], frame());
  assert.equal(out.get('ride:2').visible, true, 'the higher priority ride survives');
  assert.equal(out.get('ride:1').foldedInto, 'ride:2');
  assert.equal(out.get('ride:2').folded, 3, 'weight counts');
  const hidden = s.solveLayout([hauntAt('barn', 0, 0), rideAt(7, 4, 4), rideAt(8, 120, 60)], frame());
  assert.equal(hidden.get('ride:7').visible, false);
  assert.equal(hidden.get('ride:7').reason, 'folded', 'no silent disappearance');
  assert.equal(hidden.get('ride:7').foldedInto, 'ride:8');
  assert.equal(hidden.get('ride:8').folded, 1);
});

test('a haunt is never covered: a colliding ride shrinks when that clears it, else hides', () => {
  const near = s.solveLayout([hauntAt('barn', 0, 0), rideAt(1, 80, 0)], frame());
  assert.equal(near.get('haunt:barn').scale, 1);
  assert.equal(near.get('ride:1').visible, true);
  assert.equal(near.get('ride:1').scale, L.RIDE_RECEDE, 'shrinks toward its ground point, full colour');
  const onTop = s.solveLayout([hauntAt('barn', 0, 0), rideAt(1, 4, 4)], frame());
  assert.equal(onTop.get('ride:1').visible, false);
});

test('the player\'s own picks beat the night: an adventure ride stays full size, its chip stays, the haunt yields', () => {
  const items = L.buildParkLayout({ nightMode: true,
    rides: [{ id: 1, ...at(70, 4), selected: false, adventure: true, playable: false, goal: false, rush: false, near: false, closed: false, tag: { w: 92, h: 22 } }],
    haunts: [{ key: 'tv', ...at(0, 0), closed: false }] });
  const out = s.solveLayout(items, frame());
  assert.equal(out.get('ride:1').scale, 1);
  assert.ok(out.get('ride:1').tag, 'the ADVENTURE chip stays attached to its island');
  const haunt = out.get('haunt:tv');
  assert.ok(!haunt.visible || haunt.scale < 1, 'the haunt shrinks or steps aside');
});

test('night mode: closed rides recede (their art already reads closed), open rides and haunts stay full; no countdown on a closed ride', () => {
  const base = { selected: false, adventure: false, playable: false, goal: false, rush: false, near: false, tag: null };
  const rides = [{ id: 1, ...at(-150, 0), ...base, closed: true }, { id: 2, ...at(150, 0), ...base, closed: false }];
  const night = s.solveLayout(L.buildParkLayout({ nightMode: true, rides, haunts: [{ key: 'h', ...at(0, 200), closed: false }] }), frame());
  assert.equal(night.get('ride:1').scale, L.RIDE_RECEDE);
  assert.equal(night.get('ride:2').scale, 1);
  assert.equal(night.get('haunt:h').scale, 1);
  assert.equal(s.solveLayout(L.buildParkLayout({ nightMode: false, rides }), frame()).get('ride:1').scale, 1);
  const t0 = Date.parse('2026-10-02T23:30:00-04:00');
  const closedTag = L.rideTagFor({ selected: false, rush: false, adventure: false, goal: false, owned: false, limitedText: null,
    expiresAt: t0 + 2 * 60_000, near: true, now: t0, closed: true });
  assert.equal(closedTag, null, 'no red hurry timer on a closed ride');
});

test('insets: the HUD row hides art that barely reaches under it (10 %), the button columns at 35 %; the selected ride never hides', () => {
  const items = [rideAt(1, 0, -340 + 60), rideAt(2, -170, 320), rideAt(3, 0, 0), rideAt(5, 30, -275, { pinned: true })];
  const out = s.solveLayout(items, frame(), { insets: INSETS });
  assert.equal(out.get('ride:1').reason, 'inset', 'its roof reaches under the status row');
  assert.equal(out.get('ride:2').reason, 'inset', 'under the bottom-left buttons');
  assert.equal(out.get('ride:3').visible, true);
  assert.equal(out.get('ride:5').visible, true);
  assert.equal(INSETS[0].share, 0.1);
});

test('off screen: art more than half outside the view hides (no clipped facade, no lone chip); half in stays; shown art keeps to 60 % off', () => {
  // ride:2 body x = 196.5 - 225 - 36: 10 % in view. ride:4 is 75 % in.
  const out = s.solveLayout([rideAt(1, 0, 500), rideAt(2, -225, 0), rideAt(3, 0, 0), rideAt(4, -178.5, 0)], frame());
  assert.equal(out.get('ride:1').reason, 'offscreen');
  assert.equal(out.get('ride:2').reason, 'offscreen');
  assert.equal(out.get('ride:4').visible, true);
  // 45 % in view: a fresh marker waits, a shown one stays (hysteresis).
  const edge = [rideAt(5, -200.1, 0)];
  assert.equal(s.solveLayout(edge, frame()).get('ride:5').visible, false);
  const shown = new Map([['ride:5', { visible: true, scale: 1, folded: 0, foldedInto: null, reason: null }]]);
  assert.equal(s.solveLayout(edge, frame(), { previous: shown, previousZoom: 17.6 }).get('ride:5').visible, true);
  // The z17.6 capture: a haunt more than half off the left edge hides with its name chip.
  assert.equal(s.solveLayout([hauntAt('robot', -230, 0, { extras: [L.HAUNT_CHIP] })], frame()).get('haunt:robot').reason, 'offscreen');
});

test('no popping: during a gesture shown markers never change; a small settle keeps them; a zoom change re-solves by priority', () => {
  const a = rideAt(1, 0, 0, { priority: 300 }), b = rideAt(2, 200, 0, { priority: 600 });
  const first = s.solveLayout([a], frame());
  // A higher-priority ride pans into view right on top of the shown one.
  const moved = { ...b, ...at(10, 0) };
  const held = s.solveLayout([a, moved], frame(), { previous: first, previousZoom: 17.6, hold: true });
  assert.equal(held.get('ride:1').visible, true, 'the shown island does not move or vanish under the finger');
  assert.equal(held.get('ride:2').visible, false, 'the newcomer waits for free space');
  const settled = s.solveLayout([a, moved], frame({ zoom: 17.65 }), { previous: held, previousZoom: 17.6 });
  assert.equal(settled.get('ride:1').visible, true, 'a settle at the same zoom keeps what is on screen');
  const zoomed = s.solveLayout([a, moved], frame({ zoom: 18.2 }), { previous: held, previousZoom: 17.6 });
  assert.equal(zoomed.get('ride:2').visible, true, 'a new zoom lets priority win again');
});

test('during a gesture chips neither move nor appear; they keep last pass\'s slot until the settle', () => {
  const coin = coinAt(1, 0, 0);
  const blocker = { id: 'x', ...at(0, -50), priority: 900, fixed: true, body: { x: -40, y: -20, w: 80, h: 40 } };
  const first = s.solveLayout([coin], frame());
  assert.equal(first.get('coin:1').tag.side, 'top');
  // Mid-pan something now sits where the chip is: held, it stays put instead of jumping.
  const held = s.solveLayout([coin, blocker], frame(), { previous: first, previousZoom: 17.6, hold: true });
  assert.equal(held.get('coin:1').tag.side, 'top');
  const fresh = s.solveLayout([coinAt(2, 60, 0)], frame(), { previous: new Map([['coin:2', s.VISIBLE]]), previousZoom: 17.6, hold: true });
  assert.equal(fresh.get('coin:2').tag, null, 'no chip appears mid-gesture');
  const settled = s.solveLayout([coin, blocker], frame(), { previous: held, previousZoom: 17.6 });
  assert.notEqual(settled.get('coin:1').tag.side, 'top', 'the settle moves it');
  assert.ok(settled.get('coin:1').tag.leader, 'a chip beside its art points at it');
});

test('chip sides are sticky: last pass\'s side is kept while it is free', () => {
  const coin = coinAt(1, 0, 0);
  const blocker = { id: 'x', ...at(0, -50), priority: 900, fixed: true, body: { x: -40, y: -20, w: 80, h: 40 } };
  const first = s.solveLayout([coin, blocker], frame());
  const side = first.get('coin:1').tag.side;
  assert.notEqual(side, 'top', 'top was taken');
  const again = s.solveLayout([coin], frame(), { previous: first, previousZoom: 17.6 });
  assert.equal(again.get('coin:1').tag.side, side, 'with top free again the chip does not jump back');
});

test('tags: never on art, another tag, the player, an inset or the edge; a far slot draws a leader line', () => {
  const fenced = s.solveLayout([coinAt(9, 0, 0)], frame(), { insets: [
    { x: 100, y: 303, w: 190, h: 30 }, { x: 221, y: 333, w: 79, h: 37 }, { x: 95, y: 333, w: 77, h: 37 }, { x: 150, y: 375, w: 95, h: 35 }] });
  const tag = fenced.get('coin:9').tag;
  assert.ok(tag && tag.side.startsWith('far') && tag.leader, 'a far slot with a leader line');
  const withPlayer = s.solveLayout([coinAt(1, 0, 0), { id: 'player', ...at(0, -40), priority: 0, tagObstacleOnly: true,
    body: { x: -26, y: -52, w: 52, h: 60 } }], frame());
  assert.notEqual(withPlayer.get('coin:1').tag.side, 'top', 'the chip steps off the shark');
});

test('zoom LOD: finds and chips step back when zoomed out', () => {
  const items = L.buildParkLayout({ nightMode: false, rides: [],
    finds: [{ id: 'coin:1', ...at(0, 0), kind: 'coin' }, { id: 'coin:2', ...at(150, 0), kind: 'coin' }] });
  assert.equal(s.solveLayout(items, frame({ zoom: 15.2 })).get('coin:1').reason, 'zoom');
  assert.equal(s.solveLayout(items, frame({ zoom: 16 })).get('coin:1').tag, null);
  assert.ok(s.solveLayout(items, frame()).get('coin:1').tag);
});

test('deterministic: the same scene in any order gives the same answer', () => {
  const items = stressScene();
  const a = plain([...s.solveLayout(items, frame({ bearing: 33 }), { insets: INSETS }).entries()]).sort((x, y) => x[0] < y[0] ? -1 : 1);
  const b = plain([...s.solveLayout([...items].reverse(), frame({ bearing: 33 }), { insets: INSETS }).entries()]).sort((x, y) => x[0] < y[0] ? -1 : 1);
  assert.deepEqual(a, b);
});

test('hysteresis: a marker already shown survives a 1 % nudge; a fresh one needs under 3 %', () => {
  const items = [{ id: 'a', ...at(0, 0), priority: 10, body: { x: -20, y: -20, w: 40, h: 40 } },
    { id: 'b', ...at(38.6, 0), priority: 5, body: { x: -20, y: -20, w: 40, h: 40 } }];
  assert.equal(s.solveLayout(items, frame()).get('b').visible, false);
  const prev = new Map([['a', s.VISIBLE], ['b', s.VISIBLE]]);
  assert.equal(s.solveLayout(items, frame(), { previous: prev }).get('b').visible, true);
});

test('store: a publish wakes only the markers whose placement changed', () => {
  const store = new DeclutterStore();
  const woke = [];
  store.subscribe('a', () => woke.push('a'));
  store.subscribe('b', () => woke.push('b'));
  const v = { visible: true, scale: 1, folded: 0, foldedInto: null, reason: null };
  store.publish(new Map([['a', v], ['b', v]]));
  woke.length = 0;
  const kept = store.get('a');
  store.publish(new Map([['a', { ...v }], ['b', { ...v, visible: false, reason: 'collision' }]]));
  assert.deepEqual(woke, ['b']);
  assert.equal(store.get('a'), kept, 'unchanged placements keep their object');
});

test('battery: a full park solves in a few milliseconds (best of 20)', () => {
  const items = stressScene();
  for (let i = 0; i < 5; i++) s.solveLayout(items, frame({ bearing: i }), { insets: INSETS });
  let best = Infinity;
  for (let i = 0; i < 20; i++) {
    const start = process.hrtime.bigint();
    s.solveLayout(items, frame({ bearing: i * 17 }), { insets: INSETS });
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

test('the player shark standing on a haunt recedes it (never hides it); it grows back once the shark walks off', () => {
  const player = (dx, dy) => ({ id: 'player', ...at(dx, dy), priority: 0, tagObstacleOnly: true, body: { x: -26, y: -52, w: 52, h: 60 } });
  const haunt = hauntAt('barn', 0, 0, { recedeUnderPlayer: true });
  const on = s.solveLayout([haunt, player(-30, -20)], frame());
  assert.equal(on.get('haunt:barn').visible, true);
  assert.equal(on.get('haunt:barn').scale, L.HAUNT_RECEDE, 'the haunt yields to the shark');
  // A small step keeps it receded (no flicker); walking well off grows it back at the same zoom.
  const near = s.solveLayout([haunt, player(-52, -20)], frame(), { previous: on, previousZoom: 17.6 });
  assert.equal(near.get('haunt:barn').scale, L.HAUNT_RECEDE);
  const off = s.solveLayout([haunt, player(-160, -20)], frame(), { previous: near, previousZoom: 17.6 });
  assert.equal(off.get('haunt:barn').scale, 1);
  // Rides do not opt in: the shark may stand on an island.
  const ride = s.solveLayout([rideAt('a', 0, 0), player(-10, -20)], frame());
  assert.equal(ride.get('ride:a').scale, 1);
  assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen/parkMapLayout.ts'), 'utf8'),
    /group: 'haunt', recedeScale: HAUNT_RECEDE, recedeUnderPlayer: true/, 'haunts opt in');
});

test('z15.8: island footprints line up with the art, and an island base clears the energy pill by the 6 pt gap', () => {
  // TaskMarker: a 72 x 96 box, art bottom at 86 (paddingBottom 10), anchored at 86.4. The body reaches the base.
  assert.equal(L.RIDE_BOX.anchor.y, 86.4);
  const base = 86 - L.RIDE_BOX.anchor.y;
  assert.ok(L.RIDE_BODY.y + L.RIDE_BODY.h >= base && L.RIDE_BODY.y + L.RIDE_BODY.h <= base + 6, 'body bottom sits on the island base');
  assert.ok(L.RIDE_BODY.y <= -L.RIDE_BOX.anchor.y + 4, 'body top covers the landmark and coin headroom');
  const f = frame({ zoom: 15.8 });
  const pill = INSETS.find(inset => inset.share === 0 && inset.x > 200);
  assert.ok(pill, 'the bottom-right column (energy, swords, avatar) is a hard inset');
  const rideScreen = (y, x = pill.x + 40) => {
    const k = mpp(15.8);
    return { id: 'ride:rocket', latitude: USF.latitude - ((y - 350) * k) / 111320,
      longitude: USF.longitude + ((x - 196.5) * k) / (111320 * Math.cos(USF.latitude * Math.PI / 180)),
      priority: 300, body: L.RIDE_BODY, group: 'ride' };
  };
  // The inset already carries the 6 pt gap: a base 2 pt above it would put art within 4 pt of the pill.
  assert.equal(s.solveLayout([rideScreen(pill.y - 2)], f, { insets: INSETS }).get('ride:rocket').visible, false);
  const clear = s.solveLayout([rideScreen(pill.y - 6)], f, { insets: INSETS });
  assert.equal(clear.get('ride:rocket').visible, true, 'base 6 pt above the gap line: shown, 12 pt from the pill');
});

test('marker art is anchored where the solver thinks: the anchor is re-sent after layout, scale origins are numbers', () => {
  const fs = require('node:fs'), path = require('node:path');
  const marker = fs.readFileSync(path.join(__dirname, '../../src/components/map/Marker.tsx'), 'utf8');
  // MLRNPointAnnotation drops an anchor that arrives before the view has a size (new-arch interop):
  // islands drew centred on their point, about 38 pt low.
  assert.match(marker, /anchor=\{laidOut \? a : \{ x: a\.x, y: a\.y \+ ANCHOR_NUDGE \}\}/);
  assert.match(marker, /onLayout=\{onLayout\}/);
  const placed = fs.readFileSync(path.join(__dirname, '../../src/components/map/declutter/Placed.tsx'), 'utf8');
  // RN parses transform-origin strings with an integer-only regex ("86.4px" read as 4 px).
  assert.match(placed, /transformOrigin: anchor \? \[anchor\.x, anchor\.y, 0\] : 'center'/);
  assert.doesNotMatch(placed, /transformOrigin: [^\n]*px/);
});

test('zooming out mid-gesture folds what now collides (fade only, no scale or chip moves); a plain hold keeps everything', () => {
  // Two rides 80 pt apart at z17.6 collide once the camera is at z16.4.
  const a = rideAt('a', -40, 0, { priority: 320, tag: { w: 56, h: 22 } });
  const b = rideAt('b', 40, 0, { priority: 300 });
  const settled = s.solveLayout([a, b], frame());
  assert.equal(settled.get('ride:a').visible && settled.get('ride:b').visible, true);
  const far = frame({ zoom: 16.4 });
  const held = s.solveLayout([a, b], far, { previous: settled, previousZoom: 17.6, hold: true });
  assert.equal(held.get('ride:b').visible, true, 'a plain held pass never changes shown art');
  const folded = s.solveLayout([a, b], far, { previous: settled, previousZoom: 17.6, hold: true, fold: true });
  assert.equal(folded.get('ride:a').visible, true);
  assert.equal(folded.get('ride:b').reason, 'folded', 'the weaker island folds into the stronger one');
  assert.equal(folded.get('ride:a').folded, 1, '+1 on the host');
  assert.equal(folded.get('ride:a').scale, settled.get('ride:a').scale, 'no scale change mid-gesture');
  const settledTag = settled.get('ride:a').tag, foldedTag = folded.get('ride:a').tag;
  assert.ok(foldedTag === null || (foldedTag.x === settledTag.x && foldedTag.y === settledTag.y), 'the chip never moves mid-gesture');
  const hook = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/map/declutter/useMapDeclutter.ts'), 'utf8');
  assert.match(hook, /const fold = holding\.current && lastZoom\.current !== null && full\.zoom < lastZoom\.current - FOLD_DURING_ZOOM;/);
});

test('fixed art (encounter, gym, boss, the reef under the encounter) fades under any inset instead of drawing beneath it (z15.8, z18.2)', () => {
  const f = frame({ zoom: 15.8 });
  const pill = INSETS.find(inset => inset.share === 0 && inset.x > 200);
  const fixedAt = (id, y, x, extra = {}, k = mpp(15.8)) => ({ id, latitude: USF.latitude - ((y - 350) * k) / 111320,
    longitude: USF.longitude + ((x - 196.5) * k) / (111320 * Math.cos(USF.latitude * Math.PI / 180)),
    priority: L.PRIORITY.fixed, fixed: true, ...extra });
  const encBody = L.encounterBody(40, USF.latitude);
  const enc = (y, zoom = 15.8, x = pill.x + 60) => fixedAt('encounter', y, x, { body: encBody(zoom), bodyFor: encBody }, mpp(zoom));
  // Centre 20 pt above the energy pill: its core reaches the button, so it fades (reason inset).
  const near = s.solveLayout([enc(pill.y + 6 - 20)], f, { insets: INSETS }).get('encounter');
  assert.equal(near.visible, false);
  assert.equal(near.reason, 'inset');
  // Centre 140 pt above: the core (half of FIXED_CORE = 60 pt) clears the gap line by 80 pt: drawn.
  assert.ok(140 - s.FIXED_CORE / 2 > s.FIXED_KEEP, 'the 140 pt case is genuinely clear');
  assert.equal(s.solveLayout([enc(pill.y + 6 - 140)], f, { insets: INSETS }).get('encounter').visible, true);
  // z18.2: the ring box is ~300 pt; a ring edge under the pill does not hide it while the critter is clear.
  const z18 = frame({ zoom: 18.2 });
  assert.ok(encBody(18.2).h > 2 * 100, 'the ring reaches under the pill in this case');
  assert.equal(s.solveLayout([enc(pill.y + 6 - 100, 18.2, pill.x - 30)], z18, { insets: INSETS }).get('encounter').visible, true);
  // Any inset, not just buttons: the offline chip under the compass and the HUD row hide fixed art too.
  const chip = { x: 393 - 16 - 44, y: 300, w: 44, h: 44, share: 0.35 };
  const underChip = s.solveLayout([enc(322, 18.2, 393 - 16 - 22)], z18, { insets: [...INSETS, chip] }).get('encounter');
  assert.equal(underChip.visible, false, 'the critter never draws under the offline chip');
  assert.equal(underChip.reason, 'inset');
  assert.equal(s.solveLayout([enc(322, 18.2, 393 - 16 - 22)], z18, { insets: INSETS }).get('encounter').visible, true, 'without the chip it draws');
  const gym = fixedAt('gym', 40, 196.5, { body: L.GYM_BODY });
  assert.equal(s.solveLayout([gym], f, { insets: INSETS }).get('gym').reason, 'inset', 'not under the HUD row either');
  // The selected ride (pinned) always draws.
  const pinnedUnder = { ...rideAt('sel', 0, 0), pinned: true, latitude: enc(pill.y + 20).latitude, longitude: enc(pill.y + 20).longitude };
  assert.equal(s.solveLayout([pinnedUnder], f, { insets: INSETS }).get('ride:sel').visible, true);
});

test('fixed art obeys the zoom limit and the half-off-screen rule, and never blinks at an inset edge under GPS jitter', () => {
  const host = { key: 'kelp', ...at(0, 0, 15.8), radius: 40 };
  const items = L.buildParkLayout({ rides: [], finds: [], haunts: [], reefs: [host], fixed: [{ id: 'encounter', ...at(0, 0, 15.8), kind: 'encounter', radius: 40 }], nightMode: true });
  const reef = items.find(i => i.id === 'reef:kelp');
  assert.equal(reef.fixed, true);
  assert.equal(s.solveLayout(items, frame({ zoom: 15.8 })).get('reef:kelp').reason, 'zoom', 'the host reef keeps its zoom limit: no empty box at z15.8');
  assert.equal(s.solveLayout(items, frame({ zoom: 17.6 })).get('reef:kelp').visible, true);
  // Half off screen: hidden like any marker.
  const gymAt = dx => ({ id: 'gym', ...at(dx, 0), priority: L.PRIORITY.fixed, fixed: true, body: L.GYM_BODY });
  assert.equal(s.solveLayout([gymAt(-205)], frame()).get('gym').reason, 'offscreen');
  // GPS jitter: the gym walks 1 pt at a time across the energy pill's top edge and back; it changes
  // state at most once each way (6 pt hysteresis), never flickering on a 1 to 3 pt wobble.
  const pill = INSETS.find(inset => inset.share === 0 && inset.x > 200);
  const k = mpp(17.6);
  const gymY = y => ({ id: 'gym', latitude: USF.latitude - ((y - 350) * k) / 111320,
    longitude: USF.longitude + ((pill.x + 75 - 196.5) * k) / (111320 * Math.cos(USF.latitude * Math.PI / 180)),
    priority: L.PRIORITY.fixed, fixed: true, body: L.GYM_BODY });
  // Gym core: 90 x 100 body, core is the body (both under 120): bottom edge = anchor + 20.
  const edgeY = pill.y - 20;
  let prev = null, changes = 0, last = null;
  const wobble = [-12, -10, -8, -6, -4, -2, 0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 8, 10, 9, 10, 8, 6, 4, 2, 3, 1, 2, 0, -2, -1, -3, -2, -4, -6, -8, -10, -12];
  for (const d of wobble) {
    const out = s.solveLayout([gymY(edgeY + d)], frame(), { insets: INSETS, previous: prev, previousZoom: 17.6 });
    const v = out.get('gym').visible;
    if (last !== null && v !== last) changes++;
    last = v; prev = out;
  }
  assert.equal(changes, 2, `exactly one hide and one show across the sweep (got ${changes})`);
  // And a few points of jitter either side of the edge never changes state.
  let p2 = s.solveLayout([gymY(edgeY - 10)], frame(), { insets: INSETS });
  const start = p2.get('gym').visible;
  assert.equal(start, true);
  for (const d of [-1, 2, -3, 4, -2, 3, 5, -1]) {
    p2 = s.solveLayout([gymY(edgeY + d)], frame(), { insets: INSETS, previous: p2, previousZoom: 17.6 });
    assert.equal(p2.get('gym').visible, start, `jitter at ${d} pt`);
  }
});

test('the reef the Fin-ister encounter swims at is drawn with it (fixed), never hidden under the encounter; other reefs unchanged', () => {
  const host = { key: 'kelp', ...at(0, 0), radius: 40 };
  const other = { key: 'bog', ...at(160, 250), radius: 40 };
  const items = L.buildParkLayout({ rides: [], finds: [], haunts: [], reefs: [host, other],
    fixed: [{ id: 'encounter', ...at(0, 0), kind: 'encounter', radius: 40 }], nightMode: true });
  const reefItem = id => items.find(i => i.id === `reef:${id}`);
  assert.equal(reefItem('kelp').fixed, true);
  assert.equal(reefItem('bog').fixed, undefined);
  const out = s.solveLayout(items, frame());
  assert.equal(out.get('reef:kelp').visible, true, 'host reef drawn');
  assert.equal(out.get('encounter').visible, true, 'encounter drawn');
  // Without an encounter the reef is an ordinary item.
  const plain = L.buildParkLayout({ rides: [], finds: [], haunts: [], reefs: [host], fixed: [], nightMode: true });
  assert.equal(plain.find(i => i.id === 'reef:kelp').fixed, undefined);
});

test('a selected ride card never lands under the following shark (player 40 pt above the ride, and from each side)', () => {
  const map = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/Map.tsx'), 'utf8');
  const m = map.match(/export const PLAYER_BODY = \{ x: (-?\d+), y: (-?\d+), w: (\d+), h: (\d+) \}/);
  const body = { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [dx, dy] of [[0, 40], [0, -60], [70, 0], [-70, 0], [30, 50]]) {
    const player = { id: 'player', ...at(0, 0), priority: 0, tagObstacleOnly: true, body };
    const ride = rideAt('sel', dx, dy, { tag: L.SELECTED_TAG, priority: 900 });
    const out = s.solveLayout([player, ride], frame());
    const pl = out.get('ride:sel');
    assert.ok(pl.tag, `card placed for ride at ${dx},${dy}`);
    const p = s.project(ride.latitude, ride.longitude, frame()), c = s.project(player.latitude, player.longitude, frame());
    const card = { x: p.x + pl.tag.x, y: p.y + pl.tag.y, w: L.SELECTED_TAG.w, h: L.SELECTED_TAG.h };
    const shark = { x: c.x + body.x, y: c.y + body.y, w: body.w, h: body.h };
    assert.ok(!hit(card, shark), `ride at ${dx},${dy}: card ${JSON.stringify(card)} under the shark ${JSON.stringify(shark)}`);
  }
});
