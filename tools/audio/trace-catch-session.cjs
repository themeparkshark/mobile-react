#!/usr/bin/env node
'use strict';
/**
 * A 50-catch map session through the real studio engine on the silent
 * TraceBackend (wow-sound lane, Oct 24 2026). Each catch replays the map
 * catch's own calls in order (HomeCatchMoment on claude/p23-wow-sound: wow-map wave 4 b2704154 plus the
 * wave 5 beat fixes; the tap on the JS thread, then every beat of the UI-thread catch clock, each told when
 * it was due, through tools/audio/wowmap-catch-beats.cjs) on a virtual clock, then the log
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
const { wowMapCatch } = require('./wowmap-catch-beats.cjs');

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
  // Gaps between catches (ms): quick runs (25 s apart) broken by walks that cool the heat (2.5 or 6 minutes) and one
  // night. Wave 5: the milestones land both cold and hot: the 10th at heat 5, the 20th and 30th at heat 0, the 40th
  // at the cap, the grand 25th at heat 5 and the grand 50th at heat 0.
  const gapFor = (i) => (i === 44 ? 16 * 3600_000 : i === 19 ? 6 * 60_000 : i === 4 || i === 29 || i === 49 ? 150_000 : 25_000);
  const catchesAt = [];
  for (let i = 1; i <= catches; i++) {
    // wow-map burstVariant (wave 4): the first catch is the full show, later ones the snappy repeat, every 5th the
    // treat (its burst held 280 ms), every 10th the beam and every 25th the grand burst (both play the full show).
    // A slow park connection on every third catch: the answer comes 800 ms after the tap, so the clock holds on the
    // held frame (the beam still lands there).
    const r = await wowMapCatch(e, { n: i, coins: 10, isNew: i % 3 !== 0, pressEcho: true, serverMs: i % 3 === 0 ? 800 : 120 });
    catchesAt.push({ t0: r.t0, clock0: r.clock0, hold: r.hold, repeat: r.repeat, beam: r.beam, grand: r.grand, treat: r.treat, plan: r.plan, lands: r.lands });
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
    const { t0, clock0, plan: p, hold } = c;
    // Beats after the held frame move by the server hold (the clock waits on the held frame).
    const at = (ms) => ms + (ms > p.hitStopAt ? hold : 0);
    const t1 = catchesAt[i + 1]?.t0 ?? Infinity;
    const inside = (x) => x.t >= t0 && x.t < t1;
    const rel = (x) => x.t - clock0;
    const run = marks.find((m) => inside(m) && m.name === 'catch-run');
    const burst = run ? run.detail.split('-> ')[1] : null;
    const burstSound = sounds.find((s) => inside(s) && burst && s.name.startsWith(`moment:${burst}:primary`));
    const burstHaptic = haptics.find((h) => inside(h) && h.t >= clock0 + p.hitStopAt - 5 && h.intent === 'comboHeavy');
    const catchHaptics = haptics.filter((h) => inside(h) && h.t >= t0 - 5);
    const gaps = catchHaptics.slice(1).map((h, k) => ({ ms: h.t - catchHaptics[k].t, a: catchHaptics[k], b: h }));
    const flyStart = sounds.find((s) => inside(s) && s.name.startsWith('moment:catch.fly:'));
    const burstLayer = sounds.filter((s) => inside(s) && burst && s.name.startsWith(`moment:${burst}:`) && /layer/.test(s.name)).map((s) => s.name.split(':')[2].split('#')[0]);
    const wobbleSounds = sounds.filter((s) => inside(s) && s.name.startsWith('moment:catch.wobble:'));
    const wobbleHaptics = haptics.filter((h) => h.t > clock0 + 100 && h.t < clock0 + p.hitStopAt && h.intent !== 'hitRigid'); // the beam's slam (w5r2) is not a wobble
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
      // The hot thump is the rigid buzz after the burst's heavy; a rigid before it is the beam's slam (w5r2).
      thumpMs: (() => { const h = haptics.find((x) => inside(x) && x.intent === 'hitRigid' && burstHaptic && x.t > burstHaptic.t); return h ? rel(h) : -1; })(),
      slamMs: (() => { const h = haptics.find((x) => inside(x) && x.intent === 'hitRigid' && (!burstHaptic || x.t < burstHaptic.t)); return h ? rel(h) : -1; })(),
      hot: sounds.some((s) => inside(s) && s.name.startsWith('moment:catch.hot:')),
      sounds: sounds.filter((s) => inside(s) && s.name.startsWith('moment:catch.')).length,
      // The same without the burst's voicing tails (wave 5), so layer counts compare like for like.
      coreSounds: sounds.filter((s) => inside(s) && s.name.startsWith('moment:catch.') && !/:v\d+layer/.test(s.name)).length,
      burstLayersSpanMs: Number.isFinite(end) ? end : 0,
      legacy: sounds.filter((s) => inside(s) && s.t < clock0 + p.doneAt && !s.name.startsWith('moment:')).map((s) => s.name),
      // Wave 4: the burst's voicing (semitones) and anything of the map catch that starts after the settle ('done';
      // the wallet's own catch.count ticks this tool adds after each catch are not the map catch's).
      burstPitch: burstSound ? Number((/pitch (-?[\d.]+)/.exec(burstSound.detail ?? '') ?? [0, 0])[1]) : null,
      afterDone: (() => {
        const done = marks.find((m) => inside(m) && m.name === 'catch done');
        if (!done) return [];
        // Wave 5: the merged final counter tick is on the done frame itself (only the 20 ms output latency after it).
        return [...sounds.filter((s) => inside(s) && s.t > done.t + 25 && s.t < done.t + 1500 && s.name.startsWith('moment:') && !s.name.startsWith('moment:catch.count:'))
          .map((s) => `${s.name}@${rel(s)}`),
          ...haptics.filter((h) => inside(h) && h.t > done.t + 5 && h.t < done.t + 1500).map((h) => `${h.intent}@${rel(h)}`)];
      })(),
      doneMs: (() => { const d = marks.find((m) => inside(m) && m.name === 'catch done'); return d ? rel(d) : null; })(),
      // Wave 5: every buzz of the catch in order, the closest two (a flam is under 90 ms), the first heavy, the
      // success, the grand's second heavy, the burst's tail (voicing layers) and the bell-to-slide gap.
      hold,
      grand: c.grand, treat: c.treat,
      buzzes: catchHaptics.map((h) => `${h.intent}@${rel(h)}`),
      minGapMs: gaps.length ? Math.min(...gaps.map((g) => g.ms)) : null,
      flams: gaps.filter((g) => g.ms < 90).map((g) => `${g.a.intent}@${rel(g.a)}+${g.b.intent}@${rel(g.b)}`),
      successMs: (() => { const h = catchHaptics.find((x) => x.intent === 'success' && x.t > clock0 + p.hitStopAt); return h ? rel(h) : null; })(),
      heavies: catchHaptics.filter((x) => x.intent === 'comboHeavy').map(rel),
      burstPlanMs: at(p.burstAt),
      // The progress bar's gold tick (a NEW find), heard 20 ms after its beat.
      barMs: at(p.tickAt) + 20,
      tail: burstLayer.join('+') || 'none',
      flyGapMs: flyStart && burstSound ? flyStart.t - burstSound.t : null,
      lastSoundVsDoneMs: (() => {
        const d = marks.find((m) => inside(m) && m.name === 'catch done');
        const mine = sounds.filter((s) => inside(s) && s.name.startsWith('moment:') && !s.name.startsWith('moment:catch.count:') && s.t < (d?.t ?? 0) + 1500);
        return d && mine.length ? Math.max(...mine.map((s) => s.t)) - d.t : null;
      })(),
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
    'Per catch (ms on the catch clock, from when the find starts moving): show (full / short, +beam, +grand, +treat), burst moment, heat, server hold | every buzz in order and the closest two | the burst tail (voicing layers) | bell to slide | last sound against the done frame | burst haptic and sound (thump = the hot second buzz, +hot = the bright layer) | wobble rungs, sound ms, haptic ms and intents | counter ticks (rung@ms) against coin landings | stamp | legacy sounds',
    ...a.perCatch.map((c) => `#${String(c.n).padStart(2)} ${c.repeat ? 'short' : 'full '}${c.grand ? '+grand' : c.beam ? '+beam ' : c.treat ? '+treat' : '      '} ${c.burst.padEnd(17)}${c.lucky ? ' +beam-slam' : ''} heat +${c.heat} hold ${c.hold} | buzzes ${c.buzzes.join(' ')} (closest ${c.minGapMs} ms${c.flams.length ? `, FLAM ${c.flams.join(' ')}` : ''}) | tail ${c.tail} | bell to slide ${c.flyGapMs} ms | last sound vs done ${c.lastSoundVsDoneMs} ms | ${c.slamMs > 0 ? `slam ${c.slamMs} ` : ''}hap ${c.burstHapticMs} snd ${c.burstSoundMs}${c.thumpMs > 0 ? ` thump ${c.thumpMs}` : ''}${c.hot ? ' +hot' : ''} | wobble ${c.wobbleRungs.join(' ')} at ${c.wobbleSoundMs.join(',')} haps ${c.wobbleHapticMs.join(',')} ${c.wobbleIntents.join(',')} | counter ${c.counterRungs.map((r, k) => `${r}@${c.counterMs[k]}`).join(' ')} coins land ${c.coinLandsMs.join(',')} | stamp ${c.landMs} | burst pitch ${c.burstPitch >= 0 ? '+' : ''}${c.burstPitch} | done ${c.doneMs}, after it ${c.afterDone.join(',') || 'nothing'} | legacy ${c.legacy.join(',') || 'none'}`),
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
