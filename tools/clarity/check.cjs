#!/usr/bin/env node
/**
 * Prints clarity problems for player copy under the given paths.
 *
 *   node tools/clarity/check.cjs src/screens/LinePlay src/services/lineplay [--soft]
 *
 * Hard problems (jargon, glossary, pressure, em dash) fail the clarity test.
 * --soft also lists readability flags (grade level, long sentences, long words).
 */
const fs = require('fs');
const path = require('path');
const { extractFile, isDevFile } = require('./extract.cjs');
const rules = require('./rules.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const soft = args.includes('--soft');
const loose = args.includes('--loose');
const targets = args.filter(a => !a.startsWith('--'));

function walk(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  else if (/\.(tsx?|json)$/.test(p)) out.push(p);
  return out;
}

let hard = 0;
for (const t of targets.length ? targets : ['src']) {
  for (const file of walk(path.resolve(ROOT, t))) {
    const rel = path.relative(ROOT, file);
    if (isDevFile(rel)) continue;
    for (const row of extractFile(file, rel, loose)) {
      const s = rules.score(row.text);
      const h = rules.hardViolations(row.text);
      hard += h.length ? 1 : 0;
      const show = soft ? s.flags : h;
      if (show.length) console.log(`${rel}:${row.line} [${show.join(',')}] ${row.text}`);
    }
  }
}
console.error(`${hard} line(s) with hard problems`);
process.exitCode = hard ? 1 : 0;
