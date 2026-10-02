'use strict';
/**
 * Parade Beat (Rhythm Tap rework): chart generation, judge rules, anti-mash
 * and human sims, March fairness, pause voiding, proof replay, projection.
 * Design: studio/design/rhythm.md sections 3-5, 9, 13.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const T = loadTs('src/games/rhythm/core/types.ts');
const gen = loadTs('src/games/rhythm/core/generate.ts');
const J = loadTs('src/games/rhythm/core/judge.ts');
const sim = loadTs('src/games/rhythm/core/sim.ts');
const sc = loadTs('src/games/rhythm/core/score.ts');
const proof = loadTs('src/games/rhythm/core/proof.ts');
const proj = loadTs('src/games/rhythm/core/projection.ts');

const STAGE_IDS = ['opening_day_a', 'waiting_room_a', 'shark_shop_a', 'backpack_bounce_a'];
const stages = Object.fromEntries(STAGE_IDS.map((id) => [id, JSON.parse(fs.readFileSync(path.join(root, `src/games/rhythm/stages/${id}.json`), 'utf8'))]));

function chartOf(id, fmt, d, seed, opts) {
  return gen.generate(stages[id], fmt, d, seed, opts);
}

/** A hand-built chart: 120 BPM, 2 pre-roll + `bars` playable + 2 outro bars. */
function synth(notes, { bars = 8, d = 2 } = {}) {
  const total = 2 + bars + 2;
  const beats = [];
  for (let i = 0; i <= total * 4; i++) beats.push(1000 + i * 500);
  const barStart = [];
  for (let b = 0; b <= total; b++) barStart.push(beats[b * 4]);
  const sorted = notes.slice().sort((a, b) => a[0] - b[0]);
  return {
    stage: 'synth', format: 'queue', difficulty: d, seed: 1, chartVersion: 'pb-1.0', beatmapHash: 'x',
    beats, barStart, barSection: barStart.slice(0, total).map(() => 1), barEnergy: [], preRollBars: 2, playableBars: bars,
    firstBar: 2, lastBar: 1 + bars, durationMs: beats[beats.length - 1], endMs: barStart[2 + bars + 1],
    t: sorted.map((n) => n[0]), kind: sorted.map((n) => n[1]), zone: sorted.map((n) => n[2] ?? 0), layers: sorted.map((n) => n[3] ?? 3),
    end: sorted.map((n) => n[4] ?? 0), flags: sorted.map((n) => n[5] ?? 0), bar: sorted.map((n) => Math.floor((n[0] - 1000) / 2000)),
    beatLen: sorted.map(() => 500), calls: [], callZone: [], freezeCues: [], popperTaps: 6,
  };
}

function firstIdx(ch, pred) {
  for (let i = 0; i < ch.t.length; i++) if (pred(i)) return i;
  return -1;
}

test('stages: every format has a beat map, 2 pre-roll bars and authored charts', () => {
  for (const id of STAGE_IDS) {
    const st = stages[id];
    assert.equal(st.chartVersion, T.CHART_VERSION);
    for (const [fmt, f] of Object.entries(st.formats)) {
      assert.equal(f.preRollBars, 2);
      assert.equal(f.beatUs.length, 4 * (f.preRollBars + f.playableBars + f.outroBars) + 1, `${id}/${fmt} beats`);
      for (let i = 1; i < f.beatUs.length; i++) assert.ok(f.beatUs[i] > f.beatUs[i - 1]);
      assert.ok(Object.keys(f.charts).length >= 1);
      assert.ok(fs.existsSync(path.join(root, 'src/games/rhythm/audio', f.audio)), f.audio);
      assert.ok(fs.existsSync(path.join(root, 'src/games/rhythm/audio', f.fever)), f.fever);
    }
  }
});

test('generate: canonical charts (the chart is the level): identical for every seed, only authored rows', () => {
  const st = stages.waiting_room_a;
  const a = chartOf('waiting_room_a', 'queue', 2, 777);
  for (let seed = 1; seed < 40; seed++) {
    const b = chartOf('waiting_room_a', 'queue', 2, seed);
    assert.deepEqual(Array.from(b.t), Array.from(a.t));
    assert.deepEqual(Array.from(b.kind), Array.from(a.kind));
  }
  const rows = st.formats.queue.charts['2'];
  for (let i = 0; i < a.t.length; i++) assert.ok(rows.some((r) => r[0] === a.t[i]), `note at ${a.t[i]} is authored`);
  assert.equal(st.chartVersion, 'pb-3.0');
});

test('generate: ride sprint vocabulary is DRUM and BIG only (rev 7)', () => {
  for (const id of ['opening_day_a', 'waiting_room_a']) {
    const ch = chartOf(id, 'ride', 1, 1);
    for (const k of new Set(Array.from(ch.kind))) assert.ok([T.K_DRUM, T.K_BIG].includes(k), `${id} ride kind ${k}`);
    assert.ok(Array.from(ch.flags).every((f) => f === 0));
    assert.equal(ch.playableBars, 12);
    assert.equal(ch.kind.filter((k) => k === T.K_BIG).length, 1);
  }
});

test('generate: First Parade (FTUE) is DRUM and one BIG only', () => {
  const ch = chartOf('waiting_room_a', 'ride', 1, 5, { ftue: true });
  const kinds = Array.from(ch.kind);
  assert.equal(kinds.filter((k) => k === T.K_BIG).length, 1);
  assert.ok(kinds.every((k) => k === T.K_DRUM || k === T.K_BIG));
});

