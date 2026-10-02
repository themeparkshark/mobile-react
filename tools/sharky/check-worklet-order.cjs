'use strict';
/**
 * Reanimated turns each 'worklet' function into a factory evaluated where it is
 * defined, so a worklet calling another worklet defined LATER in the same file
 * captures undefined on the UI thread. This check fails on any such forward
 * reference (node does not notice: function declarations hoist there).
 *   node tools/sharky/check-worklet-order.cjs [file ...]
 */
const fs = require('node:fs');
const path = require('node:path');
function check(file) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /(?:export\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  const defs = [];
  let m;
  while ((m = re.exec(src))) defs.push({ name: m[1], at: m.index });
  const bad = [];
  defs.forEach((d, i) => {
    const end = i + 1 < defs.length ? defs[i + 1].at : src.length;
    const body = src.slice(d.at, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (!body.includes("'worklet'")) return;
    defs.forEach((o) => {
      if (o.at <= d.at) return;
      if (new RegExp(`\\b${o.name}\\s*\\(`).test(body.slice(body.indexOf('{')))) bad.push(`${d.name} -> ${o.name}`);
    });
  });
  return bad;
}
module.exports = { check };
if (require.main === module) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : ['src/games/sharky/sim/core.ts'];
  let n = 0;
  for (const f of files) for (const b of check(path.resolve(f))) { console.log(f, b); n++; }
  process.exit(n ? 1 : 0);
}
