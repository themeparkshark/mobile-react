'use strict';
/**
 * Writes src/games/memory/engine.vectors.json: golden runs for the PHP port of
 * engine.ts (WS7). Each vector is {config, layout, seed, log, endAt, expect}.
 * The PHP engine must replay `log` against `layout` and match `expect` exactly.
 *   node tools/memory/make-vectors.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');
const E = loadTs('src/games/memory/engine.ts');
const L = loadTs('src/games/memory/logic.ts');
const B = loadTs('src/games/memory/bot.ts');

const configs = { ride: E.rideSprintConfig(45000), daily: E.dailyConfig(), timeAttack: E.timeAttackConfig() };
const vectors = [];
let n = 0;
for (const mode of ['ride', 'daily', 'timeAttack']) {
  for (const [recall, turnMs] of [[1, 1000], [0.6, 1800], [0.3, 2600]]) {
    for (let k = 0; k < 4; k++) {
      const seed = 4242 + n++ * 131;
      const pairs = mode === 'timeAttack' ? 6 : 8;
      const layout = L.buildLayout({ pairs, deckSize: 10, seed: L.boardSeed(seed, 0), golden: true });
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
const out = path.resolve(__dirname, '../../src/games/memory/engine.vectors.json');
fs.writeFileSync(out, JSON.stringify({ engine: E.ENGINE_VERSION, note: 'Golden vectors for the PHP port. Replay log (slot -1 = quick dismiss) against layout (faces by card id).', vectors }, null, 1) + '\n');
console.log(`wrote ${vectors.length} vectors to ${path.relative(process.cwd(), out)}`);