test('charts (rev 7): launch vocabulary, d1/d2 only, nesting, rest before every drop line, run rule, RIM cap', () => {
  const tickOf = (row) => row[1] * 4 + row[2];
  for (const id of STAGE_IDS) {
    for (const [fmt, f] of Object.entries(stages[id].formats)) {
      const ds = Object.keys(f.charts).sort();
      assert.deepEqual(ds, fmt === 'queue' ? ['1', '2'] : ['1'], `${id}/${fmt} difficulties`);
      const pre = f.preRollBars;
      const drops = [];
      for (let b = pre + 4; b < pre + f.playableBars; b += 4) drops.push(b);
      for (const d of ds) {
        const rows = f.charts[d];
        for (const r of rows) {
          assert.ok([T.K_DRUM, T.K_RIM, T.K_BIG].includes(r[3]), `${id} d${d} kind ${r[3]}`);
          assert.equal(r[7], 0, 'no seeded groups');
          // No note in the last beat before a drop line (Fever drops out of silence).
          for (const db of drops) assert.ok(!(r[1] >= db * 4 - 1 && r[1] < db * 4), `${id}/${fmt} d${d} note in the rest beat before bar ${db}`);
          if (r[3] === T.K_ROLL) for (const db of drops) assert.ok(!(r[6] > 0 && r[0] < f.beatUs[db * 4 - 1] / 1000 && r[6] > f.beatUs[db * 4 - 1] / 1000 + 1), 'ROLL ends before the rest beat');
        }
        // Max 1 RIM a bar at d1.
        if (d === '1') {
          const perBar = {};
          for (const r of rows) if (r[3] === T.K_RIM) perBar[Math.floor(r[1] / 4)] = (perBar[Math.floor(r[1] / 4)] || 0) + 1;
          assert.ok(Object.values(perBar).every((n) => n <= 1), `${id} d1 RIM cap`);
        }
        // March layer is a subset of d1 by tick (it is drawn from the d1 rows themselves).
        if (d === '1') for (const r of rows) if (r[5] & 2) assert.ok(r[5] & 1);
      }
      if (fmt === 'queue') {
        const t1 = new Set(f.charts['1'].map(tickOf));
        const t2 = new Set(f.charts['2'].map(tickOf));
        for (const t of t1) assert.ok(t2.has(t), `${id}: d1 tick ${t} is in d2`);
        // No d2 bar has more than 3 consecutive same-zone notes at 8th spacing.
        const ch = chartOf(id, 'queue', 2, 1);
        let run = 1;
        for (let i = 1; i < ch.t.length; i++) {
          const a = i - 1;
          const both = ch.kind[a] <= 1 && ch.kind[i] <= 1;
          if (both && ch.bar[a] === ch.bar[i] && ch.kind[a] === ch.kind[i] && ch.t[i] - ch.t[a] <= 260) run++;
          else run = 1;
          assert.ok(run <= 3, `${id} d2 same-zone run at ${ch.t[i]}`);
        }
      }
    }
  }
  // Stage intro order (design 3.2, 3.8): Waiting Room is DRUM + BIG at d1 and d2; RIM arrives with Shark Shop.
  const kq = (id, d) => new Set(stages[id].formats.queue.charts[d].map((r) => r[3]));
  for (const d of ['1', '2']) assert.ok(!kq('waiting_room_a', d).has(T.K_RIM), `waiting room d${d} has no RIM`);
  assert.ok(kq('shark_shop_a', '1').has(T.K_RIM) && kq('shark_shop_a', '2').has(T.K_RIM));
  // Launch charts end on a BIG; d2 has one more on the bar-12 crash.
  for (const id of ['waiting_room_a', 'shark_shop_a']) {
    const c2 = stages[id].formats.queue.charts['2'];
    assert.equal(c2.filter((r) => r[3] === T.K_BIG).length, 2, `${id} d2 BIGs`);
  }
});

test('judge: touch-down is judged at its own time with the rev 7 windows (d1 55/110/165); Easy Beat widens GOOD to 180', () => {
  const ch = chartOf('waiting_room_a', 'queue', 1, 3);
  const i = firstIdx(ch, (k) => ch.kind[k] === T.K_DRUM && (ch.layers[k] & 1));
  const cases = [[0, T.J_PERFECT], [54, T.J_PERFECT], [-100, T.J_GREAT], [160, T.J_GOOD], [-200, T.J_MISS]];
  for (const [dt, want] of cases) {
    const s = J.createJudge(ch, { forceMarch: 0 });
    J.judgeTick(s, ch.t[i] - 1000);
    const got = J.judgeDown(s, ch.t[i] + dt, T.Z_CENTRE, 1, 700);
    assert.equal(got, i);
    assert.equal(s.res[i], want, `delta ${dt}`);
  }
  // Later than GOOD: the note has already auto-missed; the tap is a misstap right away (no gesture to wait for).
  const late = J.createJudge(ch, { forceMarch: 0 });
  J.judgeTick(late, ch.t[i] - 1000);
  assert.equal(J.judgeDown(late, ch.t[i] + 170, T.Z_CENTRE, 1, 700), -1);
  assert.equal(late.res[i], T.J_MISS);
  assert.equal(late.strays, 1);
  // Easy Beat.
  const as = J.createJudge(ch, { forceMarch: 0, easy: true });
  J.judgeTick(as, ch.t[i] - 1000);
  J.judgeDown(as, ch.t[i] + 175, T.Z_CENTRE, 1, 700);
  assert.equal(as.res[i], T.J_GOOD);
  assert.equal(as.approach, 2080);
});

test('judge: zones: centre is DRUM, rim bands are RIM, dead bands count for either, WRONG SIDE otherwise', () => {
  const ch = chartOf('shark_shop_a', 'queue', 1, 3);
  const di = firstIdx(ch, (k) => ch.kind[k] === T.K_DRUM && (ch.layers[k] & 1));
  const ri = firstIdx(ch, (k) => ch.kind[k] === T.K_RIM && (ch.layers[k] & 1));
  assert.ok(di >= 0 && ri >= 0);
  const hit = (idx, zone) => {
    const s = J.createJudge(ch, { forceMarch: 0 });
    for (let k = 0; k < idx; k++) s.res[k] = T.J_VOID;
    s.cursor = idx;
    J.judgeDown(s, ch.t[idx], zone, 1, 700);
    return s.res[idx];
  };
  assert.equal(hit(di, T.Z_CENTRE), T.J_PERFECT);
  assert.equal(hit(di, T.Z_RIM_L), T.J_WRONG);
  assert.equal(hit(di, T.Z_DEAD_R), T.J_PERFECT);
  assert.equal(hit(ri, T.Z_RIM_L), T.J_PERFECT);
  assert.equal(hit(ri, T.Z_RIM_R), T.J_PERFECT);
  assert.equal(hit(ri, T.Z_CENTRE), T.J_WRONG);
  assert.equal(hit(ri, T.Z_DEAD_L), T.J_PERFECT);
  // March bars ignore zones.
  const s = J.createJudge(ch, { forceMarch: 1 });
  const mi = firstIdx(ch, (k) => ch.kind[k] <= 1 && (ch.layers[k] & 2));
  J.judgeTick(s, ch.t[mi] - 5);
  for (let k = 0; k < mi; k++) if (s.res[k] === 0) s.res[k] = T.J_VOID;
  s.cursor = mi;
  J.judgeDown(s, ch.t[mi], ch.kind[mi] === T.K_DRUM ? T.Z_RIM_L : T.Z_CENTRE, 1, 700);
  assert.equal(s.res[mi], T.J_PERFECT);
});

test('judge: earliest candidate is consumed (mashing ahead cannot skip notes); misstaps cost Fever, the first 4 are free in accuracy', () => {
  const ch = synth([[5000, T.K_DRUM], [5250, T.K_DRUM], [5500, T.K_DRUM]]);
  const s = J.createJudge(ch, { forceMarch: 0 });
  assert.equal(J.judgeDown(s, 5120, T.Z_CENTRE, 1, 700), 0);
  assert.equal(s.res[0], T.J_GOOD);
  assert.equal(s.res[1], T.J_NONE);
  const s2 = J.createJudge(ch, { forceMarch: 0 });
  s2.meter = 40;
  J.judgeDown(s2, 3000, T.Z_CENTRE, 1, 700);
  assert.equal(s2.strays, 1);
  assert.equal(s2.meter, 35, 'a misstap costs 5 Fever');
  assert.equal(s2.combo, 0);
  // Accuracy: 4 free misstaps, then each adds 0.5 of a zero-score note.
  const s3 = J.createJudge(ch, { forceMarch: 0 });
  for (let k = 0; k < 6; k++) J.judgeDown(s3, 1500 + k * 400, T.Z_CENTRE, 10 + k, 700);
  J.judgeDown(s3, 5000, T.Z_CENTRE, 1, 700);
  assert.equal(s3.strays, 6);
  assert.equal(J.misstapWeight(s3), 1);
  assert.equal(J.accuracyPct(s3), 50);
});

