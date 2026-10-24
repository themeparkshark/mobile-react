#!/usr/bin/env node
'use strict';
/**
 * Replay one map catch through the real studio engine on the silent TraceBackend
 * (wow-sound lane, Oct 24 2026), with the studio switch off (what the app plays
 * today) or on (the studio vocabulary), and print the trace as [studio-trace]
 * lines with times relative to the tap. The calls and their times follow the
 * map catch on claude/p23-wow-map (HomeCatchMoment + mapWow catchPlan): the tap
 * mark, the haptic plan, the pop, hitstop, burst (heavy, success 180 ms later,
 * the chime), fly (whoosh), land (badge, success), the cascade ticks, the set
 * bar tick and the coin stream landing in the counter. Never plays audio.
 *
 *   node tools/audio/replay-catch.cjs --switch off|on [--repeat] [--quick N] [--coins 10] [--t0 MS]
 *
 * --quick N runs N earlier quick catches first (so the run heat is N), --t0
 * shifts every time (to line a replay up with a recorded clip's tap).
 */
const { traceEngine } = require('../tests/helpers/studio-trace-harness.cjs');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const flush = () => new Promise((r) => setImmediate(r));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const on = arg('--switch', 'on') === 'on';
const repeat = process.argv.includes('--repeat');
const quick = Number(arg('--quick', '0'));
const coins = Number(arg('--coins', '10'));
const T0 = Number(arg('--t0', '0'));

const wow = loadTs('src/components/map/alive/mapWow.ts');

async function main() {
  const e = traceEngine({ start: new Date(2026, 9, 24, 17, 0, 0).getTime() });
  e.Catch.resetCatchSoundForTests();
  if (!on) e.Switch.setStudioSoundOverride(false);
  await e.GameAudio.init();
  const advance = async (ms) => {
    const end = e.clock.now + ms;
    await flush();
    for (;;) {
      const next = Math.min(e.clock.nextAt(), end);
      e.clock.advance(Math.max(0, next - e.clock.now));
      await flush(); await flush();
      if (next >= end) break;
    }
  };
  const one = async (isRepeat) => {
    const plan = wow.catchPlan({ reduced: false, repeat: isRepeat });
    const haptics = wow.catchHaptics(plan).filter((s) => s.at < plan.hitStopAt);
    const t0 = e.clock.now;
    const at = (ms) => advance(t0 + ms - e.clock.now);
    const calls = [];
    const add = (t, fn) => calls.push({ t, fn });
    add(0, () => { e.Catch.catchMark(isRepeat ? 'tap-repeat' : 'tap'); });
    for (const h of haptics) add(h.at, () => e.Catch.catchHaptic(h.intent, h.at === 0 ? 3 : 2));
    add(0, () => e.Catch.catchSound('pop'));
    add(plan.hitStopAt, () => e.Catch.catchMark('hitstop'));
    add(plan.burstAt, () => { e.Catch.catchMark('burst'); e.Catch.catchHaptic('comboHeavy', 3); e.Catch.catchSound('chime', { volume: 0.8 }); });
    add(plan.burstAt + 180, () => e.Catch.catchHaptic('success', 3));
    add(plan.flyAt, () => { e.Catch.catchMark('fly'); e.Catch.catchSound('whoosh', { volume: 0.6 }); });
    add(plan.landAt, () => { e.Catch.catchSound('badge'); e.Catch.catchHaptic('success', 4); });
    // Cascade: progress, grade, coins (a common already in the book: no NEW beat).
    const step = plan.repeat ? 60 : 120;
    for (let i = 0; i < 3; i++) add(plan.landAt + step * (i + 1), () => e.Catch.catchSound('tick', { pitch: 2 + i * 2, volume: 0.7 }));
    add(plan.landAt + step * 3 + plan.barMs, () => { e.Catch.catchHaptic('tickSelection', 2); e.Catch.catchSound('tick', { pitch: 14, volume: 0.6 }); });
    // The coin stream lands in the counter from the burst on.
    const stream = wow.coinStreamPlan(coins, false);
    stream.landAt.forEach((ms, i) => add(plan.coinsAt + ms, () => {
      const last = i === stream.count - 1;
      if (i % 3 === 2) e.Catch.catchHaptic('tickSelection', 1);
      if (i % 2 === 0 || last) e.Catch.catchSound('tick', { pitch: 2 + i, volume: 0.45 });
    }));
    add(plan.doneAt, () => e.Catch.catchMark('done'));
    calls.sort((a, b) => a.t - b.t);
    for (const c of calls) { await at(c.t); c.fn(); }
    await at(plan.doneAt + 600);
    return { t0, plan };
  };
  for (let i = 0; i < quick; i++) { await one(i > 0 || repeat); e.clock.advance(20_000); }
  // Keep the file names (each cue names its file once, when it loads).
  const loaded = e.Trace.traceEvents().filter((x) => x.kind === 'legacy' && x.name === 'file');
  e.Trace.clearTrace();
  const { t0 } = await one(repeat || quick > 0);
  const lines = [...loaded.map((x) => ({ ...x, t: t0 })), ...e.Trace.traceEvents()].sort((a, b) => a.t - b.t)
    .map((x) => `[studio-trace] ${x.t - t0 + T0} ${x.kind} ${x.name}${x.detail ? ` ${x.detail}` : ''}`);
  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
