'use strict';
/**
 * Shared Golden live display (design rev 7, 7.1.3): the SNATCHED stamp each
 * phone shows one beat after the window must match the server's verified
 * settle in at least 98% of 500 scripted rounds with 0-900 ms whisper jitter,
 * and the whisper reducers must never let a known reaction change.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const sim = loadTs('src/games/party/bonkRace.ts');
const sg = loadTs('src/gamekit/party/sharedGolden.ts');
const rs = loadTs('src/gamekit/net/roomState.ts');

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
}

test('stamps land one beat after each window closes', () => {
  // Window close (rise + up) plus one beat: rises 1,323 / 4,852 / 8,382 / 11,911 / 15,441, up 1,323 / 1,102 x3 / 992.
  assert.deepEqual(plain([1, 2, 3, 4, 5].map(sg.stampAt)), [1323 + 1323 + 441, 4852 + 1102 + 441, 8382 + 1102 + 441, 11911 + 1102 + 441, 15441 + 992 + 441]);
  assert.ok(sg.stampAt(5) < sim.ROUND_MS, 'the last stamp still lands inside the round');
});

test('live SNATCHED matches the verified winner in 98%+ of 500 jittered rounds', () => {
  const next = lcg(0xc0ffee);
  let agree = 0;
  let total = 0;
  const profiles = ['rookie', 'regular', 'ace'];
  for (let round = 0; round < 500; round++) {
    const seed = next();
    const board = sim.buildTimeline(seed);
    // Seat 0 = this phone, seats 1-2 = live rivals (whispers), seat 3 = house crew.
    const logs = [0, 1, 2, 3].map((seat) => sim.botTaps(board, seed, seat, profiles[(round + seat) % 3]));
    const truth = sim.settleShared(logs.map((taps) => sim.resolve(board, taps).sgOffsets));
    for (let n = 1; n <= 5; n++) {
      const g = board.find((s) => s.sg === n);
      const stamp = sg.stampAt(n);
      const seats = logs.map((taps, seat) => {
        const r = sim.resolve(board, taps).sgOffsets[n - 1];
        if (seat === 0 || seat === 3 || r < 0) return { key: String(seat), sg: [0, 1, 2, 3, 4].map((i) => (i === n - 1 ? r : -1)) };
        // A rival's SNATCH whisper leaves at their tap and arrives 0-900 ms later;
        // 2% are dropped and healed by the next 4 Hz progress whisper (+250 ms).
        const jitter = next() % 901;
        const dropped = next() % 100 < 2;
        // The tap lands at most |offset| after the mark.
        const arrives = g.mark + r + jitter + (dropped ? 250 : 0);
        const known = arrives <= stamp ? r : -1;
        return { key: String(seat), sg: [0, 1, 2, 3, 4].map((i) => (i === n - 1 ? known : -1)) };
      });
      const live = sg.provisionalSnatch(n, seats).sort().join(',');
      const server = truth.golds[n - 1].winners.map(String).sort().join(',');
      total++;
      if (live === server) agree++;
    }
  }
  const rate = agree / total;
  console.log(`snatch agreement ${agree}/${total} = ${(rate * 100).toFixed(2)}%`);
  assert.ok(rate >= 0.98, `agreement ${(rate * 100).toFixed(2)}%`);
});

test('provisional bonus only counts Shared Goldens already stamped', () => {
  const seats = [{ key: 'me', sg: [100, 300, -1, -1, -1] }, { key: 'u:7', sg: [150, 200, -1, -1, -1] }];
  assert.deepEqual(plain(sg.provisionalBonus(sg.stampAt(1) - 1, seats)), {});
  assert.deepEqual(plain(sg.provisionalBonus(sg.stampAt(1), seats)), { me: 200 });
  assert.deepEqual(plain(sg.provisionalBonus(sg.stampAt(2), seats)), { me: 200, 'u:7': 200 });
  assert.equal(sg.settleDisagrees({ 1: ['me'] }, { 1: ['me'] }), false);
  assert.equal(sg.settleDisagrees({ 1: ['me'] }, { 1: ['u:7'] }), true);
});

test('SNATCH whispers: first reaction wins, wrong round or junk is ignored, progress heals a drop', () => {
  let st = { ...rs.initialPartyState(), userId: 1, room: { round: { round_no: 3 } } };
  st = rs.applySnatch(st, { u: 2, r: 3, sg: 2, ms: 140 }, 10);
  assert.deepEqual(plain(st.rivals[2].sg), [-1, 140, -1, -1, -1]);
  const same = rs.applySnatch(st, { u: 2, r: 3, sg: 2, ms: 90 }, 11);
  assert.equal(same, st, 'a reaction never changes once known');
  assert.equal(rs.applySnatch(st, { u: 2, r: 2, sg: 1, ms: 90 }, 12), st, 'old round');
  assert.equal(rs.applySnatch(st, { u: 2, r: 3, sg: 9, ms: 90 }, 12), st, 'bad index');
  assert.equal(rs.applySnatch(st, { u: 1, r: 3, sg: 1, ms: 90 }, 12), st, 'my own echo');
  st = rs.applyProgress(st, { u: 2, s: 900, k: 4, t: 6000, r: 3, g: [210, 999, -1, -1, -1] }, 13);
  assert.deepEqual(plain(st.rivals[2].sg), [210, 140, -1, -1, -1]);
  assert.equal(st.rivals[2].score, 900);
});
