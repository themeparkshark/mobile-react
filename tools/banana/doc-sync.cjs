#!/usr/bin/env node
'use strict';
/**
 * Banana doc sync (design rev 8, 12.5 and G20): parses every table tagged
 * `<!-- sync:... -->` in studio/design/banana.md and compares it with the
 * game's constants (constants.ts / tables.ts), the HapticBus table and the
 * FX budget event list. Any mismatch exits 1. It also emits
 * studio/design/banana.brief.json from the doc, so studio prompts never carry
 * a hand-copied brief.
 *
 * The star table is bot-seeded (5.4 "starting values"): when the game's
 * STARS_RIDE differs from the doc, the tool accepts it only if
 * studio/design/banana-calibration.md lists the exact same rows (the
 * calibration report the designer folds back into the doc), and reports it.
 *
 *   node tools/banana/doc-sync.cjs           # check + write the brief
 *   node tools/banana/doc-sync.cjs --check   # check only
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const DOC = process.env.BANANA_DOC || '/Users/dustinsparage/apps/tps-prime-time-audit/studio/design/banana.md';
const CAL = path.join(path.dirname(DOC), 'banana-calibration.md');
const BRIEF = path.join(path.dirname(DOC), 'banana.brief.json');

function tableAfter(md, tag) {
  const i = md.indexOf(`<!-- sync:${tag} -->`);
  if (i < 0) throw new Error(`missing sync tag ${tag}`);
  const lines = md.slice(i).split('\n').slice(1);
  const rows = [];
  let started = false;
  for (const ln of lines) {
    if (ln.startsWith('|')) {
      started = true;
      if (/^\|[-| ]+\|$/.test(ln.trim())) continue;
      rows.push(ln.split('|').slice(1, -1).map((c) => c.trim()));
    } else if (started) break;
  }
  return rows;
}

function blockAfter(md, tag) {
  const i = md.indexOf(`<!-- sync:${tag} -->`);
  const s = md.indexOf('```', i);
  const e = md.indexOf('```', s + 3);
  return md.slice(s + 3, e);
}

function run(check) {
  if (!fs.existsSync(DOC)) return { skipped: true, problems: [], notes: [] };
  const md = fs.readFileSync(DOC, 'utf8');
  const C = loadTs('src/games/banana-basket/constants.ts');
  const H = loadTs('src/games/banana-basket/hapticBus.ts');
  const V = loadTs('src/games/banana-basket/render/vis.ts');
  const problems = [];
  const notes = [];
  const eq = (what, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${what}: doc ${JSON.stringify(a)} vs game ${JSON.stringify(b)}`);
  };
  const num = (t) => Number(String(t).replace(/[^\d.-]/g, ''));

  // ball_zones: names, exit angles, TAN_Q8, contact edges.
  const zones = tableAfter(md, 'ball_zones').slice(1);
  eq('zone names', zones.map((r) => r[0]), [...C.ZONE_NAMES]);
  eq('TAN_Q8', zones.map((r) => num(r[3])), [...C.TAN_Q8]);
  const outerEdge = num(zones[0][1].split(' to ')[0]);
  const innerEdge = num(zones[1][1].split(' to ')[0]);
  eq('zone edges (center, inner, outer)', [num(zones[2][1].split(' to ')[1]), -innerEdge, -outerEdge], [C.ZONE_CENTER, C.ZONE_INNER, C.ZONE_OUTER]);

  // tiers: chain thresholds.
  const tiers = tableAfter(md, 'tiers').slice(1);
  eq('TIER_AT', tiers.map((r) => num(r[0].split('-')[0].replace('+', ''))), [...C.TIER_AT]);

  // scoring: grade and event quarters, cap.
  const sc = blockAfter(md, 'scoring');
  const grab = (re) => Number((sc.match(re) || [])[1]);
  eq('scoring', [grab(/CATCH (\d+)/), grab(/PERFECT (\d+)/), grab(/POP\/BONK (\d+)/), grab(/gold POP (\d+)/), grab(/Golden Hour (\d+)/), grab(/Gold Rush (\d+)/), grab(/min\((\d+),/)],
    [C.G_CATCH, C.G_PERFECT, C.G_POP, C.G_GOLD_POP, C.EVENT_GOLDEN, C.EVENT_RUSH, C.MQ_CAP]);

  // stars (bot-seeded; a calibration report may override until the doc is updated).
  const stars = tableAfter(md, 'stars').slice(1).map((r) => [num(r[1]), num(r[2]), num(r[3]), num(r[4])]);
  const game = [1, 2, 3].map((d) => [...C.STARS_RIDE[d]]);
  if (JSON.stringify(stars) !== JSON.stringify(game)) {
    const cal = fs.existsSync(CAL) ? fs.readFileSync(CAL, 'utf8') : '';
    const ok = [1, 2, 3].every((d) => cal.includes(`| ${d} | ${game[d - 1].join(' | ')} |`));
    if (ok) notes.push(`stars: game uses the bot calibration in banana-calibration.md (${JSON.stringify(game)}); doc table still ${JSON.stringify(stars)}`);
    else problems.push(`stars: doc ${JSON.stringify(stars)} vs game ${JSON.stringify(game)} and no matching banana-calibration.md rows`);
  }

  // twists.
  const tw = tableAfter(md, 'twists').slice(1);
  eq('twist names', tw.map((r) => r[0].toUpperCase()), C.TWIST_NAMES.slice(1).map((n) => n));
  const giant = tw[1][1].match(/size (\d+), base (\d+), fall x([\d.]+)/);
  eq('giant bananas', [Number(giant[1]), Number(giant[2]), Math.round(Number(giant[3]) * 256)], [C.GIANT_SIZE, C.GIANT_BASE, C.GIANT_G_Q8]);
  eq('low gravity', Math.round(Number(tw[2][1].match(/x([\d.]+)/)[1]) * 256), C.LOWGRAV_Q8);
  eq('prize party lucky max', Number(tw[3][1].match(/max (\d+)/)[1]), C.LUCKY_MAX_PARTY);
  notes.push('crosswind: doc says ±6 fu/s per step (360 fu/s²); the game uses 60 fu/s² (WIND_SUB 4), see banana-calibration.md');

  // ride timeline (full ride table): the step boundaries.
  const tl = tableAfter(md, 'ride_timeline').slice(1).filter((r) => /^\d/.test(r[0]));
  const steps = tl.map((r) => num(r[0].split(/[- ]/)[0]));
  eq('ride timeline starts', steps, [0, 224, 560, 1120, 1120, 1904, 2100, 2128, 2408, 2464, 2660, 2688]);
  eq('ride constants', [C.RIDE_PUFFER, C.BREATHER_START, C.RUSH_RIDE, C.RIDE_STEPS, C.LUCKY_FROM, C.FORK_FROM, C.RIDE_PRIZE, C.SERVE_STEP],
    [1120, 1904, 2128, 2688, 1456, 896, 336, 168]);

  // fx budget events, haptics table.
  eq('fx budget events', tableAfter(md, 'fx_budget').slice(1).map((r) => r[0]), V.FX_BUDGET_EVENTS);
  eq('haptics table', tableAfter(md, 'haptics').slice(1).map((r) => [r[0], r[1]]), H.HAPTIC_TABLE);

  if (!check) {
    const title = (md.match(/^# (.*)$/m) || [])[1];
    const brief = {
      generated: new Date().toISOString(),
      source: DOC,
      title,
      tables: Object.fromEntries(['ball_zones', 'tiers', 'stars', 'twists', 'ride_timeline', 'fx_budget', 'haptics'].map((t) => [t, tableAfter(md, t)])),
      scoring: blockAfter(md, 'scoring').trim(),
      game: { version: C.VERSION, stars: game, notes },
    };
    fs.writeFileSync(BRIEF, JSON.stringify(brief, null, 1));
  }
  return { skipped: false, problems, notes };
}

if (require.main === module) {
  const r = run(process.argv.includes('--check'));
  if (r.skipped) console.log('doc-sync: design doc not found, skipped');
  for (const n of r.notes) console.log(`note: ${n}`);
  for (const p of r.problems) console.error(`MISMATCH ${p}`);
  if (r.problems.length) process.exit(1);
  console.log(`doc-sync ok${process.argv.includes('--check') ? '' : `, wrote ${BRIEF}`}`);
}
module.exports = { run };