test('judge: WRONG SIDE keeps the combo at d1 (not increased) and resets it at d2', () => {
  for (const d of [1, 2]) {
    const ch = synth([[5000, T.K_DRUM], [5500, T.K_DRUM], [6000, T.K_RIM, 1]], { d });
    const s = J.createJudge(ch, { forceMarch: 0 });
    J.judgeDown(s, 5000, T.Z_CENTRE, 1, 700);
    J.judgeDown(s, 5500, T.Z_CENTRE, 2, 700);
    J.judgeDown(s, 6000, T.Z_CENTRE, 3, 700);
    assert.equal(s.res[2], T.J_WRONG);
    assert.equal(s.combo, d === 1 ? 2 : 0, `d${d}`);
    assert.equal(s.score, 300 * 2, 'WRONG SIDE scores 0');
  }
});

test('grips: One Thumb (right) x 40/160/300 = RIM/DRUM/RIM; Two Thumbs x 100 DRUM, x 290 RIM, swapped mirrors; dead bands', () => {
  const G = loadTs('src/games/rhythm/core/grip.ts');
  const isRim = (z) => z === T.Z_RIM_L || z === T.Z_RIM_R;
  const isDead = (z) => z === T.Z_DEAD_L || z === T.Z_DEAD_R;
  assert.ok(isRim(G.zoneOf(40, 390, G.GRIP_ONE, 1, 0)));
  assert.equal(G.zoneOf(160, 390, G.GRIP_ONE, 1, 0), T.Z_CENTRE);
  assert.ok(isRim(G.zoneOf(300, 390, G.GRIP_ONE, 1, 0)));
  // Left thumb mirrors: the wide rim is on the left.
  assert.ok(isRim(G.zoneOf(100, 390, G.GRIP_ONE, -1, 0)));
  assert.equal(G.zoneOf(230, 390, G.GRIP_ONE, -1, 0), T.Z_CENTRE);
  assert.ok(isRim(G.zoneOf(350, 390, G.GRIP_ONE, -1, 0)));
  assert.equal(G.zoneOf(100, 390, G.GRIP_TWO, 1, 0), T.Z_CENTRE);
  assert.ok(isRim(G.zoneOf(290, 390, G.GRIP_TWO, 1, 0)));
  assert.ok(isRim(G.zoneOf(100, 390, G.GRIP_TWO, 1, 1)));
  assert.equal(G.zoneOf(290, 390, G.GRIP_TWO, 1, 1), T.Z_CENTRE);
  assert.ok(isDead(G.zoneOf(195, 390, G.GRIP_TWO, 1, 0)));
  assert.ok(isDead(G.zoneOf(78, 390, G.GRIP_ONE, 1, 0)));
  assert.ok(isDead(G.zoneOf(234, 390, G.GRIP_ONE, 1, 0)));
  // Defaults: d1 One Thumb, d2 Two Thumbs, ride always One Thumb; an explicit pick wins.
  assert.equal(G.gripFor(G.DEFAULT_GRIP, 1, 'queue'), G.GRIP_ONE);
  assert.equal(G.gripFor(G.DEFAULT_GRIP, 2, 'queue'), G.GRIP_TWO);
  assert.equal(G.gripFor({ grip: G.GRIP_TWO, hand: 1, swap: 0 }, 1, 'ride'), G.GRIP_ONE);
  assert.equal(G.gripFor({ grip: G.GRIP_ONE, hand: 1, swap: 0 }, 2, 'queue'), G.GRIP_ONE);
  // Handedness from the first 20 touches.
  assert.equal(G.detectHand(new Array(20).fill(260), 390, -1), 1);
  assert.equal(G.detectHand(new Array(20).fill(120), 390, 1), -1);
  assert.equal(G.detectHand(new Array(20).fill(195), 390, -1), -1);
  assert.equal(G.detectHand(new Array(5).fill(300), 390, -1), -1);
  // A chart with no RIM notes plays on an all-blue drum: every touch is a DRUM touch.
  assert.equal(G.gripFor(G.DEFAULT_GRIP, 1, 'queue', false), G.GRIP_ALL);
  for (const x of [5, 100, 195, 300, 385]) assert.equal(G.zoneOf(x, 390, G.GRIP_ALL, 1, 0), T.Z_CENTRE);
  assert.deepEqual(plain(G.gripSpans(G.GRIP_ALL, 1, 0)), [0, 1, 0]);
});

test('judge: combo lives in the beat domain (a 4-bar rest keeps it); multiplier steps', () => {
  assert.equal(T.comboMultiplier(9), 1);
  assert.equal(T.comboMultiplier(10), 2);
  assert.equal(T.comboMultiplier(25), 3);
  assert.equal(T.comboMultiplier(50), 4);
  const ch = chartOf('opening_day_a', 'queue', 1, 3);
  const s = J.createJudge(ch, { forceMarch: 0 });
  const i = firstIdx(ch, (k) => (ch.layers[k] & 1));
  J.judgeDown(s, ch.t[i], T.Z_CENTRE, 1, 700);
  assert.equal(s.combo, 1);
  // Remove the next notes and wait 4 bars: combo is still 1.
  for (let k = i + 1; k < ch.t.length && ch.t[k] < ch.t[i] + 8000; k++) s.layers[k] = 0;
  J.judgeTick(s, ch.t[i] + 7500);
  assert.equal(s.combo, 1);
});

function feverChart() {
  const notes = [];
  for (let t = 5000; t < 26000; t += 500) {
    // Rest beat before each drop line (bars 6 and 10 start at 13000 and 21000).
    if ((t >= 12500 && t < 13000) || (t >= 20500 && t < 21000)) continue;
    notes.push([t, T.K_DRUM]);
  }
  return synth(notes, { bars: 12 });
}

