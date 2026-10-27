#!/usr/bin/env node
'use strict';
/**
 * Replay one map catch through the real studio engine on the silent TraceBackend
 * (wow-sound lane, Oct 24 2026), with the studio switch off (what the app plays
 * today) or on (the studio vocabulary), and print the trace as [studio-trace]
 * lines with times relative to the tap. The calls and their times follow the
 * map catch on claude/p23-wow-map 00100bd0 (HomeCatchMoment's onBeat on the
 * UI-thread catch clock, through tools/audio/wowmap-catch-beats.cjs): the tap,
 * the wobble beats, the beam (--beam), hitstop, burst (heavy, success 180 ms
 * later, the chime), fly (whoosh), each coin landing in the counter, the stamp,
 * the NEW find's bar tick, done. Never plays audio.
 *
 *   node tools/audio/replay-catch.cjs --switch off|on [--repeat] [--beam] [--quick N] [--coins 10] [--t0 MS]
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

const beam = process.argv.includes('--beam');
const { wowMapCatch } = require('./wowmap-catch-beats.cjs');

async function main() {
  const e = traceEngine({ start: new Date(2026, 9, 24, 17, 0, 0).getTime() });
  e.Catch.resetCatchSoundForTests();
  if (!on) e.Switch.setStudioSoundOverride(false);
  await e.GameAudio.init();
  // The map catch's calls (wow-map 00100bd0: the tap, then the UI-thread clock's beats; tools/audio/wowmap-catch-beats.cjs).
  const one = async (isRepeat, isBeam = false) => {
    const r = await wowMapCatch(e, { repeat: isRepeat, beam: isBeam, coins, isNew: true });
    return { t0: r.t0 };
  };
  for (let i = 0; i < quick; i++) { await one(i > 0 || repeat); e.clock.advance(20_000); }
  // Keep the file names (each cue names its file once, when it loads).
  const loaded = e.Trace.traceEvents().filter((x) => x.kind === 'legacy' && x.name === 'file');
  e.Trace.clearTrace();
  // A beam catch (the 10th, the 25th) is the full show since wow-map round 5.
  const { t0 } = await one(!beam && (repeat || quick > 0), beam);
  const lines = [...loaded.map((x) => ({ ...x, t: t0 })), ...e.Trace.traceEvents()].sort((a, b) => a.t - b.t)
    .map((x) => `[studio-trace] ${x.t - t0 + T0} ${x.kind} ${x.name}${x.detail ? ` ${x.detail}` : ''}`);
  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
