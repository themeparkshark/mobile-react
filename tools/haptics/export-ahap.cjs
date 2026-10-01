#!/usr/bin/env node
'use strict';
/**
 * Export the studio Core Haptics library (src/gamekit/core/hapticPattern.ts
 * AHAP_LIBRARY) as Apple .ahap JSON files for WS9's native player.
 *
 *   node tools/haptics/export-ahap.cjs            # writes assets/haptics/<name>.ahap
 *   node tools/haptics/export-ahap.cjs --check    # exits 1 when files are stale
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'assets/haptics');
const lib = loadTs('src/gamekit/core/hapticPattern.ts');
const check = process.argv.includes('--check');
let stale = 0;
fs.mkdirSync(outDir, { recursive: true });
for (const name of Object.keys(lib.AHAP_LIBRARY).sort()) {
  const json = JSON.stringify(lib.toAhap(lib.AHAP_LIBRARY[name], name), null, 2) + '\n';
  const file = path.join(outDir, `${name}.ahap`);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (prev === json) continue;
  stale += 1;
  if (!check) fs.writeFileSync(file, json);
}
console.log(check ? `${stale} stale AHAP file(s)` : `wrote ${stale} AHAP file(s) to ${path.relative(root, outDir)}`);
if (check && stale) process.exit(1);