test('Fever (rev 7): fills from accuracy, fires itself on the next drop line 1+ beat away, one section x2, a MISS ends it on the next beat', () => {
  const ch = feverChart();
  const s = J.createJudge(ch, { forceMarch: 0 });
  assert.deepEqual(plain(s.dropBars), [6, 10]);
  J.judgeTick(s, 4000);
  s.meter = 99;
  J.judgeDown(s, 5000, T.Z_CENTRE, 1, 700);
  J.judgeUp(s, 5050, 1);
  J.judgeTick(s, 5060);
  assert.equal(s.armed, 0, 'armed and fired in the same tick');
  assert.equal(s.pendingDeploy, 6, 'queued for the next drop line (bar 6)');
  assert.equal(s.meter, 0);
  const m0 = s.meter;
  J.judgeDown(s, 5500, T.Z_CENTRE, 2, 700);
  assert.equal(s.meter, m0, 'no refill while a Fever is queued');
  for (let t = 6000; t < 13000; t += 500) {
    if (t >= 12500) continue;
    J.judgeDown(s, t, T.Z_CENTRE, 10 + t, 700);
    J.judgeUp(s, t + 50, 10 + t);
  }
  J.judgeTick(s, ch.barStart[6] - 1);
  assert.equal(s.feverFrom, -1, 'nothing before the drop');
  J.judgeTick(s, ch.barStart[6] + 1);
  assert.equal(s.feverFrom, 6);
  assert.equal(s.feverTo, 10, 'one whole section');
  assert.equal(s.feverCount, 1);
  const before = s.score;
  const mult = T.comboMultiplier(s.combo + 1);
  J.judgeDown(s, 13000, T.Z_CENTRE, 99, 700);
  assert.equal(s.score - before, 300 * mult * 2, 'x2 in Fever');
  J.judgeTick(s, 13500 + 200);
  assert.ok(s.feverKillAt > 0, 'a MISS fizzles Fever at the next beat');
  J.judgeTick(s, s.feverKillAt + 1);
  assert.equal(s.feverFrom, -1);
  assert.equal(s.meter, 0, 'a fizzled Fever does not keep it lit');
  // An armed meter in the last beat before a drop waits for the next drop line.
  const late = J.createJudge(ch, { forceMarch: 0 });
  J.judgeTick(late, ch.barStart[6] - 400);
  late.meter = 100;
  late.armed = 1;
  J.judgeTick(late, ch.barStart[6] - 380);
  assert.equal(late.pendingDeploy, 10, 'less than a beat to bar 6: Fever waits for bar 10');
});

test('Fever: Keep it lit, a clean Fever section restarts the meter at 50; touches never trigger Fever', () => {
  const ch = feverChart();
  const s = J.createJudge(ch, { forceMarch: 0 });
  J.judgeTick(s, 4000);
  s.meter = 100;
  s.armed = 1;
  for (let t = 5000; t < 21000; t += 500) {
    if (t >= 12500 && t < 13000) continue;
    if (t >= 20500) continue;
    J.judgeDown(s, t, T.Z_CENTRE, 10 + t, 700);
    J.judgeUp(s, t + 40, 10 + t);
    J.judgeTick(s, t + 41);
  }
  J.judgeTick(s, ch.barStart[10] + 1);
  assert.equal(s.feverBarsUsed, 4);
  assert.equal(s.meter, 50, 'zero MISS: the meter starts again at 50');
  // A swipe, a long press and a two-finger pair on an empty stretch are all just misstaps.
  const q = J.createJudge(ch, { forceMarch: 0 });
  J.judgeTick(q, 12400);
  q.meter = 90;
  J.judgeDown(q, 12600, T.Z_CENTRE, 7, 760);
  J.judgeMove(q, 12680, 7, 600);
  J.judgeUp(q, 12700, 7);
  J.judgeTick(q, 12800);
  assert.equal(q.pendingDeploy, -1);
  assert.equal(q.strays, 1);
  assert.equal(q.meter, 85);
});

test('fail rules: queue rounds never end early; the ride sprint stalls once 75% hits or 12 misstaps is out of reach', () => {
  const ch = feverChart();
  const q = J.createJudge(ch, { forceMarch: 0 });
  J.judgeTick(q, 30000);
  assert.equal(q.stalled, 0, 'a silent queue round plays to its last bar');
  const r = J.createJudge(ch, { forceMarch: 0, ride: true });
  const n = ch.t.length;
  let stallAt = -1;
  for (let t = 4000; t < 30000 && !r.stalled; t += 50) J.judgeTick(r, t);
  stallAt = r.stallT;
  assert.equal(r.stalled, 1);
  // Stalls on the first miss that makes 75% impossible: misses > 25% of the chart.
  assert.ok(r.cMiss > n * 0.25 && r.cMiss <= n * 0.25 + 1, `stalled after ${r.cMiss} of ${n} misses`);
  assert.ok(stallAt < ch.barStart[ch.lastBar], 'well before the end');
  const m = J.createJudge(ch, { forceMarch: 0, ride: true });
  J.judgeTick(m, 3000);
  for (let k = 0; k < 13; k++) J.judgeDown(m, 1100 + k * 290, T.Z_CENTRE, k + 1, 700);
  assert.equal(m.oos, 0);
  assert.equal(m.stalled, 1, 'the 13th misstap stalls the ride');
});

test('judge: BIG two-finger double, ROLL hold ticks and early release, POPPER pops, FREEZE fault, CYMBAL flick', () => {
  const ch = synth([
    [5000, T.K_BIG, 2], [6000, T.K_ROLL, 2, 3, 7000], [9000, T.K_POPPER, 2, 3, 11000],
    [12000, T.K_FREEZE, 2, 1], [13000, T.K_CYMBAL, 2, 1, 0, T.F_FLICK], [14000, T.K_CYMBAL, 2, 1, 0, T.F_FLICK], [15000, T.K_ROLL, 2, 3, 16500],
  ], { d: 3 });
  const s = J.createJudge(ch, { forceMarch: 0 });
  J.judgeDown(s, 5000, T.Z_CENTRE, 1, 700);
  J.judgeDown(s, 5015, T.Z_RIM_L, 2, 700);
  assert.equal(s.bigDoubles, 1);
  J.judgeUp(s, 5100, 1);
  J.judgeUp(s, 5100, 2);
  J.judgeDown(s, 6000, T.Z_CENTRE, 3, 700);
  J.judgeTick(s, 7010);
  assert.equal(s.rollTicks, 4, 'a tick every 8th while held');
  J.judgeUp(s, 7020, 3);
  for (let k = 0; k < 6; k++) {
    J.judgeDown(s, 9100 + k * 120, T.Z_CENTRE, 10 + k, 700);
    J.judgeUp(s, 9150 + k * 120, 10 + k);
  }
  assert.equal(s.res[2], T.J_POPPED);
  assert.equal(s.oos, 0, 'Out of Step is suspended inside a POPPER');
  J.judgeDown(s, 12050, T.Z_CENTRE, 20, 700);
  assert.equal(s.faults, 1);
  assert.equal(s.combo, 0);
  J.judgeUp(s, 12100, 20);
  J.judgeDown(s, 13000, T.Z_CENTRE, 21, 700);
  J.judgeMove(s, 13060, 21, 660);
  assert.equal(s.flicks, 1);
  assert.equal(s.res[4], T.J_PERFECT);
  J.judgeUp(s, 13100, 21);
  J.judgeDown(s, 14000, T.Z_CENTRE, 22, 700);
  J.judgeTick(s, 14200);
  assert.equal(s.res[5], T.J_MISS, 'a CYMBAL at d3 needs the flick');
  J.judgeUp(s, 14250, 22);
  const c0 = s.combo;
  J.judgeDown(s, 15000, T.Z_CENTRE, 23, 700);
  J.judgeUp(s, 15500, 23);
  assert.equal(s.combo, 0, 'early ROLL release breaks the combo');
  assert.ok(c0 >= 0);
});

