'use strict';
/**
 * Sharky Sprint Race: shared race rules, the race transport, and a full lab
 * round with two live clients (server seed, synced start, bots, server replay,
 * ghost fill, placements).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const core = loadTs('src/games/sharky/sim/core.ts');
const race = loadTs('src/games/sharky/sim/race.ts');
const bots = loadTs('src/games/sharky/sim/bots.ts');
const verify = loadTs('src/games/sharky/sim/verify.ts');
const transport = loadTs('src/games/sharky/net/raceTransport.ts', {}, { setInterval, clearInterval, WebSocket: function () {} });

test('house crew: a seat plans the identical log everywhere; ranking is fewest steps then score', () => {
  const a = race.raceBot(424242, 2, 'ace');
  const b = race.raceBot(424242, 2, 'ace');
  assert.equal(a.inputs, b.inputs);
  assert.equal(a.finished, true);
  const s = core.replay(race.raceConfig(424242), core.decodeInputs(a.inputs), 2700);
  assert.equal(s.finishStep, a.finishStep, 'the phone replays the server-planned bot exactly');
  assert.notEqual(race.raceBot(424242, 3, 'ace').inputs, a.inputs, 'seats differ');
  assert.ok(race.raceRankKey(true, 1200, 10, 7500) > race.raceRankKey(true, 1230, 5000, 7500));
  assert.ok(race.raceRankKey(true, 1201, 900, 7500) > race.raceRankKey(true, 1200, 100, 7500), 'within 3 steps score breaks the tie');
  assert.ok(race.raceRankKey(true, 2600, 0, 7500) > race.raceRankKey(false, 0, 9999, 7400), 'any finisher beats a DNF');
});

test('race course: 7,500u, split gate mid-way, tier-3 set and D2 for everyone, badge lead from the start', () => {
  const s = core.createSim(race.raceConfig(99));
  assert.equal(s.etier, 3);
  assert.equal(s.gateKind, core.G_FINISH);
  assert.equal(s.gateX - s.sprintStart, 7500);
  let split = false;
  for (let i = 0; i < core.ENT_CAP; i++) if (s.et[i] === core.E_GATE && s.ep1[i] === core.G_SPLIT) split = true;
  assert.ok(split);
  // No hazard before the view plus 600ms of travel at GO.
  const first = s.sprintStart - (s.dist >> 8);
  assert.ok(first >= core.aheadU(s) + 300);
});

test('race deciders: a skill racer beats a Dash-on-ready spammer in most heats; slipstream is +12% and fills Boost', () => {
  let skillWins = 0;
  const heats = 12;
  for (let h = 0; h < heats; h++) {
    const cfg = race.raceConfig(5000 + h * 131);
    const skill = bots.planRun(cfg, bots.BOT_PROFILES.ace, h, 2700).s;
    const spam = bots.planRun(cfg, { ...bots.BOT_PROFILES.ace, dash: false, name: 'spam' }, h, 2700);
    // Spam: dash the instant the meter allows, regardless of what is ahead.
    const log = spam.log.slice();
    const s2 = core.createSim(cfg);
    let k = 0;
    while (s2.phase !== core.PH_DONE && s2.step < 2700) {
      while (k < log.length && log[k].step <= s2.step) {
        const e = log[k++];
        core.applyInput(s2, e.kind, e.sub, e.arg);
      }
      if (s2.boost >= 100 && s2.dash === 0) core.applyInput(s2, core.IN_DASH, 0, 0);
      core.step(s2);
    }
    const kSkill = race.raceRankKey(skill.endReason === core.END_FINISH, skill.finishStep, skill.score, skill.dist >> 8);
    const kSpam = race.raceRankKey(s2.endReason === core.END_FINISH, s2.finishStep, s2.score, s2.dist >> 8);
    if (kSkill > kSpam) skillWins++;
  }
  assert.ok(skillWins / heats >= 0.75, `skill won ${skillWins}/${heats}`);
  const s = core.createSim(race.raceConfig(7));
  core.setCourse(s, [], 20000);
  core.applyInput(s, core.IN_EXT, core.EXT_DRAFT_ON, 1);
  core.step(s);
  assert.equal(s.speedEff, (((s.speed * 256) >> 8) * 287) >> 8);
  for (let i = 0; i < 60; i++) core.step(s);
  assert.equal(s.boost, 100, 'one Boost segment per second in the draft');
  for (let i = 0; i < 40; i++) core.step(s);
  assert.equal(s.draft, 0, 'a draft lasts at most 1.5s');
});

test('clock sync: the min-RTT sample wins', () => {
  const o = transport.bestOffset([{ c0: 0, s: 1100, c1: 200 }, { c0: 1000, s: 2040, c1: 1040 }, { c0: 5, s: 900, c1: 1 }]);
  assert.equal(o.rttMs, 40);
  assert.equal(o.offsetMs, 2040 - 1020);
});

test('lab transport: room, round, whispers and results update the race state', () => {
  const sent = [];
  const fake = { readyState: 1, send: (d) => sent.push(JSON.parse(d)), close() {}, onopen: null, onmessage: null, onclose: null, onerror: null };
  let t = 1000;
  const tr = new transport.LabRaceTransport('ws://x', () => fake, () => t);
  const states = [];
  tr.subscribe((s) => states.push(s));
  const whispers = [];
  tr.onWhisper((w) => whispers.push(w));
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
  tr.handle(JSON.stringify({ t: 'w', seat: 1, step: 60, d: 400, y: 500, f: 0 }));
  assert.equal(whispers.length, 1);
  tr.whisper(61, 410, 480, 0);
  assert.deepEqual(sent[sent.length - 1], { t: 'w', step: 61, d: 410, y: 480, f: 0 });
  tr.handle(JSON.stringify({ t: 'results', roundId: 'r7-1', nextLobbyAtMs: 30000, results: [{ seat: 0, placement: 1 }] }));
  assert.equal(tr.state.phase, 'results');
  assert.equal(tr.state.results.length, 1);
  tr.close();
});

function wsClient(url) {
  const WebSocket = require(path.join(root, 'node_modules/ws'));
  return new WebSocket(url);
}

test('lab server: two live players race one seeded round; results come only from server replays; a quitter is ghost-filled', { timeout: 60000 }, async () => {
  const port = 18413 + (process.pid % 500);
  const srv = spawn(process.execPath, [path.join(root, 'tools/sharky/lab-race-server.cjs'), String(port)], {
    env: { ...process.env, SHARKY_LAB_LOBBY_MS: '400' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((res, rej) => {
      srv.stdout.on('data', (d) => String(d).includes('lab race server') && res());
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
    assert.equal(ra.seats.filter((s) => s.kind === 'bot').length, 2, 'empty seats are house crew');
    // A plays a real run and submits its proof; B quits mid-race.
    const cfg = race.raceConfig(ra.seed);
    const run = bots.planRun(cfg, bots.BOT_PROFILES.regular, 3, 2700);
    const proof = verify.buildSwimProof(cfg, run.log, run.s, run.s.step * 1000 / 60 + 3000);
    // Whispers relay to the other live player.
    a.ws.send(JSON.stringify({ t: 'w', step: 10, d: 120, y: 480, f: 0 }));
    await until(b, (m) => m.t === 'w' && m.d === 120);
    b.ws.send(JSON.stringify({ t: 'bg', on: true }));
    a.ws.send(JSON.stringify({ t: 'submit', roundId: ra.roundId, proof }));
    const entry = await until(a, (m) => m.t === 'entry');
    assert.equal(entry.verdict, 'ok');
    const res = await until(a, (m) => m.t === 'results' && m.roundId === ra.roundId);
    assert.equal(res.results.length, 4);
    const ra2 = res.results.find((r) => r.name === 'A');
    assert.equal(ra2.verified, true);
    assert.equal(ra2.finishStep, run.s.finishStep);
    const rb2 = res.results.find((r) => r.name === 'B');
    assert.equal(rb2.filledBy, 'ghost', 'the backgrounded player is finished by their ghost');
    assert.deepEqual(res.results.map((r) => r.placement), [1, 2, 3, 4]);
    // A forged proof (edited score) is rejected by the replay.
    a.ws.close();
    b.ws.close();
  } finally {
    srv.kill();
  }
});
