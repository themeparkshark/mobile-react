#!/usr/bin/env node
'use strict';
/**
 * Print the moment map (src/gamekit/audio/momentMap.ts) as JSON, with every
 * ref resolved to its file on disk. Used by the listening-pack builder and the
 * approval helper. Plays nothing.
 *
 *   node tools/audio/dump-moments.cjs > moments.json
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const map = loadTs('src/gamekit/audio/momentMap.ts');

/** studio.dev.generated.ts + studio.generated.ts -> { 'game/id': { src, variants, ladder } } (repo-relative files). */
function studioIndex() {
  const out = {};
  for (const file of ['studio.dev.generated.ts', 'studio.generated.ts']) {
    const text = fs.readFileSync(path.join(root, 'src/assets/games/audio', file), 'utf8');
    const cuePart = text.split('export const STUDIO_BEDS')[0];
    let game = null;
    for (const line of cuePart.split('\n')) {
      const g = /^ {2}'([\w-]+)': \{\s*$/.exec(line);
      if (g) { game = g[1]; continue; }
      const c = /^ {4}'([\w.-]+)': \{(.*)\},?\s*$/.exec(line);
      if (!c || !game) continue;
      const body = c[2];
      const req = (s) => (s ? [...s.matchAll(/require\('\.\/([^']+)'\)/g)].map((x) => 'src/assets/games/audio/' + x[1]) : []);
      const src = /src: require\('\.\/([^']+)'\)/.exec(body);
      const variants = /variants: \[([^\]]*)\]/.exec(body);
      const ladder = /ladder: \[([^\]]*)\]/.exec(body);
      out[`${game}/${c[1]}`] = {
        src: src ? 'src/assets/games/audio/' + src[1] : null,
        variants: req(variants && variants[1]),
        ladder: req(ladder && ladder[1]),
        approved: /approved: true/.test(body),
      };
    }
  }
  return out;
}

/** chrisBank.ts S table -> cue name -> file. */
function chrisIndex() {
  const text = fs.readFileSync(path.join(root, 'src/gamekit/audio/chrisBank.ts'), 'utf8');
  const s = {};
  for (const m of text.matchAll(/^ {2}(\w+): require\('\.\.\/\.\.\/\.\.\/([^']+)'\)/gm)) s[m[1]] = m[2];
  const cues = {};
  for (const m of text.matchAll(/^ {2}'([\w.]+)': \{ src: S\.(\w+)(.*)\},?$/gm)) {
    const st = /startMs: (\d+)/.exec(m[3]);
    const en = /endMs: (\d+)/.exec(m[3]);
    const gain = /gainDb: (-?[\d.]+)/.exec(m[3]);
    cues[m[1]] = { file: s[m[2]], startMs: st ? +st[1] : 0, endMs: en ? +en[1] : null, gainDb: gain ? +gain[1] : 0 };
  }
  return cues;
}

function buildMoments() {
const studio = studioIndex();
const chris = chrisIndex();
function resolve(ref, step, useLadder = false) {
  if (ref.startsWith('chris:')) {
    const c = chris[ref.slice(6)];
    return c ? { ref, kind: 'chris', file: c.file, startMs: c.startMs, endMs: c.endMs, gainDb: c.gainDb } : { ref, missing: true };
  }
  const e = studio[ref];
  if (!e) return { ref, missing: true };
  const file = e.ladder.length && (useLadder || !e.src) ? e.ladder[Math.max(0, Math.min(e.ladder.length - 1, step ?? 0))] : e.src;
  return { ref, kind: 'studio', file, ladder: e.ladder, rungs: e.ladder.length, approved: e.approved, exists: !!file && fs.existsSync(path.join(root, file)) };
}

const moments = {};
for (const [name, d] of Object.entries(map.MOMENTS)) {
  moments[name] = {
    ...d,
    resolved: {
      primary: resolve(d.primary, d.ladderFrom, !!d.ladder),
      variant: resolve(d.variant, 0, !!d.ladder),
      fallback: chris[d.fallback] ? { cue: d.fallback, ...chris[d.fallback] } : { cue: d.fallback, missing: true },
      layers: (d.layers || []).map((l) => ({ ...l, ...resolve(l.ref, l.step, l.step !== undefined) })),
      rr: (d.rr || []).map((r) => resolve(r)),
    },
  };
}
return { moments, legacy: map.LEGACY_SFX_TO_MOMENT, beds: map.BED_LAYERS, classLufs: map.CLASS_LUFS, studio, chris };
}

module.exports = { buildMoments, studioIndex, chrisIndex };
if (require.main === module) {
  const { studio, chris, ...out } = buildMoments();
  process.stdout.write(JSON.stringify(out, null, 1));
}
