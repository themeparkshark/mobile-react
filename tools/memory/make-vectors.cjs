'use strict';
/**
 * Writes src/games/memory/engine.vectors.json: golden runs for the PHP port
 * (WS7) of engine.ts (mm-6), modes/fairDeck.ts and charged.ts.
 *
 *   vectors  {config, init, layout, log, endAt, expect}: replay `log`
 *            (slot -1 = quick dismiss) against `layout` (faces by card id) and
 *            match `expect` (engine.summarize) exactly
 *   fair     {seed, faces, cols, rows, flips:[{slot, aFace}], expect:[face]}:
 *            the Fair Deck binds exactly these faces (default FNV pick; the
 *            server swaps in HMAC-SHA256 and keeps its own vectors)
 *   charged  {goAt, flips:[{clientT, rxPrevT, recvAt, pipelined}], expect}:
 *            per-flip charged/allowance and the try totals
 *
 *   node tools/memory/make-vectors.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');
const E = loadTs('src/games/memory/engine.ts');
const L = loadTs('src/games/memory/logic.ts');
const B = loadTs('src/games/memory/bot.ts');
const FD = loadTs('src/games/memory/modes/fairDeck.ts');
const C = loadTs('src/games/memory/charged.ts');

const ta = { ...E.timeAttackConfig(), gauge: true, quickBonus: 25 };
const configs = {
  ride: E.rideSprintConfig(45000),
  rideSignal: E.rideSprintConfig(45000, 24),
  daily: E.dailyConfig(),
  timeAttack: E.timeAttackConfig(),
  timeAttackShowtime: ta,
  timeAttackHeat: { ...ta, seagull: true, tideShift: true, heatPct: 60 },
  warmup: E.warmupConfig(),
  race: E.raceConfig(),
};
const vectors = [];
let n = 0;
for (const mode of Object.keys(configs)) {
  for (const [recall, turnMs] of [[1, 1000], [0.75, 1500], [0.6, 1800], [0.3, 2600]]) {
    for (let k = 0; k < 3; k++) {
      const seed = 4242 + n++ * 131;
      const pairs = mode === 'warmup' ? 4 : mode.startsWith('timeAttack') ? 6 : 8;
      const special = mode.startsWith('timeAttack') || mode === 'race';
      const layout = L.buildLayout({ pairs, deckSize: 10, seed: L.boardSeed(seed, 0), golden: special, gull: mode === 'timeAttackHeat' });
      const init = { cols: layout.cols, rows: layout.rows, seed };
      const s = E.createEngine(configs[mode], init);
      const rng = L.makeRng(seed ^ 77);
      let t = 0;
      for (let g = 0; g < 300 && s.status === 'play'; g++) {
        t += Math.round(turnMs / 2 + (rng() - 0.5) * 400);
        E.step(s, { t: 'tick', at: t });
        if (s.status !== 'play') break;
        if (s.phase === 2 && rng() < 0.6) E.step(s, { t: 'dismiss', slot: -1, at: t });
        const slot = B.botPick(s, recall, rng);
        if (slot < 0) break;
        if (s.phase === 2) E.step(s, { t: 'dismiss', slot: -1, at: t });
        E.step(s, { t: 'flip', slot, face: layout.faces[s.ids[slot]], at: t });
      }
      const endAt = t + 500;
      E.step(s, { t: 'tick', at: endAt });
      vectors.push({ id: `${mode}-${recall}-${k}`, mode, config: JSON.parse(JSON.stringify(configs[mode])), init, layout: Array.from(layout.faces), log: Array.from(s.log), endAt, expect: JSON.parse(JSON.stringify(E.summarize(s))) });
    }
  }
}

// Fair Deck binding vectors: random flip orders on 4x2 and 4x4.
const fair = [];
for (let i = 0; i < 24; i++) {
  const seed = 9001 + i * 977;
  const rows = i % 3 === 0 ? 2 : 4;
  const pairs = rows * 2;
  const faces = Array.from({ length: pairs }, (_, k) => (k * 3 + i) % 10).filter((v, idx, arr) => arr.indexOf(v) === idx);
  while (faces.length < pairs) faces.push(faces.length + 10);
  const d = FD.createFairDeck(seed, faces, 4, rows);
  const rng = L.makeRng(seed);
  const flips = [];
  const out = [];
  const matched = new Array(4 * rows).fill(false);
  let a = -1;
  for (let g = 0; g < 200 && matched.some((m) => !m); g++) {
    const open = [];
    for (let s2 = 0; s2 < 4 * rows; s2++) if (!matched[s2] && s2 !== a) open.push(s2);
    const slot = open[Math.floor(rng() * open.length)];
    const aFace = a >= 0 ? d.slots[a] : null;
    const face = FD.fairFlip(d, slot, aFace);
    flips.push({ slot, aFace });
    out.push(face);
    if (a < 0) a = slot;
    else {
      if (d.slots[a] === face) { matched[a] = true; matched[slot] = true; }
      a = -1;
    }
  }
  fair.push({ id: `fair-${i}`, seed, faces, cols: 4, rows, flips, expect: out, novelty: Array.from(d.novelty) });
}

// Charged clock vectors under a few latency traces.
const charged = [];
const traces = [[50], C.PARK_TRACE_P95_1500, [2400], [100, 3000, 120, 90]];
traces.forEach((trace, i) => {
  const cs = C.createCharge(0);
  let rxPrev = 0;
  let sent = 0;
  const flips = [];
  const per = [];
  for (let k = 0; k < 20; k++) {
    const think = 400 + ((k * 211 + i * 97) % 900);
    const pipelined = k % 7 === 6;
    const clientT = pipelined ? rxPrev - 30 : rxPrev + think;
    const rtt = trace[k % trace.length];
    const recvAt = Math.max(sent, clientT + rtt / 2);
    const f = { clientT, rxPrevT: rxPrev, recvAt, pipelined };
    const r = C.chargeFlip(cs, f);
    C.revealSent(cs, recvAt);
    sent = recvAt;
    rxPrev = recvAt + rtt / 2;
    flips.push(f);
    per.push(r);
  }
  charged.push({ id: `charged-${i}`, goAt: 0, flips, expect: { per, chargedMs: cs.chargedMs, allowanceMs: cs.allowanceMs, capHit: cs.capHit } });
});

const outPath = path.resolve(__dirname, '../../src/games/memory/engine.vectors.json');
fs.writeFileSync(outPath, JSON.stringify({
  engine: E.ENGINE_VERSION,
  note: 'Golden vectors for the PHP port. vectors: replay log (slot -1 = quick dismiss) against layout (faces by card id). fair: Fair Deck binds with the FNV pick. charged: charged-clock math per flip.',
  vectors,
  fair,
  charged,
}, null, 1) + '\n');
console.log(`wrote ${vectors.length} engine, ${fair.length} fair, ${charged.length} charged vectors to ${path.relative(process.cwd(), outPath)}`);