test('MARCH (rev 6): the pill decides, the layer locks per 4-bar section at sectionStart - approach - 1 beat', () => {
  const ch = chartOf('shark_shop_a', 'queue', 2, 4);
  const s = J.createJudge(ch, {});
  const sec = ch.firstBar + 4; // section 2
  const beat = (ch.barStart[sec + 1] - ch.barStart[sec]) / 4;
  const lock = ch.barStart[sec] - T.WINDOWS[2].approachMs - beat;
  assert.equal(J.lockTime(s, sec + 2), lock, 'every bar of a section shares the section lock');
  s.marchWant = 0;
  J.judgeTick(s, lock - 5);
  assert.equal(s.barLayer[sec], 0);
  assert.equal(J.nextOpenSection(s), sec);
  J.setMarchWant(s, true);
  J.judgeTick(s, lock + 1);
  for (let b = sec; b < sec + 4; b++) assert.equal(s.barLayer[b], T.L_MARCH, `bar ${b}`);
  J.setMarchWant(s, false);
  J.judgeTick(s, lock + 400);
  assert.equal(s.barLayer[sec + 3], T.L_MARCH, 'locked: a late tap applies from the next section');
  assert.equal(J.nextOpenSection(s), sec + 4);
  const first = firstIdx(ch, (k) => ch.bar[k] === sec);
  assert.ok(ch.t[first] - T.WINDOWS[2].approachMs >= lock, 'no note changes layer after spawning');
});

test('March fairness: same chart either way; identical inputs never score more when marching', () => {
  for (const id of STAGE_IDS) {
    const ch = chartOf(id, 'queue', 2, 21);
    const script = sim.scriptHuman(ch, { sigmaMs: 25 }, 5);
    const stand = sim.runScript(ch, script, { forceMarch: 0 });
    const march = sim.runScript(ch, script, { forceMarch: 1 });
    assert.ok(march.score <= stand.score, `${id}: march ${march.score} <= stand ${stand.score}`);
    const ch2 = chartOf(id, 'queue', 2, 21);
    assert.deepEqual(Array.from(ch2.t), Array.from(ch.t));
    // Queue rounds never end early, marching or not.
    const m = sim.runScript(ch, sim.scriptMasher(ch, 3, 2), { forceMarch: 1, limp: true });
    assert.equal(m.stalled, 0);
  }
});

test('anti-mash gate (4.3): 6/10/15 taps/s never star on either track, score under 25% of a sigma-60 player; the ride stalls before 60% and is never won', () => {
  for (const id of ['waiting_room_a', 'shark_shop_a']) {
    for (const d of [1, 2]) {
      const ch = chartOf(id, 'queue', d, 1);
      for (const rate of [6, 10, 15]) {
        let stars = 0;
        let ratio = 0;
        const N = 30;
        const pro = sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 60 }, 3), { forceMarch: 0 }).score;
        for (let seed = 1; seed <= N; seed++) {
          for (const march of [0, 1]) {
            const s = sim.runScript(ch, sim.scriptMasher(ch, rate, seed), { forceMarch: march });
            assert.equal(s.stalled, 0, 'queue rounds never end early');
            const sum = sc.summarize(s, { format: 'queue' });
            stars += sum.stars + sum.marchStars;
            ratio = Math.max(ratio, s.score / pro);
          }
        }
        assert.equal(stars, 0, `${id} d${d} ${rate}/s stars`);
        assert.ok(ratio < 0.25, `${id} d${d} ${rate}/s scores under 25% of sigma 60 (${ratio.toFixed(2)})`);
      }
    }
  }
  let wins = 0;
  let late = 0;
  let n = 0;
  for (const id of ['waiting_room_a', 'opening_day_a']) {
    const ch = chartOf(id, 'ride', 1, 1);
    const first = ch.barStart[ch.firstBar];
    const span = ch.barStart[ch.lastBar + 1] - first;
    for (let seed = 1; seed <= 60; seed++) {
      for (const march of [0, 1]) {
        for (const easy of [false, true]) {
          const s = sim.runScript(ch, sim.scriptMasher(ch, 6 + (seed % 3) * 4.5, seed), { forceMarch: march, ride: true, easy });
          if (sc.summarize(s, { format: 'ride' }).rideWin) wins++;
          if (!s.stalled || s.stallT > first + 0.6 * span) late++;
          n++;
        }
      }
    }
  }
  assert.ok(wins / n < 0.01, `masher ride wins ${wins}/${n}`);
  assert.equal(late, 0, 'every mashed ride stalls before 60% of the chart');
});

test('human sims (13): ride sigma 60 85%+, MARCH sigma 70 + 4% lapses 80%+, Easy sigma 100 + drift 80%+, Easy sigma 120 65%+; d2 sigma 35 2+ Stage stars 90%, sigma 18 3 stars 80%', () => {
  const rate = (fn, N) => {
    let ok = 0;
    for (let seed = 1; seed <= N; seed++) if (fn(seed)) ok++;
    return ok / N;
  };
  const rideWin = (ch, model, seed, cfg) => sc.summarize(sim.runScript(ch, sim.scriptHuman(ch, model, seed), { ride: true, ...cfg }), { format: 'ride' }).rideWin;
  for (const id of ['waiting_room_a', 'opening_day_a']) {
    const ch = chartOf(id, 'ride', 1, 1);
    const stand = rate((seed) => rideWin(ch, { sigmaMs: 60 }, seed, { forceMarch: 0 }), 80);
    assert.ok(stand >= 0.85, `${id} sigma 60 ride win ${stand}`);
    const walk = rate((seed) => rideWin(ch, { sigmaMs: 70, lapse: 0.04, march: true }, seed, { forceMarch: 1 }), 80);
    assert.ok(walk >= 0.8, `${id} marching sigma 70 ride win ${walk}`);
    const easy = rate((seed) => rideWin(ch, { sigmaMs: 100, lapse: 0.06, driftMs: 40 }, seed, { forceMarch: 0, easy: true }), 80);
    assert.ok(easy >= 0.8, `${id} sigma 100 + drift with Easy Beat ${easy}`);
    const e120 = rate((seed) => rideWin(ch, { sigmaMs: 120, lapse: 0.06 }, seed, { forceMarch: 0, easy: true }), 80);
    assert.ok(e120 >= 0.65, `${id} sigma 120 with Easy Beat ${e120}`);
  }
  for (const id of ['waiting_room_a', 'shark_shop_a']) {
    const ch = chartOf(id, 'queue', 2, 1);
    const two = rate((seed) => sc.summarize(sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 35 }, seed), { forceMarch: 0 }), { format: 'queue' }).stars >= 2, 40);
    assert.ok(two >= 0.9, `${id} sigma 35 two stars ${two}`);
    const three = rate((seed) => sc.summarize(sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 18 }, seed), { forceMarch: 0 }), { format: 'queue' }).stars >= 3, 40);
    assert.ok(three >= 0.8, `${id} sigma 18 three stars ${three}`);
  }
});

