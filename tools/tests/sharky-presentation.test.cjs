'use strict';
/**
 * Sharky v7.1 presentation guards (design 14.17, 14.18, 14.27): one colour per
 * meaning, no ride names in game UI, the haptic diet, and the presentation
 * director's stamps and local freezes.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'src/games/sharky');
function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.generated.ts')) out.push(p);
  }
  return out;
}

test('palette guard: no raw coral or gold hex outside render/palette.ts', () => {
  const bad = [];
  for (const f of walk(dir)) {
    if (f.endsWith(path.join('render', 'palette.ts'))) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (/#ff6b57|#ffc233/i.test(src)) bad.push(path.relative(root, f));
  }
  assert.deepEqual(bad, []);
});

test('no ride names in game UI: SharkySwim never renders taskName, and no deny-listed name appears in src/games/sharky', () => {
  const swim = fs.readFileSync(path.join(dir, 'SharkySwim.tsx'), 'utf8');
  assert.match(swim, /subtitle=\{courseLabel\(rideCategory\)\}/);
  const body = swim.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(body, /=\{taskName\}|\{taskName\}|taskName,\s*rideId/);
  const deny = JSON.parse(fs.readFileSync(path.join(root, 'tools/sharky/trademark-denylist.json'), 'utf8')).names;
  const hits = [];
  for (const f of walk(dir)) {
    const s = fs.readFileSync(f, 'utf8');
    for (const n of deny) if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s)) hits.push(`${path.relative(root, f)}: ${n}`);
  }
  assert.deepEqual(hits, []);
});

test('haptic diet: coins, lines, plain rings, grazes, tokens, chain breaks, scatters, touches, bounces, Float in and clock ticks are silent in the hand', () => {
  const src = fs.readFileSync(path.join(dir, 'sharkyFeel.ts'), 'utf8');
  const cases = {};
  const re = /case (EV_[A-Z_]+):([\s\S]*?)(?=\n {8}case EV_|\n {8}default:)/g;
  let m;
  while ((m = re.exec(src))) cases[m[1]] = m[2];
  for (const k of ['EV_COIN', 'EV_LINE', 'EV_GRAZE', 'EV_TOKEN', 'EV_TOKEN_SET', 'EV_CHAIN_BREAK', 'EV_SCATTER', 'EV_TOUCH', 'EV_BOUNCE', 'EV_FLOAT_IN', 'EV_CLOCK_TICK', 'EV_REGRAB', 'EV_LINE_BOOST', 'EV_PASS']) {
    assert.ok(cases[k] !== undefined, `${k} handled`);
    assert.doesNotMatch(cases[k], /playHaptic/, `${k} must not buzz`);
  }
  // A plain ring is silent; a Perfect is Medium.
  assert.match(cases.EV_RING, /if \(c\) \{[\s\S]*playHaptic\(\[\{ at: 0, p: 'medium' \}\]\)[\s\S]*\} else \{(?![\s\S]*playHaptic)/);
  // Close Skim: Light then selection 50ms later; plain Skim silent.
  assert.match(cases.EV_SKIM, /\{ at: 0, p: 'light' \}, \{ at: 50, p: 'selection' \}/);
  assert.match(fs.readFileSync(path.join(dir, 'SharkySwim.tsx'), 'utf8'), /configureHaptics\('sharky'\)/);
});

test('presentation director: Close Skim, Perfect and Chomp freeze the shark locally and stamp once; banners outrank stamps', () => {
  const core = loadTs('src/games/sharky/sim/core.ts');
  const pres = loadTs('src/games/sharky/render/pres.ts');
  const s = core.createSim({ seed: 1, mode: 0, difficulty: 2, tier: 4, runs: 5 });
  core.setCourse(s, [], 20000);
  const p = pres.createPres();
  const i = core.spawn(s, core.E_PYLON, (s.dist >> 8) + 100, 500, 380, 0, 0);
  s.evN = 1;
  s.evStale = 0;
  s.ev[0] = core.EV_SKIM; s.ev[1] = 0; s.ev[2] = 0; s.ev[3] = 1; s.ev[4] = i;
  pres.presStep(p, s, 1000);
  assert.equal(p.stamp, pres.ST_CLOSE);
  assert.equal(p.freezeUntil, 1033, '33ms local freeze');
  assert.equal(p.closeEnt, i);
  s.ev[0] = core.EV_RING; s.ev[3] = 1;
  pres.presStep(p, s, 1100);
  assert.equal(p.stamp, pres.ST_PERFECT);
  assert.equal(p.freezeUntil, 1150, '50ms local freeze');
  s.ev[0] = core.EV_FRENZY_START;
  pres.presStep(p, s, 1200);
  assert.equal(p.stamp, pres.ST_FRENZY);
  s.ev[0] = core.EV_CHOMP;
  pres.presStep(p, s, 1300);
  assert.equal(p.stamp, pres.ST_FRENZY, 'a banner is not replaced by a small stamp inside 700ms');
  // During the freeze the shark holds its y; the tail phase does not advance.
  const ph = p.tailPh;
  pres.presFrame(p, s, 16, 1310, 500, false);
  assert.equal(p.tailPh, ph);
  pres.presFrame(p, s, 16, 1400, 500, false);
  assert.ok(p.tailPh > ph);
});
