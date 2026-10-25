'use strict';
/**
 * The map catch's calls into catchAudio, exactly as HomeCatchMoment makes them on claude/p23-wow-sound (wow-map wave 4
 * b2704154 plus the wave 5 wow-sound beat fixes): the tap's marks, buzz and pop on the JS thread, then every beat of
 * the UI-thread clock (mapWow.catchPlan, catchHaptics, coinStreamPlan) delivered to JS with runOnJS, each one first
 * telling catchAudio when it was due (catchBeatAt). Wave 4/5 shapes covered:
 *  - the snappy repeat, the 5th-catch treat (burst held 280 ms), the full show, the 10th's beam and the grand 25th
 *    (beam, a 'grand' mark on the tap, and its second heavy as a UI beat at burst + 90);
 *  - the server answer: the clock holds on the held frame (hitStopAt) until the answer AND its React commit have
 *    landed (wave 4 releaseCaught), so every beat after the held frame moves by the hold; the beam is in the tap's
 *    ladder, so it still lands on the held frame;
 *  - `stalls`: the JS thread is busy for a while at a clock time; beats and timers that fall due inside a stall all
 *    run right after it, in order (how round 4's live trace bunched two wobble beats into the same millisecond).
 * Drives the real engine on the silent TraceBackend (tools/tests/helpers/studio-trace-harness.cjs). Nothing here can
 * make a sound.
 */

const flush = () => new Promise((r) => setImmediate(r));

/** DURATION.hitStop and DURATION.exit (src/ui/motion.ts). */
const HIT_STOP = 70;
const EXIT = 200;

/**
 * mapWow.catchPlan beat times, ms on the catch clock (wave 4): the snappy repeat (hit-stop 360, burst 430, done 1290),
 * the treat (the same repeat with its burst held 280 ms instead of 170: done 1400) and the full show (done 2580),
 * which the first catch and every milestone (10th, 25th) play.
 */
function plan(repeat, treat = false) {
  if (repeat) {
    const hitStopAt = 360;
    const burstAt = hitStopAt + HIT_STOP;
    const suckAt = burstAt + (treat ? 280 : 170);
    const flyAt = suckAt + 90;
    const landAt = flyAt + 330;
    const exitAt = landAt + 120 + 20;
    return { wobbles: [[150, 'tickSelection'], [290, 'hitMedium']], hitStopAt, burstAt, flyAt, badgeAt: flyAt, landAt,
      tickAt: landAt + 120 + 10, exitAt, doneAt: exitAt + 130, coinsAt: burstAt };
  }
  const hitStopAt = 600;
  const burstAt = hitStopAt + HIT_STOP;
  const flyAt = burstAt + 420 + 120;
  const landAt = flyAt + 540;
  return { wobbles: [[200, 'tickSelection'], [350, 'tapLight'], [480, 'hitMedium']], hitStopAt, burstAt, flyAt, badgeAt: flyAt, landAt,
    tickAt: landAt + 340 + 20, exitAt: 2380, doneAt: 2380 + EXIT, coinsAt: burstAt };
}

/** coinStreamPlan: one coin per coin won (at most 8), landing 720 ms after the burst, 40 ms apart. */
function coinLands(coins, cap = 8) {
  const n = Math.min(8, cap, Math.max(0, Math.floor(coins)));
  return Array.from({ length: n }, (_, i) => i * 40 + 200 + 520);
}

/** wow-map burstVariant: the show a session's nth catch gets. */
function variantFor(n) {
  if (n % 25 === 0) return { kind: 'grand', beam: true, grand: true, treat: false, milestone: true };
  if (n % 10 === 0) return { kind: 'beam', beam: true, grand: false, treat: false, milestone: true };
  if (n % 5 === 0) return { kind: 'treat', beam: false, grand: false, treat: true, milestone: false };
  return { kind: n === 1 ? 'first' : 'repeat', beam: false, grand: false, treat: false, milestone: false };
}

/**
 * One catch. Returns { t0, clock0, hold, delivered, lands, plan }.
 * opts: n (the session's catch number: picks the show, as wow-map's burstVariant), or repeat/beam/grand/treat by hand;
 * coins (10), isNew (true), clockDelayMs (40: the find's copy draws, at most 280), serverMs (the answer, 120),
 * commitMs (the answer's React commit, 40), pressEcho, stalls [{ at, ms }] in clock ms or [{ after: beatName, ms }].
 */