test('Fever is deterministic (no routing): maxScore is the perfect run; Keep it lit gives a clean player more Fevers', () => {
  for (const id of ['waiting_room_a', 'shark_shop_a']) {
    const ch = chartOf(id, 'queue', 2, 1);
    const p = sim.perfectRun(ch);
    assert.equal(sim.maxScore(ch), p.score);
    // The meter cannot fill while a Fever is queued or live, so on these charts
    // a clean run fires on the bar 9 and 17 drop lines (the doc's "3 times"
    // needs 20 PERFECTs inside the 4-bar warm-up, which no launch chart has).
    assert.ok(p.feverCount >= 2, `${id}: ${p.feverCount} Fevers in a perfect run`);
    for (let i = 0; i + 1 < p.deployT.length; i += 2) assert.ok(sim.dropBarsOf(ch).includes(p.deployT[i + 1]));
    // A sloppy player fires fewer.
    const sloppy = sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 70, lapse: 0.08 }, 4), { forceMarch: 0 });
    assert.ok(sloppy.feverCount <= p.feverCount);
    assert.ok(sloppy.score < p.score);
  }
});

test('stars from accuracy; FULL COMBO and ALL PERFECT from a perfect run; FTUE never shows 0 stars', () => {
  assert.equal(sc.starsForAccuracy(59.9), 0);
  assert.equal(sc.starsForAccuracy(60), 1);
  assert.equal(sc.starsForAccuracy(80), 2);
  assert.equal(sc.starsForAccuracy(92), 3);
  const ch = chartOf('shark_shop_a', 'queue', 2, 8);
  const s = sim.perfectRun(ch);
  const sum = sc.summarize(s, { format: 'queue' });
  assert.equal(sum.stars, 3);
  assert.equal(sum.marchStars, 3);
  assert.ok(sum.fullCombo && sum.allPerfect);
  assert.equal(sum.accuracy, 100);
  const f = chartOf('waiting_room_a', 'ride', 1, 2, { ftue: true });
  const fs2 = sim.runScript(f, sim.scriptMasher(f, 12, 3), {});
  assert.equal(fs2.stalled, 0, 'First Parade cannot fail');
  assert.ok(sc.summarize(fs2, { format: 'ride', ftue: true }).stars >= 1);
});

test('pause: notes within +/-250 ms of the pause point are voided, not missed', () => {
  const ch = chartOf('waiting_room_a', 'queue', 2, 3);
  const s = J.createJudge(ch, { forceMarch: 0 });
  const i = firstIdx(ch, (k) => (ch.layers[k] & 1) && ch.bar[k] >= 5);
  J.judgeTick(s, ch.t[i] - 300);
  const missed = s.cMiss;
  J.voidAround(s, ch.t[i] - 100);
  assert.equal(s.res[i], T.J_VOID);
  J.judgeTick(s, ch.t[i] + 400);
  assert.equal(s.res[i], T.J_VOID);
  assert.ok(s.cMiss - missed <= 2, 'only notes outside the 250 ms void can miss');
});

test('Out of Step: 5 taps in 400 ms on a sparse stretch trips the drum major and resets the combo', () => {
  const ch = chartOf('waiting_room_a', 'queue', 1, 3);
  const s = J.createJudge(ch, { forceMarch: 0 });
  const t0 = ch.barStart[1];
  J.judgeTick(s, t0);
  s.combo = 7;
  for (let k = 0; k < 5; k++) J.judgeDown(s, t0 + k * 70, T.Z_CENTRE, k + 1, 700) || J.judgeUp(s, t0 + k * 70 + 20, k + 1);
  assert.equal(s.oos, 1);
  assert.equal(s.combo, 0);
  assert.ok(s.oosUntil > t0);
});

test('proof v6: replay with 8 ms ticks reproduces a run judged on irregular frames (MARCH pill, auto Fever, Easy Beat, ride stall)', () => {
  const ctx = (st, fmt, d, extra = {}) => ({
    stage: st, format: fmt, difficulty: d, seed: 4242, ftue: false,
    audioBackend: 'audioapi', route: 'speaker', offsetMs: 25, sharpEnabled: false, pocket: false, elapsedMs: 50000,
    pauseSpans: [], grip: 'one_thumb_r', easy: false, ...extra,
  });
  for (const [id, fmt, d, easy] of [['waiting_room_a', 'queue', 2, false], ['waiting_room_a', 'ride', 1, true], ['shark_shop_a', 'queue', 1, false], ['shark_shop_a', 'queue', 1, true]]) {
    const st = stages[id];
    const ch = chartOf(id, fmt, d, 4242);
    const script = sim.scriptHuman(ch, { sigmaMs: 45, lapse: 0.05, zoneSlip: 0.05 }, 99);
    // A few stray swipes (just misstaps now).
    let pid = 50000;
    for (const t of [ch.barStart[ch.firstBar + 3] + 100, ch.barStart[ch.firstBar + 11] + 300]) {
      script.push({ t, type: 0, zone: 0, pid, y: 760 }, { t: t + 60, type: 2, zone: 0, pid, y: 650 }, { t: t + 90, type: 1, zone: 0, pid, y: 640 });
      pid++;
    }
    script.sort((a, b) => a.t - b.t || a.type - b.type);
    const s = J.createJudge(ch, { ride: fmt === 'ride', easy });
    let now = ch.barStart[0];
    let e = 0;
    let r = 1;
    while (now < ch.endMs + 50) {
      s.marchWant = Math.floor(now / 7000) % 2; // the player toggles the pill now and then
      while (e < script.length && script[e].t <= now) {
        const x = script[e++];
        if (x.type === 0) J.judgeDown(s, x.t, x.zone, x.pid, x.y);
        else if (x.type === 1) J.judgeUp(s, x.t, x.pid);
        else J.judgeMove(s, x.t, x.pid, x.y);
      }
      J.judgeTick(s, now);
      if (s.stalled) break;
      r = (r * 1103515245 + 12345) % 2147483648;
      now += 13 + (r % 12);
    }
    J.finishJudge(s, now, false);
    const p = proof.buildProof(s, ctx(st, fmt, d, { easy }), ch.chartVersion, ch.beatmapHash);
    assert.equal(p.game, 'timing');
    assert.equal(p.v, 6);
    assert.equal(p.easy_beat, easy);
    assert.equal(p.touch_count, s.touches);
    const rep = proof.replayProof(st, JSON.parse(JSON.stringify(p)));
    assert.equal(rep.score, s.score, `${id} replay score`);
    assert.equal(rep.stars, p.client_stars);
    assert.equal(rep.judge.strays, s.strays);
    assert.ok(p.march_bars.length > 0, 'the pill gave March sections');
    assert.ok(p.march_sections.length > 0);
    for (const [, drop] of p.fever_deploys) assert.ok((drop - ch.firstBar) % 4 === 0, 'drops land on section lines');
  }
  assert.throws(() => proof.replayProof(stages.waiting_room_a, { ...proof.buildProof(J.createJudge(chartOf('waiting_room_a', 'queue', 1, 1)),
    ctx(stages.waiting_room_a, 'queue', 1), 'pb-3.0', 'bad'), beatmap_hash: 'bad' }), /beatmap_hash/);
});

