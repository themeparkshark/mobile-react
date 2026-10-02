const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { otaAssetPatterns } = require('../publish-update.cjs');

const base = { production: { commit: 'abc123' } };
const git = (files, untracked = '') => (args) => (args[0] === 'diff' ? files : untracked);

test('a store OTA only re-sends media changed since the binary was built', () => {
  const patterns = otaAssetPatterns('production', git('assets/a.png\nsrc/x.ts\nassets/b.wav\n', 'assets/new.mp3\n'), base);
  assert.deepEqual(patterns, ['assets/a.png', 'assets/b.wav', 'assets/new.mp3']);
});

test('no changed media sends no assets instead of all of them', () => {
  assert.deepEqual(otaAssetPatterns('production', git('src/x.ts\ntools/ota-base.json\n'), base), ['__no_changed_media__']);
});

test('a channel with no recorded binary keeps bundling everything', () => {
  assert.equal(otaAssetPatterns('internal-tunnel', git(''), base), null);
});

test('the asset filter is set only for the export, never for the fingerprinted config', () => {
  const script = fs.readFileSync(path.join(__dirname, '../publish-update.cjs'), 'utf8');
  assert.match(script, /env: exportEnv \}/);
  assert.match(script, /'eas', \[[\s\S]*?\], \{ cwd: root, encoding: 'utf8', stdio: \['ignore', 'pipe', 'inherit'\], env \}/);
  const config = fs.readFileSync(path.join(__dirname, '../../app.config.js'), 'utf8');
  assert.match(config, /process\.env\.TPS_OTA_ASSET_PATTERNS\s*\? \{ assetPatternsToBeBundled/);
});
