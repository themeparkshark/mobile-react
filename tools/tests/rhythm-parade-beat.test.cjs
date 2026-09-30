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

test('generate: deterministic per seed, only authored rows, new seeds vary the fills', () => {
  const st = stages.waiting_room_a;
  const a = chartOf('waiting_room_a', 'queue', 2, 777);
  for (let k = 0; k < 50; k++) {
    const b = chartOf('waiting_room_a', 'queue', 2, 777);
    assert.deepEqual(Array.from(b.t), Array.from(a.t));
    assert.deepEqual(Array.from(b.kind), Array.from(a.kind));
  }
  const rows = st.formats.queue.charts['2'];
  for (let i = 0; i < a.t.length; i++) {
    assert.ok(rows.some((r) => r[0] === a.t[i]), `note at ${a.t[i]} is authored`);
  }
  const sigs = new Set();
  for (let seed = 1; seed <= 40; seed++) sigs.add(Array.from(chartOf('waiting_room_a', 'queue', 2, seed).t).join(','));
  assert.ok(sigs.size >= 5, `seeds give variety (${sigs.size})`);
});

test('generate: ride sprint vocabulary is DRUM, ROLL, BIG and at most one tap CYMBAL', () => {
  for (const id of ['opening_day_a', 'waiting_room_a']) {
    for (let seed = 1; seed < 30; seed++) {
      const ch = chartOf(id, 'ride', 1, seed);
      const kinds = new Set(Array.from(ch.kind));
      for (const k of kinds) assert.ok([T.K_DRUM, T.K_ROLL, T.K_BIG, T.K_CYMBAL].includes(k), `${id} ride kind ${k}`);
      assert.ok(Array.from(ch.kind).filter((k) => k === T.K_CYMBAL).length <= 1);
      assert.ok(Array.from(ch.flags).every((f) => (f & (T.F_FLICK | T.F_ECHO)) === 0));
      assert.equal(ch.playableBars, 12);
      assert.equal(ch.kind.filter((k) => k === T.K_BIG).length, 1);
    }
  }
});

test('generate: First Parade (FTUE) is DRUM and one BIG only', () => {
  const ch = chartOf('opening_day_a', 'ride', 1, 5, { ftue: true });
  const kinds = Array.from(ch.kind);
  assert.equal(kinds.filter((k) => k === T.K_BIG).length, 1);
  assert.ok(kinds.every((k) => k === T.K_DRUM || k === T.K_BIG));
});

test('generate: CYMBAL flick only at d3; no d3 bar has 4 same-zone notes in a row at 8th spacing', () => {
  for (const id of STAGE_IDS) {
    for (const d of [1, 2]) {
      const ch = chartOf(id, 'queue', d, 9);
      assert.ok(Array.from(ch.flags).every((f) => (f & T.F_FLICK) === 0));
    }
    const ch = chartOf(id, 'queue', 3, 9);
    let run = 1;
    for (let i = 1; i < ch.t.length; i++) {
      const a = i - 1;
      const both = (ch.kind[a] === 0 || ch.kind[a] === 1) && (ch.kind[i] === 0 || ch.kind[i] === 1) && (ch.layers[i] & 1) && (ch.layers[a] & 1);
      if (both && ch.bar[a] === ch.bar[i] && ch.kind[a] === ch.kind[i] && ch.t[i] - ch.t[a] <= ch.beatLen[i] / 2 + 15) run++;
      else run = 1;
      assert.ok(run <= 3, `${id} d3 same-zone run at ${ch.t[i]}`);
    }
    for (let i = 0; i < ch.t.length; i++) {
      if (ch.flags[i] & T.F_FLICK) {
        for (let j = i + 1; j < ch.t.length && ch.t[j] - ch.t[i] <= ch.beatLen[i] / 4; j++) {
          assert.ok(!(ch.layers[j] & 1), 'no note within 1/4 beat after a flick CYMBAL');
        }
      }
    }
  }
});