test('projection: y = yHorizon + (yLine - yHorizon) / (1 + 1.857 u); spawn scale 0.35', () => {
  const lane = proj.laneFor(390, 844);
  assert.equal(lane.yLine, 506);
  assert.ok(Math.abs(proj.scaleAt(1) - 0.35) < 0.001);
  assert.equal(proj.yAt(lane, 0), 506);
  for (const u of [0.1, 0.25, 0.5, 0.75, 1]) {
    const want = lane.yHorizon + (506 - lane.yHorizon) / (1 + 1.857 * u);
    assert.ok(Math.abs(proj.yAt(lane, u) - want) < 0.5);
  }
  // Evenly spaced times accelerate toward the line.
  const gaps = [1, 0.75, 0.5, 0.25, 0].map((u) => proj.yAt(lane, u));
  for (let i = 2; i < gaps.length; i++) assert.ok(gaps[i] - gaps[i - 1] > gaps[i - 1] - gaps[i - 2]);
  assert.equal(proj.fadeIn(1), 0);
  assert.equal(proj.fadeIn(0.5), 1);
});

test('score read-outs: steadiness, timing words, histogram, auto-tune offset', () => {
  assert.equal(sc.timingWords(3), "You're right on it");
  assert.equal(sc.timingWords(-12.4), "You're 12ms early");
  assert.equal(sc.timingWords(31), "You're 31ms late");
  assert.equal(sc.steadinessLabel(90), 'Rock steady');
  assert.equal(sc.steadinessLabel(70), 'Steady');
  assert.equal(sc.steadinessLabel(10), 'Wobbly');
  assert.equal(sc.histogramOf([-200, 0, 5, 200]).length, 11);
  const ch = chartOf('waiting_room_a', 'queue', 2, 3);
  const late = sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 15, biasMs: 40 }, 3), { forceMarch: 0 });
  const next = sc.autoTuneOffset(25, late);
  assert.ok(next > 25 && next <= 65, `auto-tune moves toward late taps (${next})`);
  assert.equal(sc.clampOffset(999), 350);
});

test('progress: FTUE, unlock order (rev 7: Waiting Room, then Shark Shop), PB boards, mastery XP and tiers', () => {
  const stub = {
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
    '../stages': { STAGE_ORDER: ['waiting_room_a', 'shark_shop_a'] },
  };
  const prog = loadTs('src/games/rhythm/meta/progress.ts', stub);
  let p = prog.emptyProgress();
  assert.deepEqual(plain(prog.unlockedStages(p)), ['waiting_room_a']);
  assert.equal(prog.pickQueueStage(p, 7), 'waiting_room_a');
  const r1 = prog.recordRound(p, { stage: 'waiting_room_a', difficulty: 1, board: 'ride', score: 36000, stars: 1, ftue: true });
  p = r1.next;
  assert.equal(p.firstParadeDone, true);
  assert.equal(r1.newPb, true);
  assert.deepEqual(plain(prog.unlockedStages(p)), ['waiting_room_a', 'shark_shop_a']);
  assert.equal(prog.pickQueueStage(p, 7), 'shark_shop_a');
  const r2 = prog.recordRound(p, { stage: 'waiting_room_a', difficulty: 2, board: 'march', score: 50000, stars: 2, ftue: false });
  assert.equal(r2.next.pb['waiting_room_a:2:march'], 50000);
  assert.equal(prog.recordRound(r2.next, { stage: 'waiting_room_a', difficulty: 2, board: 'march', score: 40000, stars: 2, ftue: false }).newPb, false);
  assert.equal(prog.masteryXp(10000, 3, true), 200 + 800);
  assert.equal(prog.masteryTier(0), 0);
  assert.equal(prog.masteryTier(12000), 3);
  assert.equal(prog.masteryTier(99999), 3);
  // d2 unlocks per stage at 2 stars on d1.
  assert.equal(prog.effectiveDifficulty(p, 'shark_shop_a', 2), 1);
  const d1 = prog.recordRound(p, { stage: 'shark_shop_a', difficulty: 1, board: 'stage', score: 1, stars: 2, ftue: false }).next;
  assert.equal(prog.effectiveDifficulty(d1, 'shark_shop_a', 2), 2);
  assert.equal(prog.effectiveDifficulty(d1, 'shark_shop_a', 1), 1);
});

test('drumline: house crew and ghosts race the same chart; a ghost replays its own score', () => {
  const dl = loadTs('src/games/rhythm/multiplayer/drumline.ts');
  const ch = chartOf('waiting_room_a', 'queue', 2, 555);
  const script = sim.scriptHuman(ch, { sigmaMs: 30 }, 4);
  const live = sim.runScript(ch, script, { forceMarch: 0, limp: true });
  const ghostRun = {
    stage: 'waiting_room_a', format: 'queue', difficulty: 2, seed: 555, name: 'Maya', autoFever: false, marchBars: [],
    touches: proof.encodeTouches(live), score: live.score, barScores: [], at: 0,
  };
  const crew = dl.crewForRound(ch, { seed: 555, autoFever: false }, null, ghostRun);
  assert.equal(crew.length, 3);
  assert.equal(crew[0].isGhost, true);
  assert.equal(crew[0].finalScore, live.score, 'ghost replays to the same verified score');
  assert.equal(crew[0].barScores.length, ch.playableBars);
  for (let i = 1; i < crew[0].hitT.length; i++) assert.ok(crew[0].hitT[i] >= crew[0].hitT[i - 1]);
  // Charts are canonical: any seed replays the same ghost; another difficulty or chart version is refused.
  assert.equal(dl.ghostRival(chartOf('waiting_room_a', 'queue', 2, 556), ghostRun, 'g', '#fff', false).finalScore, live.score);
  assert.equal(dl.ghostRival(chartOf('waiting_room_a', 'queue', 1, 555), ghostRun, 'g', '#fff', false), null);
  assert.equal(dl.ghostRival(ch, { ...ghostRun, chartVersion: 'pb-1.0' }, 'g', '#fff', false), null);
  const again = dl.crewForRound(ch, { seed: 555, autoFever: false }, null, null);
  assert.deepEqual(again.map((r) => r.id), dl.crewForRound(ch, { seed: 555, autoFever: false }, null, null).map((r) => r.id));
});

