#!/usr/bin/env node
/**
 * Builds the bundled HTML minigames (src/assets/minigames/<game>/<game>.html)
 * from their sources here (tools/minigames/<game>.src.html): the game's
 * module script and three.js (pinned 0.160.0) are bundled and minified into
 * one inline <script type="module">, so a game makes no network request and
 * plays offline (Apple Kids category, 1.3). The output is a plain asset: OTA-safe.
 *
 *   npm install --prefix /tmp/mg three@0.160.0 esbuild@0.24.0
 *   MINIGAME_DEPS=/tmp/mg/node_modules node tools/minigames/build.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const deps = process.env.MINIGAME_DEPS;
if (!deps) { console.error('Set MINIGAME_DEPS to a node_modules with three@0.160.0 and esbuild.'); process.exit(1); }
const esbuild = require(path.join(deps, 'esbuild'));
const threeVersion = require(path.join(deps, 'three', 'package.json')).version;
if (threeVersion !== '0.160.0') { console.error(`three ${threeVersion}: the games are written for 0.160.0`); process.exit(1); }

const root = path.join(__dirname, '..', '..');
for (const game of ['sharky', 'banana-basket']) {
  const src = fs.readFileSync(path.join(__dirname, `${game}.src.html`), 'utf8');
  const map = /<script type="importmap">[\s\S]*?<\/script>\n?/;
  const mod = /<script type="module">\n([\s\S]*?)<\/script>/;
  const code = mod.exec(src)[1];
  const out = esbuild.buildSync({
    stdin: { contents: code, resolveDir: path.join(deps), loader: 'js' },
    bundle: true, format: 'esm', minify: true, target: 'es2020', write: false, legalComments: 'none',
    nodePaths: [deps],
  }).outputFiles[0].text;
  // Keep three's MIT notice with the bundle.
  const html = src.replace(map, '').replace(mod, () =>
    `<script type="module">\n/* three.js ${threeVersion} (MIT, Copyright 2010-2023 Three.js Authors), bundled locally: no network. */\n${out.replace(/<\/script/gi, '<\\/script')}</script>`);
  const file = path.join(root, 'src/assets/minigames', game, `${game}.html`);
  fs.writeFileSync(file, html);
  console.log(`${game}.html: ${(html.length / 1024).toFixed(0)} KB`);
}