test('judge: touch-down is judged at its own time with PERFECT/GREAT/GOOD/MISS windows', () => {
  const ch = chartOf('opening_day_a', 'queue', 1, 3);
  const i = firstIdx(ch, (k) => ch.kind[k] === T.K_DRUM && (ch.layers[k] & 1));
  const cases = [[0, T.J_PERFECT], [49, T.J_PERFECT], [-80, T.J_GREAT], [140, T.J_GOOD], [-190, T.J_MISS]];
  for (const [dt, want] of cases) {
    const s = J.createJudge(ch, { forceMarch: 0 });
    J.judgeTick(s, ch.t[i] - 1000);
    const got = J.judgeDown(s, ch.t[i] + dt, T.Z_CENTRE, 1, 700);
    assert.equal(got, i);
    assert.equal(s.res[i], want, `delta ${dt}`);
  }
  // Later than GOOD: the note has already auto-missed, the tap is a stray.
  const late = J.createJudge(ch, { forceMarch: 0 });
  J.judgeTick(late, ch.t[i] - 1000);
  assert.equal(J.judgeDown(late, ch.t[i] + 160, T.Z_CENTRE, 1, 700), -1);
  assert.equal(late.res[i], T.J_MISS);
  assert.equal(late.strays, 1);
});

test('judge: zones: centre is DRUM, rim bands are RIM, dead bands count for either, WRONG SIDE otherwise', () => {
  const ch = chartOf('waiting_room_a', 'queue', 1, 3);
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

test('judge: earliest candidate is consumed (mashing ahead cannot skip notes), strays drain Groove', () => {
  const ch = synth([[5000, T.K_DRUM], [5250, T.K_DRUM], [5500, T.K_DRUM]]);
  const s = J.createJudge(ch, { forceMarch: 0 });
  // 5120 is closer to the 5250 note, but the 5000 note is still in reach: it is consumed.
  assert.equal(J.judgeDown(s, 5120, T.Z_CENTRE, 1, 700), 0);
  assert.equal(s.res[0], T.J_GOOD);
  assert.equal(s.res[1], T.J_NONE);
  const s2 = J.createJudge(ch, { forceMarch: 0 });
  J.judgeDown(s2, 3000, T.Z_CENTRE, 1, 700);
  assert.equal(s2.strays, 1);
  assert.equal(s2.groove, T.GROOVE.start + T.GROOVE.stray);
  assert.equal(s2.combo, 0);
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

test('judge: Fever arms at 100, deploys on the next bar line with two fingers, doubles points for 4 bars', () => {
  const notes = [];
  for (let t = 5000; t < 20000; t += 500) notes.push([t, T.K_DRUM]);
  const ch = synth(notes);
  const s = J.createJudge(ch, { forceMarch: 0 });
  J.judgeTick(s, 4000);
  s.meter = 99;
  J.judgeDown(s, 5000, T.Z_CENTRE, 1, 700);
  J.judgeUp(s, 5050, 1);
  assert.equal(s.armed, 1);
  const m0 = s.meter;
  J.judgeDown(s, 5500, T.Z_CENTRE, 2, 700);
  J.judgeUp(s, 5550, 2);
  assert.equal(s.meter, m0, 'overfill is wasted while armed');
  J.judgeDown(s, 6000, T.Z_CENTRE, 3, 700);
  J.judgeDown(s, 6020, T.Z_CENTRE, 4, 700);
  const bar = J.barAt(s, 6000);
  assert.equal(s.pendingDeploy, bar + 1);
  assert.equal(s.armed, 0);
  assert.equal(s.meter, 0);
  assert.deepEqual(Array.from(s.deployT), [6020]);
  J.judgeUp(s, 6100, 3);
  J.judgeUp(s, 6100, 4);
  for (let t = 6500; t <= ch.barStart[bar + 1]; t += 500) {
    J.judgeDown(s, t, T.Z_CENTRE, 10 + t, 700);
    J.judgeUp(s, t + 50, 10 + t);
  }
  J.judgeTick(s, ch.barStart[bar + 1] + 1);
  assert.equal(s.feverFrom, bar + 1);
  assert.equal(s.feverTo, bar + 5);
  const before = s.score;
  const mult = T.comboMultiplier(s.combo + 1);
  J.judgeDown(s, ch.barStart[bar + 1] + 500, T.Z_CENTRE, 99, 700);
  assert.equal(s.score - before, 300 * mult * 2, 'x2 in Fever');
  // A MISS fizzles Fever at the next beat.
  J.judgeTick(s, ch.barStart[bar + 1] + 1000 + 200);
  assert.ok(s.feverKillAt > 0);
  J.judgeTick(s, s.feverKillAt + 1);
  assert.equal(s.feverFrom, -1);
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

test('judge: March layer locks a beat before its notes spawn and never changes after', () => {
  const ch = chartOf('shark_shop_a', 'queue', 2, 4);
  const s = J.createJudge(ch, {});
  const b = ch.firstBar + 3;
  const beat = (ch.barStart[b + 1] - ch.barStart[b]) / 4;
  const lock = ch.barStart[b] - T.WINDOWS[2].approachMs - beat;
  s.walking = 0;
  J.judgeTick(s, lock - 5);
  assert.equal(s.barLayer[b], 0);
  s.walking = 1;
  J.judgeTick(s, lock + 1);
  assert.equal(s.barLayer[b], T.L_MARCH);
  s.walking = 0;
  J.judgeTick(s, lock + 400);
  assert.equal(s.barLayer[b], T.L_MARCH, 'locked');
  // Earliest note of that bar spawns after the lock.
  const first = firstIdx(ch, (k) => ch.bar[k] === b);
  assert.ok(ch.t[first] - T.WINDOWS[2].approachMs >= lock);
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
    // March bars: Groove floor 10 (the line moving cannot stall the parade).
    const m = sim.runScript(ch, sim.scriptMasher(ch, 3, 2), { forceMarch: 1 });
    assert.ok(m.groove >= 0);
  }
});

test('anti-mash: 6/10/15 taps per second stall before 60% of the chart, never star, never win the ride', () => {
  for (const id of ['opening_day_a', 'waiting_room_a', 'shark_shop_a']) {
    for (const d of [1, 2]) {
      for (const rate of [6, 10, 15]) {
        let early = 0;
        let stars = 0;
        const N = 60;
        for (let seed = 1; seed <= N; seed++) {
          const ch = chartOf(id, 'queue', d, seed);
          const s = sim.runScript(ch, sim.scriptMasher(ch, rate, seed), {});
          const first = ch.barStart[ch.firstBar];
          const span = ch.barStart[ch.lastBar + 1] - first;
          if (s.stalled && s.stallT < first + 0.6 * span) early++;
          stars += sc.summarize(s, { format: 'queue' }).stars;
        }
        assert.ok(early / N >= 0.95, `${id} d${d} ${rate}/s stalls early ${early}/${N}`);
        assert.equal(stars, 0);
      }
    }
  }
  let wins = 0;
  let n = 0;
  for (const id of ['opening_day_a', 'waiting_room_a']) {
    for (let seed = 1; seed <= 80; seed++) {
      for (const march of [0, 1]) {
        const ch = chartOf(id, 'ride', 1, seed);
        const s = sim.runScript(ch, sim.scriptMasher(ch, 8, seed), { forceMarch: march, autoFever: true });
        if (sc.summarize(s, { format: 'ride' }).rideWin) wins++;
        n++;
      }
    }
  }
  assert.ok(wins / n < 0.01, `masher ride wins ${wins}/${n}`);
});

test('human sims: ride wins for sigma 60 standing and sigma 70 walking; stars at d2 for sigma 35 and 18', () => {
  const rate = (fn, N) => {
    let ok = 0;
    for (let seed = 1; seed <= N; seed++) if (fn(seed)) ok++;
    return ok / N;
  };
  for (const id of ['opening_day_a', 'waiting_room_a']) {
    const stand = rate((seed) => {
      const ch = chartOf(id, 'ride', 1, seed);
      return sc.summarize(sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 60 }, seed), { autoFever: true, forceMarch: 0 }), { format: 'ride' }).rideWin;
    }, 80);
    assert.ok(stand >= 0.85, `${id} sigma 60 ride win ${stand}`);
    const walk = rate((seed) => {
      const ch = chartOf(id, 'ride', 1, seed);
      return sc.summarize(sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 70, lapse: 0.04, march: true }, seed), { autoFever: true, forceMarch: 1 }), { format: 'ride' }).rideWin;
    }, 80);
    assert.ok(walk >= 0.8, `${id} walking sigma 70 ride win ${walk}`);
  }
  for (const id of ['opening_day_a', 'waiting_room_a', 'shark_shop_a']) {
    const two = rate((seed) => {
      const ch = chartOf(id, 'queue', 2, seed);
      return sc.summarize(sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 35 }, seed), { forceMarch: 0 }), { format: 'queue' }).stars >= 2;
    }, 40);
    assert.ok(two >= 0.9, `${id} sigma 35 two stars ${two}`);
    const three = rate((seed) => {
      const ch = chartOf(id, 'queue', 2, seed);
      return sc.summarize(sim.runScript(ch, sim.scriptHuman(ch, { sigmaMs: 18 }, seed), { forceMarch: 0 }), { format: 'queue' }).stars >= 3;
    }, 40);
    assert.ok(three >= 0.8, `${id} sigma 18 three stars ${three}`);
  }
});

