#!/usr/bin/env node
/**
 * approve-moments.mjs: turn Dustin's "yes" on the listening pack into approved
 * studio cues. Run it ONLY after he approves by ear (wow-sound listening pack:
 * polish-2026-10-23/wow/wow-sound/listen/index.json).
 *
 *   node tools/audio/approve-moments.mjs --all                    # every moment's primary
 *   node tools/audio/approve-moments.mjs catch.burst catch.count  # just these
 *   node tools/audio/approve-moments.mjs --variant game.win       # he picked "try another"
 *   add --dry to print without writing; --src <studio audio dir> (default STUDIO_AUDIO_DIR
 *   or /Users/dustinsparage/apps/tps-mg/audio)
 *
 * Writes <src>/APPROVED.json ({"approved": ["shared/sh_ding", ...]}), the list
 * sync-studio-audio.mjs reads. Then:
 *   1. node tools/audio/sync-studio-audio.mjs --src <src>   (cues move into studio.generated.ts)
 *   2. flip STUDIO_SOUND_DEFAULT in src/gamekit/audio/studioSwitch.ts
 *   3. turn on the `studio_sound` server flag
 * A --variant pick also needs the moment's primary and variant swapped in
 * momentMap.ts (the script prints which).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildMoments } = require('./dump-moments.cjs');

const args = process.argv.slice(2);
const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const SRC = path.resolve(val('--src') || process.env.STUDIO_AUDIO_DIR || '/Users/dustinsparage/apps/tps-mg/audio');
const DRY = args.includes('--dry');
const variants = new Set(args.filter((a, i) => args[i - 1] === '--variant'));
const named = args.filter((a, i) => !a.startsWith('--') && !['--src', '--variant'].includes(args[i - 1]));

const { moments } = buildMoments();
const pick = args.includes('--all') ? Object.keys(moments) : [...named, ...variants];
if (!pick.length) {
  console.error('Name moments, or pass --all. Nothing written.');
  process.exit(1);
}
const ids = new Set();
const swaps = [];
for (const name of pick) {
  const m = moments[name];
  if (!m) { console.error(`unknown moment ${name}`); process.exit(1); }
  const refs = [variants.has(name) ? m.variant : m.primary, ...(m.layers || []).map((l) => l.ref), ...(m.rr || [])];
  if (variants.has(name)) swaps.push(name);
  for (const ref of refs) if (!ref.startsWith('chris:')) ids.add(ref);
}
const file = path.join(SRC, 'APPROVED.json');
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { approved: [] };
const next = { ...prev, approved: Array.from(new Set([...(prev.approved || []), ...ids])).sort() };
console.log(`${ids.size} studio cue(s) for ${pick.length} moment(s) -> ${file}${DRY ? ' (dry run)' : ''}`);
for (const id of [...ids].sort()) console.log(`  ${id}`);
if (swaps.length) console.log(`Swap primary and variant in src/gamekit/audio/momentMap.ts for: ${swaps.join(', ')}`);
if (!DRY) fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
