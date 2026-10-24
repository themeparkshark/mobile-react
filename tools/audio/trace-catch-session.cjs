#!/usr/bin/env node
'use strict';
/**
 * A 50-catch map session through the real studio engine on the silent
 * TraceBackend (wow-sound lane, Oct 24 2026). Each catch replays the map
 * catch's own calls in order (HomeCatchMoment on claude/p23-wow-map: the
 * catchMark beats, catchSound and catchHaptic at their catchPlan times) on a
 * virtual clock, then the log is checked: which burst each catch got, that
 * the wobble ticks sit on the wobble haptics, that each burst sound starts on
 * the burst haptic, that repeats are shorter than firsts, round-robin never
 * repeats back to back, and the coin ladder resets after a pause.
 *
 *   node tools/audio/trace-catch-session.cjs [out.txt]     (never plays audio)
 */
const fs = require('node:fs');
const { traceEngine } = require('../tests/helpers/studio-trace-harness.cjs');

const flush = () => new Promise((r) => setImmediate(r));

async function run({ catches = 50 } = {}) {
  // 5:00 pm Pacific on Friday, October 24, 2026.
  const e = traceEngine({ start: new Date(2026, 9, 24, 17, 0, 0).getTime() });
  e.Catch.resetCatchSoundForTests();
  await e.GameAudio.init();
  // Exact: jump timer to timer (flushing promises after each), so no time is quantized.
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
  // Gaps between catches (ms): a run of quick catches, a walk, another run, then the next morning.
  const gapFor = (i) => (i === 20 ? 6 * 60_000 : i === 35 ? 16 * 3600_000 : i % 7 === 0 ? 150_000 : 25_000);
  const catchesAt = [];
  for (let i = 1; i <= catches; i++) {
    const t0 = e.clock.now;
    catchesAt.push(t0);
    const at = (ms) => advance(t0 + ms - e.clock.now);
    // HomeCatchMoment (wow-map): tap mark, haptic plan, pop.
    // The map's own press buzz lands just before the catch starts (the live trace's +107 ms tap case):
    // the catch's beats must not wait behind it.
    e.Haptics.queueHaptic('tapLight', 1);
    e.Catch.catchMark('tap');
    e.Catch.catchHaptic('tapLight', 3);
    e.Catch.catchSound('pop');
    await at(200); e.Catch.catchHaptic('tickSelection', 2);
    await at(350); e.Catch.catchHaptic('tapLight', 2);
    await at(480); e.Catch.catchHaptic('hitMedium', 2);
    await at(600); e.Catch.catchMark('hitstop');
    await at(670); e.Catch.catchMark('burst'); e.Catch.catchHaptic('comboHeavy', 3); e.Catch.catchSound('chime', { volume: 0.8 });
    await at(850); e.Catch.catchHaptic('success', 3);
    await at(900); e.Catch.catchMark('fly'); e.Catch.catchSound('whoosh', { volume: 0.6 });
    await at(1500); e.Catch.catchSound('badge'); e.Catch.catchHaptic('success', 4);
    for (let b = 0; b < 4; b++) { await at(1620 + b * 120); e.Catch.catchSound('tick', { pitch: 2 + b * 2, volume: 0.7 }); }
    await at(2200); e.Catch.catchMark('done');
    // The coins tick into the wallet (CurrencyFlyProvider: catch.count per landing coin, 110 ms apart).
    for (let c = 0; c < 5; c++) { await at(2300 + c * 110); e.Moments.playMoment('catch.count'); }
    await at(3200);
    if (i < catches) e.clock.advance(gapFor(i));
  }
  // A whack run: 12 hits 180 ms apart (round-robin).
  for (let h = 0; h < 12; h++) { e.Moments.playMoment('game.hit', { context: 'game' }); await advance(180); }
  await advance(500);
  return { e, catchesAt };
}