test('parade_sprint (Line Party): deterministic replay, tap codes, ghost fill, marchers are not punished, Fever bars weigh 1.5x', () => {
  const ps = loadTs('src/games/rhythm/multiplayer/paradeSprint.ts');
  // Tap codes round-trip.
  for (const [ty, z, p] of [[0, 0, 0], [1, 2, 9999], [3, 0, 77], [4, 1, 0]]) {
    assert.deepEqual(plain(ps.decodeTap(ps.encodeTap(ty, z, p))), { type: ty, zone: z, pointer: p });
  }
  // Boards: one of the two ride stages by seed, the canonical sprint chart.
  const b0 = ps.buildBoard(0);
  const b1 = ps.buildBoard(1);
  assert.equal(b0.stage, 'opening_day_a');
  assert.equal(b1.stage, 'waiting_room_a');
  assert.deepEqual(Array.from(b0.chart.t), Array.from(chartOf('opening_day_a', 'ride', 1, 0).t));
  assert.ok(ps.ROUND_MS >= b0.roundMs && ps.ROUND_MS >= b1.roundMs);
  // The generated sim stages match the stage JSON (re-run tools/rhythm/export_sim_stages.mjs if this fails).
  const gen = loadTs('src/games/rhythm/stages/simStages.generated.ts').SIM_STAGES;
  for (const id of ['opening_day_a', 'waiting_room_a']) assert.deepEqual(plain(gen[id].formats.ride), stages[id].formats.ride, `${id} sim stage is current`);
  // Replay is deterministic, and a bot log is valid.
  const bot = ps.botTaps(b1, 1, 2, 'regular');
  assert.ok(ps.validTaps(bot));
  const r1 = ps.resolve(b1, bot);
  const r2 = ps.resolve(b1, JSON.parse(JSON.stringify(bot)));
  assert.equal(ps.resultHash(r1), ps.resultHash(r2));
  assert.ok(r1.score > 600 && r1.score <= 12 * 150, `duel points ${r1.score}`);
  assert.equal(r1.barPts.length, 12);
  // Validation: out of order, unknown type, too late.
  assert.equal(ps.validTaps([[10, 0], [5, 0]]), false);
  assert.equal(ps.validTaps([[10, 200000]]), false);
  assert.equal(ps.validTaps([[ps.ROUND_MS + 1, 0]]), false);
  // An empty seat scores 0; a ghost fill keeps my taps before the drop and the house drummer after.
  assert.equal(ps.resolve(b1, []).score, 0);
  const until = Math.round(b1.chart.barStart[b1.chart.firstBar + 6]);
  const ace = ps.botTaps(b1, 1, 0, 'ace');
  const filled = ps.ghostFill(b1, 1, 0, ace, until, 'regular');
  assert.ok(ps.validTaps(filled));
  assert.deepEqual(filled.filter(([t]) => t < until), ace.filter(([t]) => t < until));
  const prefix = ps.resolve(b1, ace, until);
  assert.ok(prefix.score <= ps.resolve(b1, ace).score);
  // Marchers: playing only the March layer perfectly earns full Duel Points on those bars.
  const ch = b1.chart;
  const marchTaps = [[0, ps.encodeTap(ps.T_MARCH, 1, 0)]];
  let pid = 1;
  for (let i = 0; i < ch.t.length; i++) {
    if (!(ch.layers[i] & 2)) continue;
    const t = Math.round(ch.t[i]);
    marchTaps.push([t, ps.encodeTap(0, 0, pid)], [t + 60, ps.encodeTap(1, 0, pid)]);
    pid++;
  }
  marchTaps.sort((a, b) => a[0] - b[0]);
  const march = ps.resolve(b1, marchTaps);
  const standing = ps.resolve(b1, ps.botTaps(b1, 3, 0, 'ace'));
  assert.ok(march.score >= standing.score * 0.9, `a perfect marcher (${march.score}) is not punished vs an ace (${standing.score})`);
  // Fever weighs 1.5x: a perfect run with Fever scores above 12 x 100.
  assert.ok(march.score > 1200, `Fever bars count 1.5x (${march.score})`);
});

test('Ghost Dares: rival Fever launches dare the next bar, never the Finale last 2 bars, at most one per 4 bars; dares only change the picture', () => {
  const dl = loadTs('src/games/rhythm/multiplayer/drumline.ts');
  const ch = chartOf('shark_shop_a', 'queue', 2, 1);
  const r = (launchT) => ({ id: 'x', name: 'x', color: '#fff', isGhost: true, hitT: [], barScores: [], finalScore: 0, accuracy: 0, launchT });
  const at = (bar, frac = 0.5) => ch.barStart[bar] + (ch.barStart[bar + 1] - ch.barStart[bar]) * frac;
  const b0 = ch.firstBar + 5;
  assert.deepEqual(plain(dl.dareBarsFor(ch, [r([at(b0)])])), [b0 + 1]);
  // Two launches 2 bars apart from two rivals: only the first dares.
  assert.deepEqual(plain(dl.dareBarsFor(ch, [r([at(b0)]), r([at(b0 + 2)])])), [b0 + 1]);
  assert.deepEqual(plain(dl.dareBarsFor(ch, [r([at(b0)]), r([at(b0 + 4)])])), [b0 + 1, b0 + 5]);
  // Never the Finale's last 2 bars.
  assert.deepEqual(plain(dl.dareBarsFor(ch, [r([at(ch.lastBar - 2)])])), []);
  // A crew's launches come from their own judged runs.
  const crew = dl.crewForRound(ch, { seed: 9, autoFever: false }, null, null);
  for (const c of crew) for (const t of c.launchT) assert.ok(t >= ch.barStart[ch.firstBar] && t <= ch.endMs);
  // The picture only: identical inputs judge identically with or without dares (layout reads them, the judge never does).
  const L = loadTs('src/games/rhythm/field/layout.ts');
  const s = J.createJudge(ch, { forceMarch: 0, limp: true });
  const i = firstIdx(ch, (k) => ch.bar[k] === b0 + 1);
  J.judgeTick(s, ch.t[i] - 400);
  const geom = { cx: 195, yLine: 400, yHorizon: -60, halfW: 75, noteSize: 62 };
  const flags = ch.barStart.map((_, b) => (b === b0 + 1 ? 1 : 0));
  const dA = L.createDrawList();
  const dB = L.createDrawList();
  const miss = new Array(ch.t.length).fill(-1e9);
  L.layoutFrame(dA, s, ch.beats, geom, ch.t[i] - 200, 1300, 0, miss, 0, 0, 1, []);
  L.layoutFrame(dB, s, ch.beats, geom, ch.t[i] - 200, 1300, 0, miss, 0, 0, 1, flags);
  // The dared note is the lowest one still above the line.
  const noteI = (d) => { let best = -1; for (let k = 0; k < d.n; k++) if (d.y[k] < geom.yLine && (best < 0 || d.y[k] > d.y[best])) best = k; return d.alpha[best]; };
  assert.ok(noteI(dA) > 0.9, 'visible without a dare');
  assert.equal(noteI(dB), 0, 'hidden in the last half of the read zone');
});