test('stars from accuracy; FULL COMBO and ALL PERFECT from a perfect run; FTUE never shows 0 stars', () => {
  assert.equal(sc.starsForAccuracy(59.9), 0);
  assert.equal(sc.starsForAccuracy(60), 1);
  assert.equal(sc.starsForAccuracy(80), 2);
  assert.equal(sc.starsForAccuracy(92), 3);
  const ch = chartOf('shark_shop_a', 'queue', 2, 8);
  const s = sim.perfectRun(ch, [], { autoFever: true });
  const sum = sc.summarize(s, { format: 'queue' });
  assert.equal(sum.stars, 3);
  assert.ok(sum.fullCombo && sum.allPerfect);
  assert.equal(sum.accuracy, 100);
  const f = chartOf('opening_day_a', 'ride', 1, 2, { ftue: true });
  const fs2 = sim.runScript(f, sim.scriptMasher(f, 12, 3), { noFailUntilMs: Infinity });
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
  const ch = chartOf('opening_day_a', 'queue', 1, 3);
  const s = J.createJudge(ch, { forceMarch: 0 });
  const t0 = ch.barStart[1];
  J.judgeTick(s, t0);
  s.combo = 7;
  for (let k = 0; k < 5; k++) J.judgeDown(s, t0 + k * 70, T.Z_CENTRE, k + 1, 700) || J.judgeUp(s, t0 + k * 70 + 20, k + 1);
  assert.equal(s.oos, 1);
  assert.equal(s.combo, 0);
  assert.ok(s.oosUntil > t0);
});

