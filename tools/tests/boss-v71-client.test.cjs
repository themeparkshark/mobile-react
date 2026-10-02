'use strict';
/**
 * Boss Brawl v7.1 client rules (design 11.10 callouts, 6.2 settle zones, 11.3
 * camera numbers, 11.4 gold audit, 9.4 Daily First Brawl and sticker book).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const co = loadTs('src/games/boss/callouts.ts');
const parts = loadTs('src/games/boss/parts.ts');
const meta = loadTs('src/games/boss/localMeta.ts');
const cam = loadTs('src/games/boss/worldCam.ts');
const view = loadTs('src/games/boss/view.ts');

const spec = (slot, tier, text, extra = {}) => ({ slot, tier, text, ms: 700, ...extra });

test('callout queue: max one hero and one small; higher tier replaces, lower tier waits for the last 200 ms', () => {
  const s = co.emptyCallouts();
  assert.equal(co.pushCallout(s, spec('small', co.TIER_POP, 'POP'), 0), 'shown');
  assert.equal(co.pushCallout(s, spec('hero', co.TIER_COUNTER, 'PERFECT', { wordmark: 'perfect' }), 10), 'shown');
  // A lower tier is dropped while the current one has > 200 ms left...
  assert.equal(co.pushCallout(s, spec('small', co.TIER_HIT, 'CLANK'), 100), 'dropped');
  assert.equal(co.visibleCallouts(s, 100).small.text, 'POP');
  // ...and replaces it in its last 200 ms.
  assert.equal(co.pushCallout(s, spec('small', co.TIER_HIT, 'CLANK'), 560), 'replaced');
  // Equal or higher tier replaces at once.
  assert.equal(co.pushCallout(s, spec('small', co.TIER_PUNISH, 'SPLASHED!'), 600), 'replaced');
  assert.equal(co.pushCallout(s, spec('hero', co.TIER_BREAK, 'BREAK!', { wordmark: 'break' }), 610), 'replaced');
  const v = co.visibleCallouts(s, 620);
  assert.equal(v.hero.text, 'BREAK!');
  assert.equal(v.small.text, 'SPLASHED!');
  // Never more than one per slot over a long random stream.
  let seed = 7;
  for (let t = 0; t < 20000; t += 37) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const slot = seed % 3 === 0 ? 'hero' : 'small';
    co.pushCallout(s, spec(slot, seed % 7, `c${t}`), t);
    const w = co.visibleCallouts(s, t);
    assert.ok([w.hero, w.small].filter(Boolean).length <= 2);
  }
});

test('callout queue: stacking counters update in place; a ribbon suspends the small lane', () => {
  const s = co.emptyCallouts();
  co.pushCallout(s, spec('small', co.TIER_HIT, 'HIT x1', { key: 'hit' }), 0);
  const id = s.small.id;
  assert.equal(co.pushCallout(s, spec('small', co.TIER_HIT, 'HIT x2', { key: 'hit' }), 50), 'updated');
  assert.equal(s.small.id, id);
  co.holdRibbon(s, 100, 900);
  assert.equal(co.visibleCallouts(s, 200).small, null, 'nothing over a ribbon');
  assert.equal(co.pushCallout(s, spec('small', co.TIER_KO, 'X'), 500), 'dropped');
  assert.equal(co.pushCallout(s, spec('small', co.TIER_POP, 'POP'), 1001), 'shown');
});

test('callout zones: ribbon, small lane and hero zone sit below the HUD band and above the reach band', () => {
  for (const [W, H] of [[390, 714], [375, 650], [430, 800]]) {
    const z = co.calloutZones(W, H);
    const L = view.arenaLayout(W, H);
    assert.ok(z.ribbonY - z.ribbonH / 2 >= z.hudBottom - 2, 'ribbon below the name / HP band');
    assert.ok(z.smallY > z.hudBottom && z.heroY > z.smallY);
    assert.ok(z.heroY + 50 < L.targetY - L.targetH, 'hero zone clear of the row');
    assert.ok(z.heroMaxW <= 300);
  }
});

test('part-breaks settle in a settle zone, never in the reach band, the row, the float or the HUD', () => {
  for (const [W, H] of [[390, 714], [375, 650], [430, 800], [320, 560]]) {
    const L = view.arenaLayout(W, H);
    const hat = { x: L.bossX - L.bossSize * 0.2, y: L.bossY - L.bossSize * 0.35 };
    const check = (n, k, ox, oy) => {
      const l = parts.partLaunchTo(W, H, n, k, ox, oy);
      const rest = parts.partAt(l, 9);
      assert.ok(rest.rest, `${n}.${k} comes to rest`);
      const inSand = parts.inZone(parts.ZONE_SAND, W, H, rest.x, rest.y, 1);
      const inDeck = parts.inZone(parts.ZONE_DECK, W, H, rest.x, rest.y, 1);
      assert.ok(inSand || inDeck, `${W}x${H} part ${n}.${k} rests in a zone (${rest.x.toFixed(0)}, ${rest.y.toFixed(0)})`);
      assert.ok(!parts.inZone(parts.REACH_BAND, W, H, rest.x, rest.y), 'not in the reach band');
      assert.ok(Math.abs(rest.y - L.targetY) > L.targetH, 'clear of the row');
      assert.ok(Math.hypot(rest.x - L.floatX, rest.y - L.floatY) > L.floatR * 2, 'clear of the float');
      assert.ok(rest.y > H * 0.15, 'clear of the HUD band');
      // Upward launch (the hat flies about 160 pt up on Break 1).
      if (n === 1) assert.ok(Math.abs(l.vy * l.vy / (2 * parts.PART_G) - 160) < 2);
    };
    check(1, 0, hat.x, hat.y);
    for (let k = 0; k < 6; k++) check(3, k, L.bossX + (k - 2.5) * 12, L.bossY - L.bossSize * 0.25);
    assert.ok(6 + 1 <= parts.MAX_DECALS);
  }
});

test('world camera: pin pull-back 0.92, Break push-in 1.16 / 1.19 / 1.22, Final Pop 1.18, all four scales in one round', () => {
  const L = view.arenaLayout(390, 714);
  const v = view.emptyView();
  const pres = { sLane: 1, sSide: 1, sI: 0, sRes: 1, sAt: 0, pinSide: 1, pinStart: 1000, pinEnd: 2800, pinKind: 0, wheels: false, breaks: 0, walking: false, team: false };
  const at = (now, f, br = -1, n = 0, fa = -1, g = 0) => cam.worldCamAt(L, v, pres, now, f, br, n, fa, g, 1, false);
  assert.equal(at(500, 500).z, 1);
  assert.ok(Math.abs(at(1095, 0).z - 0.92) < 1e-9, 'full pull-back 90 ms after the slam frame');
  assert.ok(Math.abs(at(2000, 0).z - 0.92) < 1e-9, 'held through the opening');
  assert.ok(at(2700, 0).z > 0.92 && at(2700, 0).z < 1, 'back over 300 ms on close-up');
  assert.equal(at(1095, 0).oy, L.targetY, 'pull-back about the row so the pinned limb stays on the buoys');
  for (const [n, want] of [[1, 1.16], [2, 1.19], [3, 1.22]]) {
    const c = at(0, 5000 + 200, 5000, n);
    assert.ok(Math.abs(c.z - want) < 1e-9, `Break ${n} push ${c.z}`);
    assert.equal(c.ox, L.bossX);
  }
  const fp = at(0, 9000 + 200 + 200, -1, 0, 9000, 3);
  assert.ok(Math.abs(fp.z - 1.18) < 1e-9);
  assert.equal(cam.worldCamAt(L, v, pres, 1095, 0, -1, 0, -1, 0, 1, true).z, 1, 'reduced motion: no camera');
});

test('Daily First Brawl once per local day; the sticker book stamps each part once', () => {
  let m = meta.emptyMeta();
  let u = meta.applyRound(m, '2026-10-01', 1, true);
  assert.equal(u.daily, true);
  assert.deepEqual([...u.fresh], ['hat']);
  m = u.meta;
  u = meta.applyRound(m, '2026-10-01', 3, true);
  assert.equal(u.daily, false, 'second round of the day');
  assert.deepEqual([...u.fresh], ['tentacle', 'shell']);
  m = u.meta;
  u = meta.applyRound(m, '2026-10-02', 0, true);
  assert.equal(u.daily, true);
  assert.deepEqual([...u.fresh], ['scale']);
  assert.deepEqual([...u.owned], ['hat', 'tentacle', 'shell', 'scale']);
  assert.deepEqual([...meta.applyRound(u.meta, '2026-10-02', 0, false).fresh], [], 'a TKO with no Break catches nothing');
  assert.equal(meta.parseMeta('not json').dailyDay, null);
  assert.equal(meta.dayKey(Date.UTC(2026, 9, 1, 6, 30), 7 * 60), '2026-09-30', 'PDT park day');
});

test('gold audit (11.4): in-fight gold only on hit-here shapes', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '../../src/games/boss', f), 'utf8');
  for (const f of ['BossBrawl.tsx', 'CalloutLayer.tsx', 'multiplayer/CrewLayer.tsx']) {
    assert.ok(!/#FFCF3B|#FFE68A/i.test(src(f)), `${f} has no gold`);
  }
  const arena = src('BossArena.tsx');
  // Only inside the Pin and Pop sucker block (lit suckers, look-ahead rims, ticked rings); the anchor is drawn art.
  const a = arena.indexOf('// Pin and Pop suckers');
  const b = arena.indexOf('// Final Pop: the gold anchor');
  assert.ok(a > 0 && b > a);
  const outside = (arena.slice(0, a) + arena.slice(b)).split('\n').filter((l) => /\bGOLD\b/.test(l) && !/^const GOLD/.test(l));
  assert.deepEqual(outside, []);
  assert.ok(!/Rainbow/.test(arena), 'the procedural KO rainbow is cut');
});
