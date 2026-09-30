#!/usr/bin/env node
/**
 * sync-studio-audio.mjs: bring the ART + AUDIO lead's mastered library into
 * the app as engine cues.
 *
 *   node tools/audio/sync-studio-audio.mjs [--src ../audio] [--dry]
 *
 * Source: <src>/<game>/ (default /Users/dustinsparage/apps/tps-mg/audio).
 * For each game folder (and shared/), cues come from <game>/manifest.json
 * when present (schema in src/gamekit/ENGINE.md, "Studio audio manifest"),
 * otherwise they are inferred from file names:
 *   - every file is a cue named by its stem (wh_bonk, sh_impact, chris_coin)
 *   - numbered or pitched siblings form a pitch ladder on the base cue:
 *       wh_bonk_00..07, bb_note_00..15, tv_correct_p2/_p4, lp_spawn_C5/E5/G5
 *   - boss lane files tell_<boss>_<note>_<L|C|R> form a 9-file ladder
 *     ordered note-major (C5 L,C,R, E5 L,C,R, G5 L,C,R)
 *   - .wav is preferred over .m4a when both exist (buffer players, no AAC
 *     priming delay); music/ subfolders become music beds
 * Durations come from <src>/_metrics/<game>.json when available.
 *
 * Approval: nothing ships without Dustin's ear. A cue is approved only when
 * the manifest says "approved": true or it is listed in <src>/APPROVED.json
 * ({"approved": ["wh_bonk", ...]}). Unapproved cues play in __DEV__ builds
 * only; production falls back to Chris's sounds (see audio/studioLibrary.ts).
 *
 * Output: src/assets/games/audio/<game>/* (copied) and
 *         src/assets/games/audio/studio.generated.ts (static requires).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SRC = path.resolve(root, argVal('--src', process.env.STUDIO_AUDIO_DIR || '../audio'));
const DRY = args.includes('--dry');
const OUT_DIR = path.join(root, 'src/assets/games/audio');
const OUT_TS = path.join(OUT_DIR, 'studio.generated.ts');
const AUDIO_EXT = ['.wav', '.m4a', '.mp3', '.caf'];
// Games whose designs ask for 16-bit WAV one-shots (same-frame haptics, no
// AAC priming delay). Everyone else ships the smaller .m4a.
const WAV_GAMES = new Set((process.env.STUDIO_WAV_GAMES || 'memory,banana').split(',').map((s) => s.trim()));
let preferWav = false;
const SKIP = new Set(['tools', 'node_modules']);

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(note) {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) return null;
  return (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]] + (m[2] ? 1 : 0);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listAudio(dir) {
  if (!fs.existsSync(dir)) return [];
  const byStem = new Map();
  for (const f of fs.readdirSync(dir)) {
    const ext = path.extname(f).toLowerCase();
    if (!AUDIO_EXT.includes(ext)) continue;
    const stem = f.slice(0, -ext.length);
    const prev = byStem.get(stem);
    const rank = (e) => (e === '.wav' ? (preferWav ? 0 : 2) : e === '.m4a' ? 1 : 3);
    if (!prev || rank(ext) < rank(path.extname(prev).toLowerCase())) byStem.set(stem, f);
  }
  return Array.from(byStem.entries()).map(([stem, file]) => ({ stem, file, full: path.join(dir, file) }));
}

/** Split a stem into {base, order} when it is a ladder member. */
function ladderKey(stem) {
  let m = /^(tell_[a-z]+)_([A-G]#?\d)_([LCR])$/.exec(stem);
  if (m) return { base: m[1], order: noteToMidi(m[2]) * 10 + 'LCR'.indexOf(m[3]) };
  m = /^(.*)_p(\d+)$/.exec(stem);
  if (m) return { base: m[1], order: Number(m[2]) };
  m = /^(.*)_([A-G]#?\d)$/.exec(stem);
  if (m && noteToMidi(m[2]) !== null) return { base: m[1], order: noteToMidi(m[2]) };
  m = /^(.*)_(\d{1,2})$/.exec(stem);
  if (m) return { base: m[1], order: Number(m[2]) };
  return null;
}

function metricsFor(game) {
  const data = readJson(path.join(SRC, '_metrics', `${game}.json`)) || {};
  const out = {};
  for (const [id, rec] of Object.entries(data)) {
    if (!rec || !Array.isArray(rec.variants)) continue;
    const pick = rec.variants.find((v) => v.variant === rec.picked) || rec.variants[0];
    if (pick && pick.dur_s) out[id] = { durationMs: Math.round(pick.dur_s * 1000), lufs: pick.lufs };
  }
  return out;
}

const approvedList = new Set((readJson(path.join(SRC, 'APPROVED.json'))?.approved) || []);

const KIND_BUS = { impact: 'sfx', ui: 'ui', tell: 'tell', layer: 'sfx', stinger: 'stinger', music: 'music' };

function inferGame(game, dir) {
  const files = listAudio(dir);
  const metrics = metricsFor(game);
  const cues = {};
  const groups = new Map();
  for (const f of files) {
    const lk = ladderKey(f.stem);
    if (lk) {
      if (!groups.has(lk.base)) groups.set(lk.base, []);
      groups.get(lk.base).push({ ...f, order: lk.order });
    }
    cues[f.stem] = { files: [f], ladder: [] };
  }
  for (const [base, members] of groups) {
    members.sort((a, b) => a.order - b.order);
    if (!cues[base]) cues[base] = { files: [], ladder: [] };
    cues[base].ladder = members;
  }
  const beds = {};
  const musicReport = readJson(path.join(SRC, '_metrics', 'music.json')) || {};
  for (const sub of ['music', 'beds']) {
    for (const f of listAudio(path.join(dir, sub))) {
      const rep = musicReport[`${game}/${sub}/${f.file}`] || {};
      const isLoop = typeof rep.bpm === 'number' || /loop|^mus_|_bed/.test(f.stem);
      if (isLoop) {
        beds[f.stem] = {
          file: f,
          meta: {
            bpm: rep.bpm,
            beatsPerBar: 4,
            offsetMs: Array.isArray(rep.downbeats_s) && rep.downbeats_s.length ? Math.round(rep.downbeats_s[0] * 1000) : undefined,
            loopEndMs: typeof rep.dur_s === 'number' ? Math.round(rep.dur_s * 1000) : undefined,
          },
          sub,
        };
      } else {
        // Stingers and tails cut from Chris's phrases are one-shot cues.
        cues[f.stem] = {
          files: [{ ...f, file: `${sub}/${f.file}` }],
          ladder: [],
          meta: { bus: 'stinger', priority: 3, maxVoices: 1, durationMs: typeof rep.dur_s === 'number' ? Math.round(rep.dur_s * 1000) : undefined },
        };
      }
    }
  }
  for (const raw of listAudio(path.join(dir, 'lanes'))) {
    const f = { ...raw, file: `lanes/${raw.file}` };
    const lk = ladderKey(f.stem);
    cues[f.stem] = { files: [f], ladder: [] };
    if (lk) {
      const key = `${lk.base}_lanes`;
      if (!cues[key]) cues[key] = { files: [], ladder: [] };
      cues[key].ladder.push({ ...f, order: lk.order });
      cues[key].ladder.sort((a, b) => a.order - b.order);
    }
  }
  return { cues, beds, metrics };
}

function fromManifest(game, dir, manifest) {
  const metrics = metricsFor(game);
  const cues = {};
  const entries = Array.isArray(manifest.cues)
    ? manifest.cues.map((c) => [c.id || c.name, c])
    : Object.entries(manifest.cues || {});
  const resolve = (rel) => {
    const full = path.resolve(dir, rel);
    return fs.existsSync(full) ? { stem: path.basename(rel, path.extname(rel)), file: path.basename(rel), full } : null;
  };
  for (const [id, c] of entries) {
    if (!id) continue;
    const main = c.file || c.src || c.path;
    const variants = c.variants || c.files || [];
    const ladder = c.ladder || c.pitches || [];
    cues[id] = {
      files: [main, ...(Array.isArray(variants) ? variants : [])].filter(Boolean).map(resolve).filter(Boolean),
      ladder: (Array.isArray(ladder) ? ladder : []).map(resolve).filter(Boolean),
      meta: c,
    };
  }
  const beds = {};
  const music = manifest.music || manifest.beds || {};
  for (const [id, m] of Array.isArray(music) ? music.map((x) => [x.id || x.name, x]) : Object.entries(music)) {
    const f = resolve(m.file || m.src || m.path || '');
    if (f) beds[id] = { file: f, meta: m };
  }
  return { cues, beds, metrics };
}

function reqPath(game, file) {
  return `./${game}/${file}`;
}

function copy(game, f) {
  const dest = path.join(OUT_DIR, game, f.file);
  if (DRY) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(f.full).mtimeMs) fs.copyFileSync(f.full, dest);
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

const games = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((d) => !d.startsWith('_') && !d.startsWith('.') && !SKIP.has(d) && fs.statSync(path.join(SRC, d)).isDirectory())
  : [];

const cueBlocks = [];
const bedBlocks = [];
const devCueBlocks = [];
const devBedBlocks = [];
let cueCount = 0;
let fileCount = 0;
for (const game of games.sort()) {
  const dir = path.join(SRC, game);
  preferWav = WAV_GAMES.has(game);
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const { cues, beds, metrics } = manifest ? fromManifest(game, dir, manifest) : inferGame(game, dir);
  const lines = [];
  const devLines = [];
  for (const id of Object.keys(cues).sort()) {
    const c = cues[id];
    const meta = c.meta || {};
    if (c.files.length === 0 && c.ladder.length === 0) continue;
    [...c.files, ...c.ladder].forEach((f) => { copy(game, f); fileCount++; });
    const parts = [];
    if (c.files[0]) parts.push(`src: require('${reqPath(game, c.files[0].file)}')`);
    if (c.files.length > 1) parts.push(`variants: [${c.files.slice(1).map((f) => `require('${reqPath(game, f.file)}')`).join(', ')}]`);
    if (c.ladder.length) parts.push(`ladder: [${c.ladder.map((f) => `require('${reqPath(game, f.file)}')`).join(', ')}]`);
    const dur = num(meta.durationMs) ?? (num(meta.dur) ? Math.round(meta.dur * 1000) : undefined) ?? metrics[id]?.durationMs;
    if (dur) parts.push(`durationMs: ${dur}`);
    const gain = num(meta.gainDb) ?? num(meta.gain_db);
    if (gain !== undefined) parts.push(`gainDb: ${gain}`);
    const bus = meta.bus || KIND_BUS[meta.kind] || (/(^|_)tell(_|$)/.test(id) ? 'tell' : undefined);
    if (bus) parts.push(`bus: '${bus}'`);
    for (const k of ['maxVoices', 'cooldownMs', 'priority', 'pitchJitter']) if (num(meta[k]) !== undefined) parts.push(`${k}: ${meta[k]}`);
    const approved = meta.approved === true || approvedList.has(id) || approvedList.has(`${game}/${id}`);
    parts.push(`approved: ${approved}`);
    (approved ? lines : devLines).push(`    '${id}': { ${parts.join(', ')} },`);
    cueCount++;
  }
  if (lines.length) cueBlocks.push(`  '${game}': {\n${lines.join('\n')}\n  },`);
  if (devLines.length) devCueBlocks.push(`  '${game}': {\n${devLines.join('\n')}\n  },`);
  const bl = [];
  const devBl = [];
  for (const id of Object.keys(beds).sort()) {
    const b = beds[id];
    const rel = b.file.file.includes('/') ? b.file.file : `${b.sub || 'music'}/${b.file.file}`;
    copy(game, { ...b.file, file: rel });
    const m = b.meta || {};
    const parts = [`src: require('${reqPath(game, rel)}')`];
    for (const k of ['bpm', 'beatsPerBar', 'offsetMs', 'loopStartMs', 'loopEndMs', 'gainDb']) if (num(m[k]) !== undefined) parts.push(`${k}: ${m[k]}`);
    const ok = m.approved === true || approvedList.has(id);
    parts.push(`approved: ${ok}`);
    (ok ? bl : devBl).push(`    '${id}': { ${parts.join(', ')} },`);
  }
  if (bl.length) bedBlocks.push(`  '${game}': {\n${bl.join('\n')}\n  },`);
  if (devBl.length) devBedBlocks.push(`  '${game}': {\n${devBl.join('\n')}\n  },`);
}

const header = (what) => `/* eslint-disable */
// AUTO-GENERATED by tools/audio/sync-studio-audio.mjs. Do not edit by hand.
// ${what}
// Source: ${path.relative(root, SRC) || '.'} (${games.length} folders, ${cueCount} cues)
import type { BedDef, CueDef } from '../../../gamekit/audio/chrisBank';
`;
const moduleText = (what, cb, bb, extra = '') => `${header(what)}
export const STUDIO_CUES: Record<string, Record<string, CueDef>> = {
${cb.join('\n')}
};

export const STUDIO_BEDS: Record<string, Record<string, BedDef>> = {
${bb.join('\n')}
};
${extra}`;
const ts = moduleText('Approved by Dustin (by ear). These ship.', cueBlocks, bedBlocks,
  `\nexport const STUDIO_AUDIO_SYNCED = ${JSON.stringify({ at: new Date().toISOString().slice(0, 19) + 'Z', games: games.length, cues: cueCount })};\n`);
const devTs = moduleText('Candidates awaiting approval. Required only under __DEV__ (never bundled in release).', devCueBlocks, devBedBlocks);
const OUT_DEV_TS = path.join(OUT_DIR, 'studio.dev.generated.ts');

if (DRY) {
  console.log(ts.slice(0, 4000));
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_TS, ts);
  fs.writeFileSync(OUT_DEV_TS, devTs);
  console.log(`studio audio: ${games.length} folders, ${cueCount} cues, ${fileCount} files -> ${path.relative(root, OUT_TS)}`);
}