test('proof v4: replay with 8 ms ticks reproduces a run judged on irregular frames', () => {
  for (const [id, fmt, d] of [['waiting_room_a', 'queue', 2], ['opening_day_a', 'ride', 1], ['shark_shop_a', 'queue', 3]]) {
    const st = stages[id];
    const ch = chartOf(id, fmt, d, 4242);
    const script = sim.scriptHuman(ch, { sigmaMs: 45, lapse: 0.05, zoneSlip: 0.05 }, 99);
    // Live: irregular frame ticks (13-24 ms), walking toggles every 3 s.
    const s = J.createJudge(ch, { autoFever: fmt === 'ride' });
    let now = ch.barStart[0];
    let e = 0;
    let r = 1;
    while (now < ch.endMs + 50) {
      s.walking = Math.floor(now / 3000) % 2;
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
    const p = proof.buildProof(s, {
      stage: st, format: fmt, difficulty: d, seed: 4242, ftue: false, autoFever: fmt === 'ride', noFailUntilMs: 0,
      audioBackend: 'expo-av', route: 'speaker', offsetMs: 25, sharpEnabled: false, pocket: false, elapsedMs: 50000,
      pauseSpans: [], walkSource: 'motion', stepsPerMarchBar: [],
    }, ch.chartVersion, ch.beatmapHash);
    assert.equal(p.game, 'timing');
    assert.equal(p.v, 4);
    assert.equal(p.touch_count, s.touches);
    const rep = proof.replayProof(st, JSON.parse(JSON.stringify(p)));
    assert.equal(rep.score, s.score, `${id} replay score`);
    assert.equal(rep.stars, p.client_stars);
    assert.ok(p.march_bars.length > 0, 'walking toggled March bars');
  }
  assert.throws(() => proof.replayProof(stages.waiting_room_a, { ...proof.buildProof(J.createJudge(chartOf('waiting_room_a', 'queue', 1, 1)), {
    stage: stages.waiting_room_a, format: 'queue', difficulty: 1, seed: 1, ftue: false, autoFever: false, noFailUntilMs: 0, audioBackend: 'x', route: 'x',
    offsetMs: 0, sharpEnabled: false, pocket: false, elapsedMs: 0, pauseSpans: [], walkSource: 'none', stepsPerMarchBar: [],
  }, 'pb-1.0', 'bad'), beatmap_hash: 'bad' }), /beatmap_hash/);
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

test('progress: FTUE, unlock order, PB boards, mastery XP and tiers', () => {
  const stub = {
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
    '../stages': { STAGE_ORDER: ['opening_day_a', 'waiting_room_a', 'shark_shop_a', 'backpack_bounce_a'] },
  };
  const prog = loadTs('src/games/rhythm/meta/progress.ts', stub);
  let p = prog.emptyProgress();
  assert.deepEqual(plain(prog.unlockedStages(p)), ['opening_day_a']);
  assert.equal(prog.pickQueueStage(p, 7), 'opening_day_a');
  const r1 = prog.recordRound(p, { stage: 'opening_day_a', difficulty: 1, board: 'ride', score: 36000, stars: 1, ftue: true });
  p = r1.next;
  assert.equal(p.firstParadeDone, true);
  assert.equal(r1.newPb, true);
  assert.deepEqual(plain(prog.unlockedStages(p)), ['opening_day_a', 'waiting_room_a']);
  assert.equal(prog.pickQueueStage(p, 7), 'waiting_room_a');
  const r2 = prog.recordRound(p, { stage: 'waiting_room_a', difficulty: 2, board: 'march', score: 50000, stars: 2, ftue: false });
  assert.equal(r2.next.pb['waiting_room_a:2:march'], 50000);
  assert.equal(prog.recordRound(r2.next, { stage: 'waiting_room_a', difficulty: 2, board: 'march', score: 40000, stars: 2, ftue: false }).newPb, false);
  assert.equal(prog.masteryXp(10000, 3, true), 200 + 800);
  assert.equal(prog.masteryTier(0), 0);
  assert.equal(prog.masteryTier(22000), 5);
  // Backpack Bounce needs 2 stars on 3 stages.
  const all = { ...prog.emptyProgress(), stars: { opening_day_a: 2, waiting_room_a: 2, shark_shop_a: 2 } };
  assert.ok(prog.unlockedStages(all).includes('backpack_bounce_a'));
});

test('drumline: house crew and ghosts race the same chart; a ghost replays its own score', () => {
  const dl = loadTs('src/games/rhythm/multiplayer/drumline.ts');
  const ch = chartOf('waiting_room_a', 'queue', 2, 555);
  const script = sim.scriptHuman(ch, { sigmaMs: 30 }, 4);
  const live = sim.runScript(ch, script, { forceMarch: 0 });
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
  // A ghost from another seed is refused (identical chart only).
  assert.equal(dl.ghostRival(chartOf('waiting_room_a', 'queue', 2, 556), ghostRun, 'g', '#fff', false), null);
  const again = dl.crewForRound(ch, { seed: 555, autoFever: false }, null, null);
  assert.deepEqual(again.map((r) => r.id), dl.crewForRound(ch, { seed: 555, autoFever: false }, null, null).map((r) => r.id));
});
