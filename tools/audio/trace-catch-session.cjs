#!/usr/bin/env node
'use strict';
/**
 * A 50-catch map session through the real studio engine on the silent
 * TraceBackend (wow-sound lane, Oct 24 2026). Each catch replays the map
 * catch's own calls in order (HomeCatchMoment on claude/p23-wow-map cb614f50:
 * the tap on the JS thread, then every beat of the UI-thread catch clock,
 * through tools/audio/wowmap-catch-beats.cjs) on a virtual clock, then the log
 * is checked: which burst each catch got (the picture's: full show, short show,
 * the 10th catch's beam, the 25th's grand burst), that the wobble ticks sit on
 * the wobble haptics, that each burst sound starts on the burst haptic, that
 * every counter tick lands on a coin landing, round-robin never repeats back to
 * back, and the coin ladder resets after a pause.
 *
 *   node tools/audio/trace-catch-session.cjs [out.txt]     (never plays audio)
 */
const fs = require('node:fs');
const { traceEngine } = require('../tests/helpers/studio-trace-harness.cjs');
const { wowMapCatch, plan } = require('./wowmap-catch-beats.cjs');

const flush = () => new Promise((r) => setImmediate(r));

async function run({ catches = 50 } = {}) {
  // 5:00 pm Pacific on Friday, October 24, 2026.
  const e = traceEngine({ start: new Date(2026, 9, 24, 17, 0, 0).getTime() });
  e.Catch.resetCatchSoundForTests();
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
  // Gaps between catches (ms): a run of quick catches, a walk, another run, then the next morning.
  const gapFor = (i) => (i === 20 ? 6 * 60_000 : i === 35 ? 16 * 3600_000 : i % 7 === 0 ? 150_000 : 25_000);
  const catchesAt = [];
  for (let i = 1; i <= catches; i++) {
    // wow-map burstVariant: the first catch of the session is the full show, every later one the short
    // show; every 10th drops the gold beam, every 25th is the grand burst (the beam too).
    const repeat = i > 1;
    const beam = i % 10 === 0 || i % 25 === 0;
    const r = await wowMapCatch(e, { repeat, beam, coins: 10, isNew: i % 3 !== 0, pressEcho: true });
    catchesAt.push({ t0: r.t0, clock0: r.clock0, repeat, beam, plan: plan(repeat), lands: r.lands });
    // The coins tick into the wallet elsewhere too (CurrencyFlyProvider: catch.count per landing coin, 110 ms apart).
    for (let c = 0; c < 5; c++) { await advance(110); e.Moments.playMoment('catch.count'); }
    await advance(1000);
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
  const perCatch = catchesAt.map((c, i) => {
    const { t0, clock0, plan: p } = c;
    const t1 = catchesAt[i + 1]?.t0 ?? Infinity;
    const inside = (x) => x.t >= t0 && x.t < t1;
    const rel = (x) => x.t - clock0;
    const run = marks.find((m) => inside(m) && m.name === 'catch-run');
    const burst = run ? run.detail.split('-> ')[1] : null;
    const burstSound = sounds.find((s) => inside(s) && burst && s.name.startsWith(`moment:${burst}:primary`));
    const burstHaptic = haptics.find((h) => inside(h) && h.t >= clock0 + p.hitStopAt - 5 && h.intent === 'comboHeavy');
    const wobbleSounds = sounds.filter((s) => inside(s) && s.name.startsWith('moment:catch.wobble:'));
    const wobbleHaptics = haptics.filter((h) => h.t > clock0 + 100 && h.t < clock0 + p.hitStopAt);
    const land = sounds.find((s) => inside(s) && s.name.startsWith('moment:catch.land:'));
    const counter = sounds.filter((s) => inside(s) && s.name.startsWith('moment:ui.counterTick:'));
    const end = Math.max(...sounds.filter((s) => inside(s) && s.name.startsWith(`moment:${burst}:`)).map((s) => s.t)) - (burstSound?.t ?? 0);
    return {
      n: i + 1, burst, repeat: c.repeat, beam: c.beam,
      lucky: sounds.some((s) => inside(s) && s.name.startsWith('moment:catch.lucky:primary')),
      burstSoundMs: burstSound ? rel(burstSound) : null,
      burstHapticMs: burstHaptic ? rel(burstHaptic) : null,
      wobbleSoundMs: wobbleSounds.map(rel),
      wobbleRungs: wobbleSounds.map((s) => s.name.split('#')[1]),
      heat: Number((marks.find((m) => inside(m) && m.name === 'catch-heat')?.detail ?? '+0').slice(1)),
      counterRungs: counter.map((s) => s.name.split('#')[1]),
      counterMs: counter.map(rel),
      coinLandsMs: c.lands,
      landMs: land ? rel(land) : null,
      tapHaptics: haptics.filter((h) => h.t >= t0 - 5 && h.t < clock0 + 100).length,
      wobbleHapticMs: wobbleHaptics.map(rel),
      wobbleIntents: wobbleHaptics.map((h) => h.intent),
      thumpMs: (() => { const h = haptics.find((x) => inside(x) && x.intent === 'hitRigid'); return h ? rel(h) : -1; })(),
      hot: sounds.some((s) => inside(s) && s.name.startsWith('moment:catch.hot:')),
      sounds: sounds.filter((s) => inside(s) && s.name.startsWith('moment:catch.')).length,
      burstLayersSpanMs: Number.isFinite(end) ? end : 0,
      legacy: sounds.filter((s) => inside(s) && s.t < clock0 + p.doneAt && !s.name.startsWith('moment:')).map((s) => s.name),
    };
  });
  const hits = sounds.filter((s) => s.name.startsWith('moment:game.hit:primary')).map((s) => s.name.split('#')[1]);
  const ladderRuns = catchesAt.map((c, i) => {
    const t1 = catchesAt[i + 1]?.t0 ?? Infinity;
    return sounds.filter((s) => s.t >= c.t0 && s.t < t1 && s.name.startsWith('moment:catch.count:')).map((s) => s.name.split('#')[1]);
  });
  return { perCatch, hits, ladderRuns };
}

async function main() {
  const { e, catchesAt } = await run();
  const a = analyse(e, catchesAt);
  const out = process.argv[2];
  const lines = [
    '50-catch map session, real studio engine on the silent TraceBackend (virtual clock; nothing played).',
    'Per catch (ms on the catch clock): show (full / short, +beam), burst moment, heat | burst haptic and sound (thump = the hot second buzz, +hot = the bright layer) | wobble rungs, sound ms, haptic ms and intents | counter ticks (rung@ms) against coin landings | stamp | legacy sounds',
    ...a.perCatch.map((c) => `#${String(c.n).padStart(2)} ${c.repeat ? 'short' : 'full '}${c.beam ? '+beam' : '     '} ${c.burst.padEnd(17)}${c.lucky ? ' +beam-slam' : ''} heat +${c.heat} | hap ${c.burstHapticMs} snd ${c.burstSoundMs}${c.thumpMs > 0 ? ` thump ${c.thumpMs}` : ''}${c.hot ? ' +hot' : ''} | wobble ${c.wobbleRungs.join(' ')} at ${c.wobbleSoundMs.join(',')} haps ${c.wobbleHapticMs.join(',')} ${c.wobbleIntents.join(',')} | counter ${c.counterRungs.map((r, k) => `${r}@${c.counterMs[k]}`).join(' ')} coins land ${c.coinLandsMs.join(',')} | stamp ${c.landMs} | legacy ${c.legacy.join(',') || 'none'}`),
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