async function wowMapCatch(e, opts = {}) {
  const v = opts.n ? variantFor(opts.n) : null;
  const beam = opts.beam ?? v?.beam ?? false;
  const grand = opts.grand ?? v?.grand ?? false;
  const treat = opts.treat ?? v?.treat ?? false;
  const repeat = opts.repeat ?? (v ? opts.n > 1 && !v.milestone : false);
  const { coins = 10, isNew = true, clockDelayMs = 40, serverMs = 120, commitMs = 40, pressEcho = false, stalls = [] } = opts;
  const C = e.Catch;
  const p = plan(repeat, treat);
  const t0 = e.clock.now;
  const clock0 = t0 + clockDelayMs;
  // The burst waits for the answer and its commit: the clock holds on the held frame for whatever is left.
  const hold = Math.max(0, serverMs + commitMs - (clockDelayMs + p.hitStopAt));
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
  // `at` is the beat's catch-clock time; after the held frame the wall time moves by the hold.
  const add = (at, name, fn) => beats.push({ at, wall: at + (at > p.hitStopAt ? hold : 0), name, fn });
  p.wobbles.forEach(([at, intent], k) => add(at, `wobble${k + 1}`, () => C.catchHaptic(intent, 2)));
  // Wave 5 round 2: the slam's lighter buzz 50 ms before the held frame (120 before the burst), the slam's sound on it,
  // and the heavy on the burst frame on every show.
  if (beam) add(p.hitStopAt - 50, 'slam', () => C.catchMark('slam'));
  if (beam) add(p.hitStopAt, 'beam', () => { C.catchMark('beam'); C.catchSound('chime', { volume: 0.7, pitch: 6 }); });
  add(p.hitStopAt + 1, 'hitstop', () => C.catchMark('hitstop'));
  add(p.burstAt, 'burst', () => { C.catchMark('burst'); C.catchHaptic('comboHeavy', 3); C.catchSound('chime', grand ? { volume: 0.9, pitch: 4 } : { volume: 0.8 }); });
  if (grand) add(p.burstAt + 90, 'grand-heavy', () => C.catchHaptic('comboHeavy', 2));
  add(p.burstAt + 180, 'success', () => C.catchHaptic('success', 3));
  add(p.badgeAt + 1, 'badge', () => C.catchMark('badge'));
  add(p.flyAt, 'fly', () => { C.catchMark('fly'); C.catchSound('whoosh', { volume: 0.6 }); });
  const lands = coinLands(coins).map((ms) => p.coinsAt + ms);
  lands.forEach((at, i) => add(at, `coin${i}`, () => {
    if (i === 0) C.catchMark('coins-land');
    if (i % 3 === 2) C.catchHaptic('tickSelection', 1);
    if (i % 2 === 0) C.catchSound('tick', { pitch: 2 + i, volume: 0.45 });
  }));
  add(p.landAt, 'land', () => { C.catchMark('land'); C.catchSound('badge'); C.catchHaptic('tapLight', 2); });
  if (isNew) add(p.tickAt, 'bar', () => { C.catchHaptic('tickSelection', 2); C.catchSound('tick', { pitch: 14, volume: 0.6 }); });
  add(p.exitAt, 'exit', () => undefined);
  // wow-map's BEAT.done is on plan.doneAt (the clock itself runs on to endAt for the counter's roll), so on the
  // short show the last coins land after 'done'.
  add(p.doneAt, 'done', () => C.catchMark('done'));
  beats.sort((a, b) => a.wall - b.wall || a.at - b.at);

  // The tap (JS): the map's press buzz, the marks, the press buzz, the pop.
  if (pressEcho) e.Haptics.queueHaptic('tapLight', 1);
  C.catchMark(repeat ? 'tap-repeat' : 'tap');
  if (grand) C.catchMark('grand');
  if (beam) C.catchMark('beam-due');
  C.catchHaptic('tapLight', 3);
  C.catchSound('pop');

  // { at, ms }: the JS thread is busy from clock ms `at`; { after, ms }: busy right after beat `after` runs.
  const windows = stalls.filter((s) => s.at !== undefined).map((s) => ({ from: clock0 + s.at, to: clock0 + s.at + s.ms })).sort((a, b) => a.from - b.from);
  const afterBeat = new Map(stalls.filter((s) => s.after).map((s) => [s.after, s.ms]));
  const delivered = [];
  let w = 0;
  for (const b of beats) {
    // A beat already late (the JS thread was busy) is due now; a stall can start right after it.
    const due = Math.max(clock0 + b.wall, e.clock.now);
    while (w < windows.length && windows[w].from <= due) {
      await advanceTo(windows[w].from);
      e.clock.stall(windows[w].to - windows[w].from);
      w += 1;
    }
    if (due > e.clock.now) await advanceTo(due);
    delivered.push({ name: b.name, planned: b.wall, at: e.clock.now - clock0 });
    // HomeCatchMoment.onBeat: catchBeatAt(the beat's due wall time) first, then the beat's calls.
    C.catchBeatAt(clock0 + b.wall);
    b.fn();
    await flush();
    if (afterBeat.has(b.name)) e.clock.stall(afterBeat.get(b.name));
  }
  await advanceTo(e.clock.now + 1200);
  return { t0, clock0, hold, delivered, lands, plan: p, beam, grand, treat, repeat };
}

module.exports = { wowMapCatch, plan, coinLands, variantFor };
