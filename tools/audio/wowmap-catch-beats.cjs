'use strict';
/**
 * The map catch's calls into catchAudio, exactly as HomeCatchMoment on claude/p23-wow-map
 * (00100bd0, round 5, with the wave 4 beam fix: the beam beat and the burst read a JS const) makes them: the tap's mark, buzz and pop on the JS thread, then every
 * beat of the UI-thread clock (mapWow.catchPlan, catchHaptics, coinStreamPlan) delivered to JS
 * with runOnJS (wow-sound lane, Oct 24 2026). `stalls` freeze the JS thread for a while at a
 * clock time: beats and timers that fall due inside a stall all run right after it, in order,
 * which is how round 4's live trace bunched two wobble beats into the same millisecond.
 * Drives the real engine on the silent TraceBackend (tools/tests/helpers/studio-trace-harness.cjs).
 * Nothing here can make a sound.
 */

const flush = () => new Promise((r) => setImmediate(r));

/**
 * mapWow.catchPlan beat times, ms on the catch clock (claude/p23-wow-map 00100bd0, round 5): the snappier
 * repeat (hit-stop 360, burst 430, done 1290) and the full show (done 2580). The 10th and 25th catches
 * (milestones) play the full show with the beam.
 */
function plan(repeat) {
  if (repeat) {
    return { wobbles: [[150, 'tickSelection'], [290, 'hitMedium']], hitStopAt: 360, burstAt: 430, flyAt: 690, landAt: 1020, tickAt: 1150, doneAt: 1290, coinsAt: 430 };
  }
  return { wobbles: [[200, 'tickSelection'], [350, 'tapLight'], [480, 'hitMedium']], hitStopAt: 600, burstAt: 670, flyAt: 1210, landAt: 1750, tickAt: 2110, doneAt: 2580, coinsAt: 670 };
}

/** coinStreamPlan: one coin per coin won (at most 8), landing 720 ms after the burst, 40 ms apart. */
function coinLands(coins, cap = 8) {
  const n = Math.min(8, cap, Math.max(0, Math.floor(coins)));
  return Array.from({ length: n }, (_, i) => i * 40 + 200 + 520);
}

/**
 * One catch. Returns { t0, clock0, beats } where beats are { at (clock ms), name } in order.
 * opts: repeat, beam, coins (10), isNew (true), clockDelayMs (40: the find's copy draws, at most 280),
 * pressEcho (the map's own press buzz just before the tap), stalls [{ at, ms }] in clock ms or
 * [{ after: beatName, ms }].
 */
async function wowMapCatch(e, opts = {}) {
  const { repeat = false, beam = false, coins = 10, isNew = true, clockDelayMs = 40, pressEcho = false, stalls = [] } = opts;
  const C = e.Catch;
  const p = plan(repeat);
  const t0 = e.clock.now;
  const clock0 = t0 + clockDelayMs;
  // Exact: jump timer to timer (flushing promises after each), so no time is quantized.
  const advanceTo = async (abs) => {
    await flush();
    for (;;) {
      const next = Math.min(e.clock.nextAt(), abs);
      if (next > e.clock.now) e.clock.advance(next - e.clock.now);
      else e.clock.advance(0);
      await flush(); await flush();
      if (next >= abs) break;
    }
  };
  const beats = [];
  const add = (at, name, fn) => beats.push({ at, name, fn });
  p.wobbles.forEach(([at, intent], k) => add(at, `wobble${k + 1}`, () => C.catchHaptic(intent, 2)));
  if (beam) add(p.hitStopAt, 'beam', () => { C.catchMark('beam'); C.catchHaptic('comboHeavy', 3); C.catchSound('chime', { volume: 0.7, pitch: 6 }); });
  add(p.hitStopAt + 1, 'hitstop', () => C.catchMark('hitstop'));
  add(p.burstAt, 'burst', () => { C.catchMark('burst'); if (!beam) C.catchHaptic('comboHeavy', 3); C.catchSound('chime', { volume: 0.8 }); });
  add(p.burstAt + 180, 'success', () => C.catchHaptic('success', 3));
  add(p.flyAt, 'fly', () => { C.catchMark('fly'); C.catchSound('whoosh', { volume: 0.6 }); });
  add(p.flyAt + 1, 'badge', () => C.catchMark('badge'));
  const lands = coinLands(coins).map((ms) => p.coinsAt + ms);
  lands.forEach((at, i) => add(at, `coin${i}`, () => {
    if (i === 0) C.catchMark('coins-land');
    if (i % 3 === 2) C.catchHaptic('tickSelection', 1);
    if (i % 2 === 0) C.catchSound('tick', { pitch: 2 + i, volume: 0.45 });
  }));
  add(p.landAt, 'land', () => { C.catchMark('land'); C.catchSound('badge'); C.catchHaptic('tapLight', 2); });
  if (isNew) add(p.tickAt, 'bar', () => { C.catchHaptic('tickSelection', 2); C.catchSound('tick', { pitch: 14, volume: 0.6 }); });
  // wow-map's BEAT.done is on plan.doneAt (the clock itself runs on to endAt for the counter's roll), so on the
  // short show the last coins land after 'done'.
  add(p.doneAt, 'done', () => C.catchMark('done'));
  beats.sort((a, b) => a.at - b.at);

  // The tap (JS): the map's press buzz, the mark, the press buzz, the pop.
  if (pressEcho) e.Haptics.queueHaptic('tapLight', 1);
  C.catchMark(repeat ? 'tap-repeat' : 'tap');
  C.catchHaptic('tapLight', 3);
  C.catchSound('pop');

  // { at, ms }: the JS thread is busy from clock ms `at`; { after, ms }: busy right after beat `after` runs.
  const windows = stalls.filter((s) => s.at !== undefined).map((s) => ({ from: clock0 + s.at, to: clock0 + s.at + s.ms })).sort((a, b) => a.from - b.from);
  const afterBeat = new Map(stalls.filter((s) => s.after).map((s) => [s.after, s.ms]));
  const delivered = [];
  let w = 0;
  for (const b of beats) {
    // A beat already late (the JS thread was busy) is due now; a stall can start right after it.
    const due = Math.max(clock0 + b.at, e.clock.now);
    // Enter every stall that starts before this beat is delivered.
    while (w < windows.length && windows[w].from <= due) {
      await advanceTo(windows[w].from);
      e.clock.stall(windows[w].to - windows[w].from);
      w += 1;
    }
    if (due > e.clock.now) await advanceTo(due);
    delivered.push({ name: b.name, planned: b.at, at: e.clock.now - clock0 });
    b.fn();
    await flush();
    if (afterBeat.has(b.name)) e.clock.stall(afterBeat.get(b.name));
  }
  await advanceTo(e.clock.now + 1200);
  return { t0, clock0, delivered, lands };
}

module.exports = { wowMapCatch, plan, coinLands };
