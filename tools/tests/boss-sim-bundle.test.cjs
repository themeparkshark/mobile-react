'use strict';
/**
 * Boss Brawl server replay: the content-hashed sim bundle (sim-runner,
 * {game: 'boss', sim_version: 8}) replays every golden fixture exactly like
 * the app's TS sim, accepts honest bot proofs and rejects the design 18.1
 * cases (offset, order, events after the end, input rate, get-up rate, boons
 * outside the seeded offer).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadTs } = require('./helpers/ts-module.cjs');

const C = loadTs('src/games/boss/sim/constants.ts');
const bots = loadTs('src/games/boss/sim/bots.ts');
const round = loadTs('src/games/boss/sim/round.ts');
const pat = loadTs('src/games/boss/sim/patterns.ts');

async function bundle() {
  const mod = await import(pathToFileURL(path.join(__dirname, '../boss/build-boss-sim-bundle.mjs')).href);
  const { code, name, hash } = mod.buildBundle();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-sim-'));
  fs.writeFileSync(path.join(dir, name), code);
  const b = require(path.join(dir, name));
  return { b, hash, code };
}

test('bundle: pure (no clock, randomness or bare imports), hashed, routed as boss@8', async () => {
  const { b, hash, code } = await bundle();
  assert.equal(b.SIM_BUNDLE, hash);
  assert.equal(b.BOSS_SIM.key, 'boss');
  assert.equal(b.BOSS_SIM.version, C.SIM_VERSION);
  assert.ok(!/Math\.random|\bDate\b/.test(code));
});

test('bundle replays every v8 golden fixture to the same per-bout damage and events as the app', async () => {
  const { b } = await bundle();
  const enc = loadTs('src/games/boss/sim/encounter.ts');
  const reg = loadTs('src/games-registry/bossSim.ts');
  for (const boss of ['kraken', 'robo_shark', 'ghost_squid']) {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/boss-replays', `${boss}.json`), 'utf8'));
    assert.equal(fx.version, 8);
    for (const r of fx.rounds) {
      const log = { boss, seed: r.seed, variant: r.variant, bouts: r.bouts };
      const v = b.BOSS_SIM.replayRound(log);
      assert.deepEqual(v.map((x) => x.damage), r.damage, `${boss} ${r.seed} ${r.bot}`);
      assert.ok(v.every((x) => x.ok), `${boss} ${r.seed} ${r.bot}: ${v.map((x) => x.reason).join(',')}`);
      // Bundle equals client: same damage and the same events hash as the app's own sim.
      const app = reg.replayBossRound(log);
      assert.equal(JSON.stringify(v.map((x) => [x.damage, x.hash, x.tko])), JSON.stringify(app.map((x) => [x.damage, x.hash, x.tko])));
      assert.equal(JSON.stringify(round.replayRound(log).map((x) => enc.scoreBout(x))), JSON.stringify(r.damage));
    }
  }
});

test('v7 proofs keep replaying with the frozen v7 bundle; the v8 bundle refuses them by version', async () => {
  const dir = path.join(__dirname, '../boss/bundles');
  const v7 = require(path.join(dir, 'boss-sim.6a349dc81e51.cjs'));
  assert.equal(v7.SIM_BUNDLE, '6a349dc81e51');
  assert.equal(v7.BOSS_SIM.version, 7);
  const { b } = await bundle();
  for (const boss of ['kraken', 'robo_shark', 'ghost_squid']) {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/boss-replays/v7', `${boss}.json`), 'utf8'));
    assert.equal(fx.version, 7);
    for (const r of fx.rounds) {
      const log = { boss, seed: r.seed, variant: r.variant, bouts: r.bouts };
      const v = v7.BOSS_SIM.replayRound(log);
      assert.deepEqual(v.map((x) => x.damage), r.damage, `${boss} ${r.seed} ${r.bot}`);
      assert.ok(v.every((x) => x.ok));
      assert.ok(b.BOSS_SIM.replayRound(log).every((x) => x.reason === 'version' && x.damage === 0));
    }
  }
  // Frozen bundles kept for the sidecar (the current version is built fresh by build-boss-sim-bundle.mjs).
  const versions = fs.readdirSync(dir).filter((f) => f.endsWith('.cjs')).map((f) => require(path.join(dir, f)).BOSS_SIM.version);
  assert.ok(versions.every((x) => x < C.SIM_VERSION) && versions.includes(7));
});

test('rejects tampered proofs with reason codes; damage 0 for the bout', async () => {
  const { b } = await bundle();
  const seed = 31337;
  const bs = bots.runBotRound('kraken', seed, bots.BOTS.median);
  const log = { boss: 'kraken', seed, variant: 1, bouts: bs.map(round.boutProof) };
  const base = b.BOSS_SIM.replayRound(log);
  assert.ok(base.every((x) => x.ok));
  const tamper = (n, f) => {
    const l = JSON.parse(JSON.stringify(log));
    f(l.bouts[n]);
    return b.BOSS_SIM.replayRound(l)[n];
  };
  assert.equal(tamper(0, (p) => { p.input_offset_ms = 200; }).reason, 'offset');
  assert.equal(tamper(0, (p) => { p.events.push({ t: p.sim_ms + 500, k: C.IN_TARGET, a: 0 }); }).reason, 'after_end');
  assert.equal(tamper(0, (p) => { p.events.splice(2, 0, { t: p.events[1].t - 5, k: C.IN_TARGET, a: 0 }); }).reason, 'order');
  assert.equal(tamper(0, (p) => {
    const t0 = 3000;
    const extra = Array.from({ length: 9 }, (_, i) => ({ t: t0 + i * 50, k: C.IN_TARGET, a: i % 3 }));
    p.events = [...p.events, ...extra].sort((x, y) => x.t - y.t);
  }).reason, 'rate');
  const notOffered = [1, 2, 3, 4].find((id) => !pat.boonOffer(seed, 1).includes(id));
  const bad = tamper(1, (p) => { p.events[0] = { t: 0, k: C.IN_BOON, a: notOffered }; });
  assert.equal(bad.reason, 'boon');
  assert.equal(bad.damage, 0);
  const v = tamper(0, (p) => { p.sim_version = 4; });
  assert.equal(v.reason, 'version');
});
