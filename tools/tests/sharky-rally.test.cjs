'use strict';
/**
 * Sharky Rally (design v7.1 section 11): shared rally rules, Bubble Gift,
 * drafting, the rally transport, and a full lab round with two live clients
 * (server seed, synced start, ghost seats, server replay, gift relay and gift
 * verification, ghost fill, placements by verified score).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const core = loadTs('src/games/sharky/sim/core.ts');
const rally = loadTs('src/games/sharky/sim/rally.ts');
const bots = loadTs('src/games/sharky/sim/bots.ts');
const verify = loadTs('src/games/sharky/sim/verify.ts');
const transport = loadTs('src/games/sharky/net/raceTransport.ts', {}, { setInterval, clearInterval, WebSocket: function () {} });
const Q = 256;

test('ghost seats: a seat plans the identical log everywhere; ranking is verified score, then Close Skims within 1%', () => {
  const a = rally.rallyBot(424242, 2, 'ace');
  const b = rally.rallyBot(424242, 2, 'ace');
  assert.equal(a.inputs, b.inputs);
  assert.equal(a.finished, true);
  const s = core.replay(rally.rallyConfig(424242), core.decodeInputs(a.inputs), rally.RALLY_MAX_STEPS);
  assert.equal(s.score, a.score, 'the phone replays the server-planned ghost exactly');
  assert.notEqual(rally.rallyBot(424242, 3, 'ace').inputs, a.inputs, 'seats differ');
  const r = (finished, score, closeSkims) => ({ finished, score, closeSkims });
  assert.ok(rally.rallyCompare(r(true, 5000, 0), r(true, 4800, 9)) < 0, 'score wins');
  assert.ok(rally.rallyCompare(r(true, 5000, 6), r(true, 5020, 2)) < 0, 'within 1%, more Close Skims wins');
  assert.ok(rally.rallyCompare(r(true, 10, 0), r(false, 99999, 50)) < 0, 'any finisher beats a DNF');
});

test('rally course: about 18s, a split gate and the Ride Gate finish, tier-3 set and D2 for everyone, a fixed 400-460 u/s curve, no clock and no distance points', () => {
  const s = core.createSim(rally.rallyConfig(99));
  assert.equal(s.etier, 3);
  assert.equal(s.gateKind, core.G_FINISH);
  let split = false;
  for (let i = 0; i < core.ENT_CAP; i++) if (s.et[i] === core.E_GATE && s.ep1[i] === core.G_SPLIT) split = true;
  assert.ok(split);
  assert.equal(s.speedBase, 400 * Q);
  assert.equal(s.speedCap, 460 * Q);
  assert.ok(s.sprintStart - (s.dist >> 8) >= core.aheadU(s) + 300, 'badge lead at GO');
  const run = bots.planRun(rally.rallyConfig(99), bots.BOT_PROFILES.regular, 5, rally.RALLY_MAX_STEPS).s;
  assert.equal(run.endReason, core.END_FINISH);
  const secs = run.finishStep / 60;
  assert.ok(secs > 16 && secs < 22, `rally length ${secs.toFixed(1)}s`);
  assert.equal(run.clockSteps, core.CLOCK_BASE, 'no tide clock in a rally');
  // No distance points: a no-input ghost that floats scores nothing from distance.
  const idle = core.replay(rally.rallyConfig(99), [], 600);
  assert.ok(idle.score < 200);
  assert.equal(run.splitScores[0] > 0, true, 'a score split is taken at the mid gate');
});

test('rally deciders: the skill line beats the lazy line in at least 85% of heats; nobody gets catch-up speed', () => {
  let skillWins = 0;
  const heats = 30;
  for (let h = 0; h < heats; h++) {
    const seed = 5000 + h * 131;
    const skill = rally.rallyBot(seed, 0, 'ace');
    const lazy = rally.rallyBot(seed, 1, 'lazy');
    if (rally.rallyCompare(skill, lazy) < 0) skillWins++;
  }
  assert.ok(skillWins / heats >= 0.85, `skill won ${skillWins}/${heats}`);
  const src = require('node:fs').readFileSync(path.join(root, 'src/games/sharky/sim/core.ts'), 'utf8');
  assert.doesNotMatch(src, /catchup|catch_up|rubber/i, 'no catch-up code path');
  // Overdrive never changes speed in a rally.
  const s = core.createSim(rally.rallyConfig(7));
  core.setCourse(s, [], 20000);
  s.od = 100;
  core.step(s);
  assert.equal(s.speedEff, s.speed);
});

test('drafting a rival fills Boost (+100 per second) and never changes speed', () => {
  const s = core.createSim(rally.rallyConfig(7));
  core.setCourse(s, [], 20000);
  core.applyInput(s, core.IN_EXT, core.EXT_DRAFT_ON, 1);
  core.step(s);
  assert.equal(s.speedEff, s.speed);
  for (let i = 0; i < 60; i++) core.step(s);
  assert.equal(s.boost, 100, 'one Boost segment per second in the draft');
});

test('Bubble Gift: a 5-coin line lands in the receiver lane at least 1.5s ahead, clear of hazards and gates, at most one per 5s, rally only', () => {
  const s = core.createSim(rally.rallyConfig(31));
  core.setCourse(s, [], 4000);
  for (let k = 0; k < 40; k++) core.step(s);
  s.y = 640 * Q;
  core.applyInput(s, core.IN_EXT, core.EXT_BUBBLE_GIFT, 77);
  let gift = -1;
  for (let i = 0; i < core.ENT_CAP; i++) if (s.et[i] === core.E_GIFT) gift = i;
  assert.ok(gift >= 0, 'gift placed');
  assert.equal(s.ep1[gift], 77);
  assert.equal(s.ey[gift], 640, 'in the receiver lane');
  assert.ok(s.ex[gift] - (s.dist >> 8) >= ((s.speed >> 8) * 3) / 2 - 1, '>= 1.5s ahead');
  // A second gift inside 5s is ignored.
  core.applyInput(s, core.IN_EXT, core.EXT_BUBBLE_GIFT, 78);
  let gifts = 0;
  for (let i = 0; i < core.ENT_CAP; i++) if (s.et[i] === core.E_GIFT) gifts++;
  assert.equal(gifts, 1);
  // It pops into 5 coins (one coin line) and can never hurt or move the shark.
  const hearts = s.hearts;
  let popped = false;
  for (let k = 0; k < 200 && !popped; k++) {
    const vy = s.vy;
    core.step(s);
    for (let e = 0; e < s.evN; e++) if (s.ev[e * 5] === core.EV_GIFT_POP) popped = true;
    void vy;
  }
  assert.ok(popped);
  let coins = 0;
  for (let i = 0; i < core.ENT_CAP; i++) if (s.et[i] === core.E_COIN && (s.ep2[i] & core.CF_GIFT)) coins++;
  assert.equal(coins, 5);
  assert.equal(s.hearts, hearts);
  // Never outside a rally.
  const q = core.createSim({ seed: 1, mode: core.MODE_QUEUE, difficulty: 2, tier: 4, runs: 5 });
  core.setCourse(q, [], 4000);
  core.applyInput(q, core.IN_EXT, core.EXT_BUBBLE_GIFT, 1);
  for (let i = 0; i < core.ENT_CAP; i++) assert.notEqual(q.et[i], core.E_GIFT);
  // Never within 300u of a hazard: a pylon right at the target pushes it on.
  const h = core.createSim(rally.rallyConfig(31));
  core.setCourse(h, [], 4000);
  const tx = (h.dist >> 8) + (((h.speed >> 8) * 3) >> 1);
  core.spawn(h, core.E_PYLON, tx + 20, 500, 380, 0, 0);
  core.applyInput(h, core.IN_EXT, core.EXT_BUBBLE_GIFT, 5);
  for (let i = 0; i < core.ENT_CAP; i++) if (h.et[i] === core.E_GIFT) assert.ok(h.ex[i] > tx + 20 + 120 + 300 || h.ex[i] + 580 < tx + 20);
});

test('Bubble Gifts are worth at most 400 points even in Frenzy and rarely decide a heat (heats replayed without gifts keep the winner in at least 90%)', () => {
  // Direct value: all 5 gift coins plus the line at the x6 Frenzy ceiling.
  const s = core.createSim(rally.rallyConfig(11));
  core.setCourse(s, [], 6000);
  s.chain = 20;
  s.chainTimer = 120;
  s.frenzy = 360;
  for (let k = 0; k < 20; k++) core.step(s);
  core.applyInput(s, core.IN_EXT, core.EXT_BUBBLE_GIFT, 9);
  let lane = 500;
  for (let i = 0; i < core.ENT_CAP; i++) if (s.et[i] === core.E_GIFT) lane = s.ey[i];
  const before = s.score;
  let got = 0;
  for (let k = 0; k < 220; k++) {
    s.y = lane * Q;
    s.vy = 0;
    s.lastTouch = s.step;
    s.frenzy = 360;
    s.distAcc = -100000;
    core.step(s);
    for (let e = 0; e < s.evN; e++) if (s.ev[e * 5] === core.EV_COIN && (s.ev[e * 5 + 4] & 16)) got++;
  }
  assert.equal(got, 5);
  assert.ok(s.score - before <= 400, `gift worth ${s.score - before}`);
  let same = 0;
  const heats = 20;
  for (let h = 0; h < heats; h++) {
    const seed = 7100 + h * 97;
    const cfg = rally.rallyConfig(seed);
    const a = bots.planRun(cfg, bots.BOT_PROFILES.regular, h * 3 + 1, rally.RALLY_MAX_STEPS);
    const b = bots.planRun(cfg, bots.BOT_PROFILES.regular, h * 3 + 2, rally.RALLY_MAX_STEPS);
    const withGift = b.log.concat([{ step: 300, kind: core.IN_EXT, sub: core.EXT_BUBBLE_GIFT, arg: 1 }]).sort((x, y) => x.step - y.step);
    const bg = core.replay(cfg, withGift, rally.RALLY_MAX_STEPS);
    if ((a.s.score >= b.s.score) === (a.s.score >= bg.score)) same++;
  }
  assert.ok(same / heats >= 0.9, `winner kept in ${same}/${heats}`);
});

test('clock sync: the min-RTT sample wins', () => {
  const o = transport.bestOffset([{ c0: 0, s: 1100, c1: 200 }, { c0: 1000, s: 2040, c1: 1040 }, { c0: 5, s: 900, c1: 1 }]);
  assert.equal(o.rttMs, 40);
  assert.equal(o.offsetMs, 2040 - 1020);
});

test('lab transport: room, round, whispers with live scores, gifts and results update the rally state', () => {
  const sent = [];
  const fake = { readyState: 1, send: (d) => sent.push(JSON.parse(d)), close() {}, onopen: null, onmessage: null, onclose: null, onerror: null };
  let t = 1000;
  const tr = new transport.LabRaceTransport('ws://x', () => fake, () => t);
  const states = [];
  tr.subscribe((s) => states.push(s));
  const whispers = [];
  tr.onWhisper((w) => whispers.push(w));
  const gifts = [];
  tr.onGift((g) => gifts.push(g));
  tr.join(7, 'Fin');
  fake.onopen();
  assert.deepEqual(sent[0], { t: 'hello', rideId: 7, name: 'Fin' });
  tr.handle(JSON.stringify({ t: 'welcome', you: 3 }));
  tr.handle(JSON.stringify({ t: 'room', phase: 'lobby', autostartAtMs: 5000, members: [{ id: 3, name: 'Fin', ready: false, state: 'active' }] }));
  assert.equal(tr.state.phase, 'lobby');
  t = 1100;
  tr.handle(JSON.stringify({ t: 'pong', c: 1060, s: 9080 }));
  assert.equal(tr.state.offsetMs, 9080 - 1080);
  assert.equal(tr.toLocal(9080), 1080);
  tr.handle(JSON.stringify({ t: 'round', roundId: 'r7-1', roundNo: 1, seed: 42, startAtMs: 12000, you: 0, seats: [{ seat: 0, kind: 'human', name: 'Fin' }] }));
  assert.equal(tr.state.phase, 'countdown');
  assert.equal(tr.state.round.seed, 42);
  tr.handle(JSON.stringify({ t: 'w', seat: 1, step: 60, d: 400, y: 500, f: 0, score: 820, crowd: 6 }));
  assert.equal(whispers.length, 1);
  assert.equal(whispers[0].score, 820);
  tr.whisper(61, 410, 480, 0, 900, 7);
  assert.deepEqual(sent[sent.length - 1], { t: 'w', step: 61, d: 410, y: 480, f: 0, score: 900, crowd: 7 });
  tr.gift();
  assert.deepEqual(JSON.parse(JSON.stringify(sent[sent.length - 1])), { t: 'gift' });
  tr.handle(JSON.stringify({ t: 'gift', eventId: 4, from: 1, fromName: 'Bubbles' }));
  assert.deepEqual(JSON.parse(JSON.stringify(gifts)), [{ eventId: 4, from: 1, fromName: 'Bubbles' }]);
  tr.handle(JSON.stringify({ t: 'results', roundId: 'r7-1', nextLobbyAtMs: 30000, results: [{ seat: 0, placement: 1 }] }));
  assert.equal(tr.state.phase, 'results');
  assert.equal(tr.state.results.length, 1);
  tr.close();
});

function wsClient(url) {
  const WebSocket = require(path.join(root, 'node_modules/ws'));
  return new WebSocket(url);
}

test('lab server: two live players rally one seeded round; gifts relay and verify; results come only from server replays; a quitter is ghost-filled', { timeout: 60000 }, async () => {
  const port = 18413 + (process.pid % 500);
  const srv = spawn(process.execPath, [path.join(root, 'tools/sharky/lab-race-server.cjs'), String(port)], {
    env: { ...process.env, SHARKY_LAB_LOBBY_MS: '400' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((res, rej) => {
      srv.stdout.on('data', (d) => String(d).includes('lab rally server') && res());
      srv.on('exit', (c) => rej(new Error(`server exit ${c}`)));
    });
    const mk = (name) => new Promise((res) => {
      const ws = wsClient(`ws://localhost:${port}`);
      const c = { ws, name, msgs: [] };
      ws.on('message', (m) => c.msgs.push(JSON.parse(m)));
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'hello', rideId: 9, name }));
        res(c);
      });
    });
    const a = await mk('A');
    const b = await mk('B');
    a.ws.send(JSON.stringify({ t: 'ready' }));
    b.ws.send(JSON.stringify({ t: 'ready' }));
    const until = async (c, pred) => {
      for (let i = 0; i < 400; i++) {
        const m = c.msgs.find(pred);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`timeout ${c.name}`);
    };
    const ra = await until(a, (m) => m.t === 'round' && m.seats.some((s) => s.name === 'B'));
    const rb = await until(b, (m) => m.t === 'round' && m.roundId === ra.roundId);
    assert.equal(ra.seed, rb.seed, 'same server seed');
    assert.equal(ra.startAtMs, rb.startAtMs, 'same GO');
    assert.equal(ra.seats.filter((s) => s.kind === 'bot').length, 2, 'empty seats are labeled ghosts (house crew)');
    // Whispers relay to the other live player with live scores.
    a.ws.send(JSON.stringify({ t: 'w', step: 10, d: 120, y: 480, f: 0, score: 900, crowd: 4 }));
    await until(b, (m) => m.t === 'w' && m.d === 120 && m.score === 900);
    b.ws.send(JSON.stringify({ t: 'w', step: 10, d: 118, y: 500, f: 0, score: 300, crowd: 1 }));
    await until(a, (m) => m.t === 'w' && m.score === 300);
    // A's Overdrive starts: the gift goes to the live rival behind A in score (B).
    a.ws.send(JSON.stringify({ t: 'gift' }));
    const g = await until(b, (m) => m.t === 'gift');
    assert.equal(g.fromName, 'A');
    // A plays a real run that logs a gift it was never sent: dq:gift.
    const cfg = rally.rallyConfig(ra.seed);
    const run = bots.planRun(cfg, bots.BOT_PROFILES.regular, 3, rally.RALLY_MAX_STEPS);
    const forged = run.log.concat([{ step: 200, kind: core.IN_EXT, sub: core.EXT_BUBBLE_GIFT, arg: 999 }]).sort((x, y) => x.step - y.step);
    const fs2 = core.replay(cfg, forged, rally.RALLY_MAX_STEPS);
    void fs2;
    const proof = verify.buildSwimProof(cfg, run.log, run.s, run.s.step * 1000 / 60 + 3000);
    b.ws.send(JSON.stringify({ t: 'bg', on: true }));
    a.ws.send(JSON.stringify({ t: 'submit', roundId: ra.roundId, proof }));
    const entry = await until(a, (m) => m.t === 'entry');
    assert.equal(entry.verdict, 'ok');
    const res = await until(a, (m) => m.t === 'results' && m.roundId === ra.roundId);
    assert.equal(res.results.length, 4);
    const ra2 = res.results.find((r) => r.name === 'A');
    assert.equal(ra2.verified, true);
    assert.equal(ra2.score, run.s.score);
    for (let i = 1; i < res.results.length; i++) {
      const p = res.results[i - 1];
      const q = res.results[i];
      assert.ok(rally.rallyCompare(p, q) <= 0, 'placements by verified score');
    }
    const rb2 = res.results.find((r) => r.name === 'B');
    assert.equal(rb2.filledBy, 'ghost', 'the backgrounded player is finished by their ghost');
    assert.deepEqual(res.results.map((r) => r.placement), [1, 2, 3, 4]);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.kill();
  }
});