function analyse(e, catchesAt) {
  const ev = e.Trace.traceEvents().slice().sort((a, b) => a.t - b.t);
  const sounds = ev.filter((x) => x.kind === 'sound');
  const marks = ev.filter((x) => x.kind === 'mark');
  const haptics = e.haptics;
  const perCatch = catchesAt.map((t0, i) => {
    const t1 = catchesAt[i + 1] ?? Infinity;
    const inside = (x) => x.t >= t0 && x.t < t1;
    const run = marks.find((m) => inside(m) && m.name === 'catch-run');
    const burst = run ? run.detail.split('-> ')[1] : null;
    const burstSound = sounds.find((s) => inside(s) && burst && s.name.startsWith(`moment:${burst}:primary`));
    const burstHaptic = haptics.find((h) => h.t >= t0 + 660 && h.t < t0 + 700 && h.intent === 'comboHeavy');
    const wobbleSounds = sounds.filter((s) => inside(s) && s.name.startsWith('moment:catch.wobble:'));
    const wobbleHaptics = haptics.filter((h) => h.t > t0 + 100 && h.t < t0 + 600);
    const catchSounds = sounds.filter((s) => inside(s) && s.t < t0 + 2250 && s.name.startsWith('moment:catch.'));
    const end = Math.max(...sounds.filter((s) => inside(s) && s.name.startsWith(`moment:${burst}:`)).map((s) => s.t)) - (burstSound?.t ?? 0);
    return {
      n: i + 1, burst,
      burstSoundMs: burstSound ? burstSound.t - t0 : null,
      burstHapticMs: burstHaptic ? burstHaptic.t - t0 : null,
      wobbleSoundMs: wobbleSounds.map((s) => s.t - t0),
      wobbleRungs: wobbleSounds.map((s) => s.name.split('#')[1]),
      heat: Number((marks.find((m) => inside(m) && m.name === 'catch-heat')?.detail ?? '+0').slice(1)),
      badgeRungs: sounds.filter((s) => inside(s) && s.name.startsWith('moment:ui.counterTick:')).map((s) => s.name.split('#')[1]),
      wobbleHapticMs: wobbleHaptics.map((h) => h.t - t0),
      wobbleIntents: wobbleHaptics.map((h) => h.intent),
      thumpMs: (haptics.find((h) => h.t >= t0 + 700 && h.t < t0 + 850 && h.intent === 'hitRigid')?.t ?? t0 - 1) - t0,
      hot: sounds.some((s) => inside(s) && s.name.startsWith('moment:catch.hot:')),
      rollEndMs: (() => {
        const land = sounds.find((s) => inside(s) && s.name.startsWith('moment:catch.land:'));
        const ticks = sounds.filter((s) => inside(s) && s.name.startsWith('moment:ui.counterTick:'));
        return land && ticks.length ? Math.max(...ticks.map((s) => s.t)) - land.t : null;
      })(),
      sounds: catchSounds.length,
      burstLayersSpanMs: Number.isFinite(end) ? end : 0,
      legacy: sounds.filter((s) => inside(s) && s.t < t0 + 2250 && !s.name.startsWith('moment:')).map((s) => s.name),
    };
  });
  const hits = sounds.filter((s) => s.name.startsWith('moment:game.hit:primary')).map((s) => s.name.split('#')[1]);
  const ladderRuns = [];
  catchesAt.forEach((t0, i) => {
    const t1 = catchesAt[i + 1] ?? Infinity;
    ladderRuns.push(sounds.filter((s) => s.t >= t0 + 2250 && s.t < t1 && s.name.startsWith('moment:catch.count:')).map((s) => s.name.split('#')[1]));
  });
  return { perCatch, hits, ladderRuns };
}

async function main() {
  const { e, catchesAt } = await run();
  const a = analyse(e, catchesAt);
  const out = process.argv[2];
  const lines = [
    '50-catch map session, real studio engine on the silent TraceBackend (virtual clock; nothing played).',
    'Per catch: burst moment, heat | burst haptic and sound ms (thump = the hot second buzz, +hot = the bright layer) | wobble rungs, sound ms, haptic intents | the counter roll | legacy sounds',
    ...a.perCatch.map((c) => `#${String(c.n).padStart(2)} ${c.burst.padEnd(17)} heat +${c.heat} | hap ${c.burstHapticMs} snd ${c.burstSoundMs}${c.thumpMs > 0 ? ` thump ${c.thumpMs}` : ''}${c.hot ? ' +hot' : ''} | wobble ${c.wobbleRungs.join(' ')} at ${c.wobbleSoundMs.join(',')} haps ${c.wobbleIntents.join(',')} | count roll ${c.badgeRungs.join(' ')} ends ${c.rollEndMs} ms after the stamp | legacy ${c.legacy.join(',') || 'none'}`),
    `whack hits round-robin: ${a.hits.join(' ')}`,
    `coin ladder per catch: ${a.ladderRuns.slice(0, 3).map((r) => r.join(',')).join(' | ')} ...`,
    '',
    'Full trace (ms from the first event):',
    e.Trace.traceText(),
  ];
  if (out) fs.writeFileSync(out, lines.join('\n') + '\n');
  else console.log(lines.slice(0, 60).join('\n'));
}

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });

module.exports = { run, analyse };
