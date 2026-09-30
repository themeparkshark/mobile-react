#!/usr/bin/env node
// Publish an OTA update to a store channel and upload its Hermes source map,
// so crash stacks from the update are readable in Sentry.
//
//   node tools/publish-update.cjs <testflight|production> "<message>"
//
// Runs the same API target gate as store builds first.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { main: uploadSourcemaps } = require('./upload-sourcemaps.cjs');

const root = path.resolve(__dirname, '..');
const CHANNELS = new Set(['testflight', 'production']);

async function run() {
  const [channel, message] = process.argv.slice(2);
  if (!CHANNELS.has(channel) || !message) {
    throw new Error('usage: publish-update.cjs <testflight|production> "<message>"');
  }
  execFileSync(process.execPath, [path.join(__dirname, 'check-api-target.cjs'), channel], { cwd: root, stdio: 'inherit' });
  const out = execFileSync('eas', [
    'update', '--channel', channel, '--platform', 'ios', '--message', message,
    '--source-maps', 'true', '--json', '--non-interactive',
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, EAS_BUILD_PROFILE: channel } });
  const jsonPath = path.join(root, 'dist', 'eas-update.json');
  fs.writeFileSync(jsonPath, out);
  const result = await uploadSourcemaps(['update', jsonPath, path.join(root, 'dist')]);
  console.log(result && result.skipped ? `[sourcemaps] skipped: ${result.skipped}` : `[sourcemaps] uploaded: ${JSON.stringify(result)}`);
}

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
