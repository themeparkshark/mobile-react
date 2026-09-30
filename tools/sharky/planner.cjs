'use strict';
/**
 * Planner bots for the chunk gates (design 14.7).
 *
 *   dfsClear(s, opts): depth-first search over hold/release decisions every
 *   `every` steps, backtracking on any hit. With every=1 it is the
 *   frame-perfect BFS bot; with every=7 and a committed plan it is the
 *   human-reaction bot (it can not change input more often than 120ms).
 *
 * Returns { ok, nodes, log } where log is the input list that cleared it.
 */
const path = require('node:path');
const { loadTs } = require(path.join(__dirname, '../tests/helpers/ts-module.cjs'));
const core = loadTs('src/games/sharky/sim/core.ts');

function advance(s, hold, steps, log) {
  for (let k = 0; k < steps; k++) {
    if (hold && !s.holding) { log && log.push({ step: s.step, kind: core.IN_PRESS, sub: 0, arg: 0 }); core.applyInput(s, core.IN_PRESS, 0, 0); }
    if (!hold && s.holding) { log && log.push({ step: s.step, kind: core.IN_RELEASE, sub: 0, arg: 0 }); core.applyInput(s, core.IN_RELEASE, 0, 0); }
    const hearts = s.hearts;
    const shield = s.shield;
    core.step(s);
    if (s.hearts < hearts || s.shield < shield) return false;
    if (s.phase !== core.PH_PLAY) return true;
  }
  return true;
}

function dfsClear(start, opts = {}) {
  const every = opts.every || 4;
  const maxNodes = opts.maxNodes || 60000;
  const untilX = opts.untilX; // stop when shark passes this world x (u)
  let nodes = 0;
  const log = [];
  function rec(s, depth) {
    if ((s.dist >> 8) >= untilX || s.phase !== core.PH_PLAY) return true;
    if (++nodes > maxNodes) return false;
    // Heuristic ordering: try the choice that moves toward the bot target first.
    const ty = core.botTargetY(s, (s.speed >> 8) + 120);
    const first = (s.y >> 8) > ty ? 1 : 0;
    for (const hold of [first, 1 - first]) {
      const c = core.cloneSim(s);
      const mark = log.length;
      if (advance(c, hold === 1, every, log) && rec(c, depth + 1)) return true;
      log.length = mark;
    }
    return false;
  }
  const ok = rec(core.cloneSim(start), 0);
  return { ok, nodes, log };
}

/** A sim positioned before one chunk at a fixed speed, with no systems noise. */
function chunkSim(chunkId, speedU, opts = {}) {
  const s = core.createSim({ seed: 7, mode: core.MODE_QUEUE, difficulty: opts.diff || 3, tier: 12, runs: 9 });
  s.speedBase = speedU * 256;
  s.speedCap = speedU * 256;
  s.speed = speedU * 256;
  s.activeSteps = 0; // keeps Float from arming mid-test (needs > 180 active steps)
  s.clockSteps = 100000;
  core.setCourse(s, [chunkId], opts.lead || 500);
  s.y = (opts.y || 500) * 256;
  return s;
}

module.exports = { core, dfsClear, chunkSim, advance };

if (require.main === module) {
  const speed = Number(process.argv[2] || 560);
  for (const c of core.CHUNKS) {
    const res = [];
    for (const every of [1, 4, 7]) {
      let okAll = true;
      let nodes = 0;
      for (const y0 of [150, 500, 850]) {
        const s = chunkSim(c.id, speed, { y: y0 });
        const r = dfsClear(s, { every, untilX: s.gateX - 100 });
        nodes += r.nodes;
        if (!r.ok) okAll = false;
      }
      res.push(`e${every}:${okAll ? 'ok' : 'FAIL'}(${nodes})`);
    }
    console.log(String(c.id).padStart(2), c.name.padEnd(16), res.join('  '));
  }
}
