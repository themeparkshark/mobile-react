#!/usr/bin/env node
'use strict';
/**
 * Backend hand-off fixtures for the PHP verifier (design v7.1 15.3, 18.3):
 *   - pick-fixture.json: board issue (ids + transforms) for scored contexts and
 *     Showdowns over a range of seeds, plus real proof v3s (a LinePlay bonus
 *     run with a slip undo, a Ride Challenge run with a ring and a Trial tip,
 *     a Showdown run with a landed Splash and a counter) the server must
 *     verify, and tampered copies it must reject.
 *   - copies vectors.v3.json next to it.
 *
 *   node tools/current-quest/build-fixture.cjs [--out <dir>]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const R = loadTs('src/games/current-quest/rules.ts');
const S = loadTs('src/games/current-quest/solver.ts');
const L = loadTs('src/games/current-quest/library.ts');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : '/Users/dustinsparage/apps/tps-prime-time-audit/studio/currentquest/backend-note';

const picks = [];
for (let seed = 0; seed < 8; seed++) {
  for (const ctx of ['ride', 'line', 'showdown']) picks.push({ seed, ctx, ids: L.pickRun(seed, ctx).map((b) => b.id) });
}

/** A human-paced solved run. `slip`: one wrong stroke undone 900 ms later on voyage 0. `tip`: a ring and a Trial tip on voyage 1. */
function proofFor(seed, context, knobs, { slip = false, tip = false, sp = null } = {}) {
  const boards = L.pickRun(seed, context);
  let run = R.createRun(boards, knobs, sp || undefined);
  let t = 0;
  const voyages = [];
  boards.forEach((b, vi) => {
    const sol = S.solveBoard(b);
    const ready = t + 450;
    t = ready + 2200;
    const a = [];
    const ts = [];
    const push = (act, gap) => {
      const res = R.applyAction(run, act, t);
      if (!res.ok || !res.recorded) throw new Error(`fixture action ${act} rejected`);
      run = res.run;
      a.push(act);
      ts.push(t);
      t += gap;
    };
    if (slip && vi === 0) {
      const wrong = [0, 1, 2, 3].find((d) => d !== sol.solution[0] && R.previewFor(run, d).valid);
      push(wrong, 900);
      push(R.A_UNDO, 1100);
    }
    if (tip && vi === 1) { push(R.A_CONTINUE, 900); push(R.A_TIP, 1600); }
    let guard = 0;
    while (run.index === vi && !run.complete && guard++ < 40) push(S.hintFrom(b, run.voyage, 1, Infinity)[0], 750);
    void sol;
    voyages.push({ id: b.id.split('~')[0], tf: R.transformOf(b.id), sp: sp ? sp[vi] : null, a, t: ts, ready });
  });
  const shells = R.totalShells(run.results);
  return {
    seed, context,
    proof: {
      game: 'current', v: 3, context, profile: knobs.profile, rings: knobs.rings, seed, haul: R.haulOf(run.results),
      stars: R.starsFor(shells, run.complete, boards.length), shells, elapsed_ms: t + 400, banked: null, voyages,
    },
  };
}

const SD = { ...R.PUZZLE_KNOBS, showdown: true };
const proofs = [
  proofFor(99, 'line', R.LINE_BONUS_KNOBS, { slip: true }),
  proofFor(4242, 'ride', R.RIDE_KNOBS, { tip: true }),
  proofFor(31337, 'showdown', SD, { sp: [null, { id: 'sd:7:1', blocked: 0, by: null }, { id: 'sd:7:2', blocked: 1, by: 'counter' }] }),
];
const knobsOf = (c) => (c === 'ride' ? R.RIDE_KNOBS : c === 'line' ? R.LINE_BONUS_KNOBS : SD);
for (const p of proofs) {
  const v = R.verifyProof(L.pickRun(p.seed, p.context), knobsOf(p.context), p.proof);
  if (!v.ok) throw new Error(`fixture proof ${p.context} does not verify: ${v.reason}`);
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'pick-fixture.json'), JSON.stringify({ design: 'v7.1', picks, proofs }, null, 1));
fs.copyFileSync(path.join(root, 'tools/current-quest/vectors.v3.json'), path.join(OUT, 'vectors.v3.json'));
process.stdout.write(`${picks.length} picks, ${proofs.length} proofs (shells ${proofs.map((p) => p.proof.shells).join(', ')}) -> ${OUT}\n`);
