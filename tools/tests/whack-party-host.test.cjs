'use strict';
/**
 * Whack Rush end to end on a virtual clock: the real PartyClient against the
 * dev localPartyHost (the in-process stand-in for the Line Party server).
 * GO lands on the server's start time, sim-stamped taps are submitted, the
 * host replays them with the registered sim, and the Party Series adds up.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const net = loadTs('src/gamekit/net/PartyClient.ts');
const hostMod = loadTs('src/games/whack/party/localPartyHost.ts');
const rush = loadTs('src/games/whack/party/whackRush.ts');

function world() {
  let now = 5_000_000;
  const timers = [];
  const w = {
    now: () => now,
    setTimer: (fn, ms) => { const h = { at: now + Math.max(0, ms), fn, dead: false }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.dead = true; },
    async flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); },
    async advance(ms, step = 10) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + step);
        let ran = true;
        while (ran) {
          ran = false;
          timers.sort((a, b) => a.at - b.at);
          for (const t of timers) {
            if (!t.dead && t.at <= now) { t.dead = true; ran = true; t.fn(); await w.flush(); break; }
          }
        }
        await w.flush();
      }
    },
  };
  return w;
}

test('a Whack Rush round against the house crew: my replayed score equals my board, placements and series points add up', async () => {
  const w = world();
  const host = hostMod.createLocalPartyHost({ userId: 7, name: 'Sam', game: 'whack_rush', now: w.now, seed: 99 });
  const c = new net.PartyClient({
    http: host.http, userId: 7, games: ['whack_rush'], now: w.now, perfNow: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer,
  });
  const joining = c.join(194);
  await w.advance(700);
  await joining;
  assert.equal(c.getState().phase, 'lobby');
  await w.advance(8300);
  assert.equal(c.getState().phase, 'playing');
  const r = c.round;
  assert.equal(r.game, 'whack_rush');
  // My hands: a regular's taps, logged with their board stamps as the UI-thread sim would.
  const mine = rush.botTaps(r.board, 1234, 0, 'regular');
  const expected = rush.resolve(r.board, mine).score;
  for (const [t, h] of mine) {
    const nowBoard = c.boardTime();
    if (t > nowBoard) await w.advance(t - nowBoard, 5);
    c.recordTapAt(t, h);
  }
  await w.advance(4000);
  const state = c.getState();
  assert.equal(state.phase, 'results');
  const res = state.room.round.results;
  assert.equal(res.length, 4);
  const me = res.find((x) => x.kind === 'human');
  assert.equal(me.score, expected, 'the host replay equals the board');
  assert.equal(me.verdict, 'ok');
  const sorted = [...res].sort((a, b) => a.placement - b.placement);
  assert.equal(sorted[0].points, 4);
  const standings = state.room.series.standings;
  assert.equal(standings.length, 4);
  assert.equal(standings.reduce((s, x) => s + x.points, 0), res.reduce((s, x) => s + x.points, 0));
  c.destroy();
});

test('a HOLD past the budget hands my seat to my ghost: a no-contest, never a loss', async () => {
  const w = world();
  const host = hostMod.createLocalPartyHost({ userId: 7, game: 'whack_rush', now: w.now, seed: 5 });
  const c = new net.PartyClient({
    http: host.http, userId: 7, games: ['whack_rush'], now: w.now, perfNow: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer,
  });
  const joining = c.join(194);
  await w.advance(700);
  await joining;
  await w.advance(8300);
  assert.equal(c.getState().phase, 'playing');
  await w.advance(4000);
  assert.ok(c.hold('manual'));
  await w.advance(7000);
  assert.equal(c.getState().phase, 'results');
  const me = c.getState().room.round.results.find((x) => x.kind === 'human');
  assert.equal(me.filled_by, 'ghost');
  assert.equal(me.points, 0);
  assert.ok(me.verdict.startsWith('no_contest'));
  c.destroy();
});

test('a HOLD inside the budget: my board pauses, resumes after the quick 3-2-1, and my round still counts', async () => {
  const w = world();
  const host = hostMod.createLocalPartyHost({ userId: 7, game: 'whack_rush', now: w.now, seed: 11 });
  const c = new net.PartyClient({
    http: host.http, userId: 7, games: ['whack_rush'], now: w.now, perfNow: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer,
  });
  const joining = c.join(194);
  await w.advance(700);
  await joining;
  await w.advance(8300);
  const board = c.round.board;
  const e1 = board.events.find((x) => x.kind === 0 && x.emergeAt > 1500);
  await w.advance(e1.emergeAt + 200 - c.boardTime());
  c.recordTapAt(c.boardTime(), e1.hole);
  assert.ok(c.hold('manual'));
  const frozenAt = c.boardTime();
  await w.advance(3000);
  assert.equal(c.boardTime(), frozenAt, 'my board clock is frozen on HOLD');
  c.release();
  await w.advance(1200);
  assert.ok(c.boardTime() > frozenAt, 'the board runs again after the 3-2-1');
  const e2 = board.events.find((x) => x.kind === 0 && x.emergeAt > c.boardTime() + 300);
  await w.advance(e2.emergeAt + 200 - c.boardTime());
  c.recordTapAt(c.boardTime(), e2.hole);
  await w.advance(20000 - c.boardTime() + 1500);
  const me = c.getState().room.round.results.find((x) => x.kind === 'human');
  assert.equal(me.verdict, 'ok');
  assert.equal(me.filled_by, null);
  assert.equal(me.stats.hits, 2);
  c.destroy();
});
