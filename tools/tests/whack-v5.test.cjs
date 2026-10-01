'use strict';
/**
 * Whack-a-Shark v5 rules (studio/design/whack.md rev 5): fair input (decoy
 * core hitboxes, friendly wins), the Ripe Golden (stages, seeded bolt, the
 * first one never bolts early, queue formats only), PERFECT on the 16th grid,
 * and the unlock ladder. Look-up rules live in whack-bonk-rush.test.cjs.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const W = loadTs('src/games/whack/waves.ts');
const T = loadTs('src/games/whack/timeline.ts');
const S = loadTs('src/games/whack/sim.ts');
const A = loadTs('src/games/whack/autoplayer.ts');
const P = loadTs('src/games/whack/proof.ts');
// layout.ts only needs the rim geometry from assets.ts (which requires images): stub it.
const RIM_GEO = {
  park: { aspect: 384 / 249, mouth: [0.49, 0.25, 0.25, 0.15] },
  pirates: { aspect: 318 / 293, mouth: [0.507, 0.3, 0.219, 0.062] },
};
const Lay = loadTs('src/games/whack/render/layout.ts', { '../assets': { RIM_GEO } });

const q = (seed, burstIndex, unlockLevel, extra = {}) => T.buildBurst({ seed, burstIndex, format: 'queue', difficulty: 2, theme: 'park', unlockLevel, ...extra });
const ripes = (tl) => tl.events.filter((e) => e.ug > 0);

function advanceEngaged(s, gt) {
  for (let g = 0; s.t < gt && g < 50; g++) { S.simAdvanceTo(s, gt); if (s.frozen && s.t < gt) S.simUnfreeze(s); }
}

// ---------------------------------------------------------------- fair input (5.1)
test('hit test: any tap a friendly hitbox contains goes to the friendly target, even when the decoy is nearer', () => {
  const L = Lay.computeLayout(390, 760, 'park');
  const up = [0, 0, 0, 1, 1, 0, 0, 0, 0];
  const harm = [0, 0, 0, 0, 1, 0, 0, 0, 0]; // Finn on 3, angler on 4 (same row, adjacent)
  // A point inside both Finn's slop box and the angler's core: Finn wins.
  const xEdge = Math.min(L.hx1[3], L.cx[4] - 1);
  const y = L.my[4] - L.spriteH[4] * 0.4;
  if (Lay.inDecoyCore(L, 4, xEdge, y)) assert.equal(Lay.hitTest(L, xEdge, y, up, harm), 3, 'overlap goes to Finn');
  // Dead centre of the angler, outside every friendly box: the decoy.
  assert.equal(Lay.hitTest(L, L.cx[4], y, up, harm), 4);
  // In the angler's slop but outside its core (and outside Finn's box): never the decoy.
  const slopX = L.cx[4] + L.spriteH[4] * Lay.DECOY_CORE_HALF_W + 4;
  if (slopX < L.hx1[4] && slopX > L.hx1[3]) assert.notEqual(Lay.hitTest(L, slopX, y, up, harm), 4, 'slop never hits a decoy');
  // Above the decoy's core (where a friendly would have an upward extension): never the decoy.
  const above = L.my[4] - L.spriteH[4] * (Lay.DECOY_CORE_TOP + 0.05);
  assert.notEqual(Lay.hitTest(L, L.cx[4], above, up, harm), 4, 'no upward extension on decoys');
  // Without kind info it is the v4 nearest-box test (party board, old callers).
  assert.equal(Lay.hitTest(L, L.cx[4], y, up), 4);
});

test('hit test: a sweep of taps around every adjacent Finn/angler pair never charges an adjacency decoy hit', () => {
  const L = Lay.computeLayout(390, 760, 'pirates');
  const pairs = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8]];
  let decoyFromAdjacency = 0;
  for (const [a, b] of pairs) {
    for (const [finn, ang] of [[a, b], [b, a]]) {
      const up = Array(9).fill(0);
      const harm = Array(9).fill(0);
      up[finn] = 1; up[ang] = 1; harm[ang] = 1;
      for (let x = 0; x <= 390; x += 3) {
        for (let y = L.deckTop - 80; y <= L.deckBottom; y += 3) {
          const h = Lay.hitTest(L, x, y, up, harm);
          if (h !== ang) continue;
          // A decoy hit is legal only inside its core and outside the friendly box.
          const inFriendly = x >= L.hx0[finn] && x <= L.hx1[finn] && y <= L.hyBot[finn] && y >= L.hyUp[finn];
          if (inFriendly || !Lay.inDecoyCore(L, ang, x, y)) decoyFromAdjacency++;
        }
      }
    }
  }
  assert.equal(decoyFromAdjacency, 0);
});

// ---------------------------------------------------------------- unlock ladder (6.13)
test('unlock ladder v5: Ripe Golden and PERFECT at 6, helmet 7, twins 8; first Ripe Golden is centre with a long tell', () => {
  assert.equal(W.UNLOCK.ripe, 6);
  assert.equal(W.UNLOCK.helmet, 7);
  assert.equal(W.UNLOCK.twins, 8);
  assert.equal(W.UNLOCK.boss, 11);
  // Lifetime 6 = unlockLevel 5, Burst 1.
  const tl = q(9, 0, 5);
  assert.equal(tl.lifetime, 6);
  assert.equal(tl.callout, 'LET IT RIPEN... IF YOU DARE');
  const first = tl.events.find((e) => e.first && e.ug > 0);
  assert.ok(first, 'the first Ripe Golden');
  assert.equal(first.hole, 4);
  assert.equal(first.emergeAt - first.tellAt, W.FIRST_TELL_MS);
  assert.equal(first.duckAt - first.emergeAt, Math.round(first.ug * W.RIPE_FIRST_BOLT), 'never bolts before 0.92 U_g');
  assert.equal(tl.perfect, true);
  assert.equal(q(9, 0, 4).perfect, false, 'not before lifetime 6');
  assert.equal(ripes(q(9, 0, 4)).length, 0);
  for (let seed = 1; seed < 20; seed++) assert.ok(!q(seed, 0, 5).events.some((e) => e.kind === W.K_HELMET), 'no helmet before 7');
});

// ---------------------------------------------------------------- Ripe Golden (6.4)
test('Ripe Golden: queue formats only; never in the ride, live or raid rounds', () => {
  for (let seed = 1; seed < 40; seed++) {
    assert.equal(ripes(T.buildBurst({ seed, burstIndex: 0, format: 'ride', difficulty: 2, theme: 'park', unlockLevel: 40 })).length, 0);
    assert.equal(ripes(T.buildBurst({ seed, burstIndex: 0, format: 'party', difficulty: 2, theme: 'park', unlockLevel: 40 })).length, 0);
    assert.equal(ripes(T.buildBurst({ seed, burstIndex: 0, format: 'raid', difficulty: 2, theme: 'park', unlockLevel: 40 })).length, 0);
    assert.equal(T.buildBurst({ seed, burstIndex: 0, format: 'ride', difficulty: 2, theme: 'park', unlockLevel: 40 }).perfect, false);
    assert.equal(T.buildBurst({ seed, burstIndex: 0, format: 'party', difficulty: 2, theme: 'park', unlockLevel: 40 }).perfect, false);
  }
  const b2 = q(3, 1, 20);
  assert.equal(ripes(b2).length, 1, 'B2 has one Ripe Golden');
  assert.equal(ripes(q(3, 3, 20)).length, 2, 'Golden Rush has two');
  assert.ok(ripes(T.buildBurst({ seed: 3, burstIndex: 3, format: 'lineDay', difficulty: 2, theme: 'park', unlockLevel: 0 })).length >= 1, 'Line of the Day ripens');
  assert.equal(ripes(q(3, 1, 20, { rules: 4 })).length, 0, 'v4 rules never ripen');
});

test('Ripe Golden: U_g = 1.6x the golden up time; bolt times spread uniformly over 0.72-0.92 U_g', () => {
  assert.equal(W.ripeUpMs(1), 1744);
  assert.equal(W.ripeUpMs(2), 1504);
  assert.equal(W.ripeUpMs(3), 1280);
  const fracs = [];
  for (let seed = 1; seed < 400; seed++) {
    for (const e of ripes(q(seed, 3, 30))) fracs.push((e.duckAt - e.emergeAt) / e.ug);
  }
  assert.ok(fracs.length > 600);
  assert.ok(Math.min(...fracs) >= 0.719 && Math.max(...fracs) <= 0.921, `range ${Math.min(...fracs)}-${Math.max(...fracs)}`);
  // Uniform: each fifth of the window holds 20% +- 4%.
  const bins = [0, 0, 0, 0, 0];
  for (const f of fracs) bins[Math.min(4, Math.floor((f - 0.72) / 0.04))]++;
  for (const b of bins) assert.ok(Math.abs(b / fracs.length - 0.2) < 0.04, `bins ${bins}`);
  // Stage 3 always lasts at least 0.07 U_g.
  for (const f of fracs) assert.ok(f - 0.65 >= 0.069);
});

test('Ripe Golden: pays 300 / 500 / 800 flat by stage, ripens with events; a bolt is an engaged escape even when idle', () => {
  const tl = q(5, 1, 20);
  const g = ripes(tl)[0];
  const ug = g.ug;
  const pay = (into, streak = 50, fever = 0) => {
    const s = S.createSim(tl, { meter: 0, feverLeft: fever, streak }, true);
    advanceEngaged(s, g.emergeAt + into);
    const before = s.score;
    const stage = s.hStage[g.hole];
    S.simTap(s, g.hole);
    return { pts: s.score - before, stage, s };
  };
  assert.equal(pay(10).pts, 300);
  assert.equal(pay(Math.round(ug * 0.35) + 5).pts, 500);
  assert.equal(pay(Math.round(ug * 0.65) + 5).pts, 800);
  assert.equal(pay(Math.round(ug * 0.65) + 5, 0).pts, 800, 'never multiplied (x1)');
  assert.equal(pay(Math.round(ug * 0.65) + 5, 60, 5000).pts, 800, 'never multiplied (x8)');
  const pre = pay(-60);
  assert.equal(pre.pts, 300, 'a pre-emerge tap is stage 1');
  // Stage events.
  const s = S.createSim(tl, { meter: 0, feverLeft: 0, streak: 0 }, true);
  advanceEngaged(s, g.emergeAt + Math.round(ug * 0.66));
  const stages = [];
  for (let i = 0; i < s.ev.length; i += 5) if (s.ev[i] === S.E_RIPE_STAGE && s.ev[i + 1] === g.hole) stages.push(s.ev[i + 2]);
  assert.deepEqual(stages, [1, 2]);
  // The bolt: at duckAt, no hit, tier drop at x2+ even with no touch in 1200 ms.
  const b = S.createSim(tl, { meter: 0, feverLeft: 0, streak: 33 }, true);
  advanceEngaged(b, g.emergeAt + 1);
  // Keep the board live without touching for >1200 ms near the bolt: freeze is the only way to stop,
  // so advance in small steps and check the bolt happened engaged.
  let guard = 0;
  while (b.t < g.duckAt + 2 && guard++ < 50) { S.simAdvanceTo(b, g.duckAt + 2); if (b.frozen) S.simUnfreeze(b); }
  assert.equal(b.ripeBolts, 1);
  if (b.hExempt[g.hole] === 0) assert.ok(b.engagedEscapes >= 1, 'a bolt is always engaged');
});

test('Ripe Golden is a real choice: greed loses for novices; an expert never loses much by waiting (design #12, measured)', () => {
  const n = 30;
  const total = (p, i) => A.autoplayRun({ seed: 5000 + i * 104729, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 20 }, 4, p, 91 + i, 'now', T.buildBurst).total;
  let ng = 0; let nc = 0; let eg = 0; let ec = 0;
  for (let i = 0; i < n; i++) {
    ng += total({ ...A.PROFILES.novice, ripeGreed: 1 }, i);
    nc += total({ ...A.PROFILES.novice, ripeGreed: 0 }, i);
    eg += total('greedy', i);
    ec += total('cash2', i);
  }
  assert.ok(ng < nc, `novice greedy ${ng} < cash ${nc}`);
  assert.ok(eg / ec > 0.97, `expert greedy/cash ${(eg / ec).toFixed(3)}`);
});

// ---------------------------------------------------------------- PERFECT (5.2)
test('PERFECT: only on QUICKs within the window of a 16th slot, +20 flat; on-beat players earn it far more often', () => {
  const tl = q(11, 0, 20);
  const e = tl.events.find((x) => x.kind === W.K_FINN && x.emergeAt > 1000);
  const at = (t) => {
    const s = S.createSim(tl, { meter: 0, feverLeft: 0, streak: 50 }, true);
    advanceEngaged(s, t);
    S.simTap(s, e.hole);
    return s;
  };
  // emergeAt is on the 8th grid, so emergeAt + 2 sixteenths is a 16th slot inside the QUICK window.
  const slot = Math.round(Math.round((e.emergeAt + 2 * W.SIXTEENTH_MS) / W.SIXTEENTH_MS) * W.SIXTEENTH_MS);
  const on = at(slot);
  assert.equal(on.perfects, 1);
  const off = at(slot + W.PERFECT_WINDOW_MS + 8);
  assert.equal(off.perfects, 0);
  assert.equal(on.score - off.score >= W.PTS_PERFECT, true);
  // A GOOD on the beat is not PERFECT.
  const U = e.duckAt - e.emergeAt;
  const goodSlot = Math.round(Math.ceil((e.emergeAt + 0.5 * U) / W.SIXTEENTH_MS) * W.SIXTEENTH_MS);
  assert.equal(at(goodSlot).perfects, 0);
  // Rates over Runs.
  const rate = (p) => {
    let qk = 0; let pf = 0;
    for (let i = 0; i < 12; i++) {
      const r = A.autoplayRun({ seed: 900 + i * 7, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 20 }, 4, p, i, 'now', T.buildBurst);
      for (const b of r.results) { qk += b.quick; pf += b.perfects; }
    }
    return pf / qk;
  };
  const ob = rate('onbeat');
  const md = rate('median');
  assert.ok(ob >= 0.6, `onbeat ${ob.toFixed(2)}`);
  assert.ok(md >= 0.15 && md <= 0.42, `median ${md.toFixed(2)}`);
});

test('proof v5 carries the v5 resolver: Ripe Goldens, PERFECTs and look-ups replay exactly', () => {
  for (let i = 0; i < 12; i++) {
    const tl = q(70 + i, i % 4, 20);
    const r = A.autoplayBurst(tl, ['greedy', 'onbeat', 'lookup'][i % 3], i, { meter: 30, feverLeft: 0, streak: [0, 25, 40, 50][i % 4] });
    const pr = P.buildProof(tl, { meter: 30, feverLeft: 0, streak: [0, 25, 40, 50][i % 4] }, r.sim.taps, r.result, { wallMs: r.stats.wallMs, pos: r.sim.pos });
    const v = P.verifyProof(pr);
    assert.equal(v.ok, true, JSON.stringify(v).slice(0, 200));
    assert.equal(v.result.score, r.result.score);
    assert.equal(v.result.perfects, r.result.perfects);
    assert.equal(v.result.ripePoints, r.result.ripePoints);
    assert.equal(v.result.lookupDrops, r.result.lookupDrops);
  }
});
