'use strict';
/**
 * The sidecar bundle (tools/build-sim-bundle.mjs) is the only thing the server
 * scores with, so: the bundle is deterministic, it matches the TS sources, and
 * every golden vector (208 seeds x 4 logs per game) replays exactly on both.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const registry = loadTs('src/games-registry/partySims.ts').PARTY_SIMS;

async function bundle() {
  const { loadBundle } = await import(path.join(root, 'tools/party/gen-sim-vectors.mjs'));
  return loadBundle();
}

test('the bundle hash is stable across builds', async () => {
  const { buildBundle } = await import(path.join(root, 'tools/build-sim-bundle.mjs'));
  const a = buildBundle();
  const b = buildBundle();
  assert.equal(a.hash, b.hash);
  assert.match(a.name, /^party-sims\.[0-9a-f]{12}\.cjs$/);
});

for (const key of Object.keys(registry)) {
  test(`${key}: 200+ golden vectors replay identically from source and from the bundle`, async () => {
    const vectors = require(`../fixtures/party-sim/${key}.json`);
    const { sims } = await bundle();
    const src = registry[key];
    const bun = sims[key];
    assert.equal(vectors.sim_version, src.version);
    assert.equal(bun.version, src.version);
    assert.ok(vectors.vectors.length >= 200);
    let checked = 0;
    for (const v of vectors.vectors) {
      const boardA = src.build(v.seed);
      const boardB = bun.build(v.seed);
      for (const [name, log] of Object.entries(v.logs)) {
        const a = src.resolve(boardA, log.taps);
        const b = bun.resolve(boardB, log.taps);
        assert.equal(a.score, log.score, `${key} seed ${v.seed} ${name}`);
        assert.equal(src.resultHash(a), log.hash, `${key} seed ${v.seed} ${name}`);
        assert.equal(bun.resultHash(b), log.hash, `${key} seed ${v.seed} ${name} (bundle)`);
        assert.ok(src.validTaps(log.taps), `${key} seed ${v.seed} ${name} valid`);
        checked++;
      }
      assert.deepEqual(JSON.parse(JSON.stringify(src.botTaps(boardA, v.seed, v.seat, v.profile))), v.logs.bot.taps);
      // Room settle (SNATCH), key moments and the prefix replay match on both engines.
      const names = Object.keys(v.logs);
      for (const [sim, board] of [[src, boardA], [bun, boardB]]) {
        const settle = sim.settle(names.map((n) => sim.resolve(board, v.logs[n].taps)));
        assert.deepEqual(JSON.parse(JSON.stringify(settle)), v.settle, `${key} seed ${v.seed} settle`);
        names.forEach((n, j) => assert.deepEqual(JSON.parse(JSON.stringify(sim.explain(board, v.logs[n].taps, settle, j))), v.logs[n].explain ?? null, `${key} seed ${v.seed} ${n} explain`));
        const pr = sim.resolve(board, v.logs.human.taps, v.prefix.until_ms);
        assert.equal(sim.resultHash(pr), v.prefix.hash, `${key} seed ${v.seed} prefix`);
      }
    }
    assert.ok(checked >= 800);
  });
}
