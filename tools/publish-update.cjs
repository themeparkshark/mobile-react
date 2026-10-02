#!/usr/bin/env node
// Publish an OTA update to a store channel and upload its Hermes source map,
// so crash stacks from the update are readable in Sentry.
//
//   node tools/publish-update.cjs <testflight|production|internal-tunnel> "<message>"
//
// Runs the same API target gate as store builds first. The bundle is built
// with the API env from the channel's eas.json profile, never from the shell:
// on Oct 1 2026 an internal-tunnel OTA was published by hand with
// EXPO_PUBLIC_API_URL set to the bare tunnel host (no /api), and every tester
// request 404'd. After export, the bundle must contain the profile's URL.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { main: uploadSourcemaps } = require('./upload-sourcemaps.cjs');

const root = path.resolve(__dirname, '..');
const CHANNELS = new Set(['testflight', 'production', 'internal-tunnel']);
const API_ENV_KEYS = ['API_URL', 'EXPO_PUBLIC_API_URL', 'TPS_INTERNAL_TUNNEL_BUILD', 'EXPO_PUBLIC_TPS_TEST_ADS'];

/** The publish env: the shell minus any API keys, plus the profile's API keys. */
function publishEnv(channel, shellEnv = process.env, easJson = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'))) {
  const { resolveProfile } = require('./check-api-target.cjs');
  const profile = resolveProfile(easJson.build, channel);
  const env = { ...shellEnv, EAS_BUILD_PROFILE: channel };
  for (const key of API_ENV_KEYS) delete env[key];
  for (const key of API_ENV_KEYS) if (profile.env?.[key] !== undefined) env[key] = profile.env[key];
  return env;
}

/** Throws unless the exported iOS bundle carries the expected API URL literal. */
function assertBundleTargets(distDir, apiUrl) {
  if (!apiUrl) return;
  const dir = path.join(distDir, '_expo', 'static', 'js', 'ios');
  const bundles = fs.readdirSync(dir).filter(name => /\.(hbc|js)$/.test(name));
  if (bundles.length === 0) throw new Error(`no iOS bundle in ${dir}`);
  for (const name of bundles) {
    if (!fs.readFileSync(path.join(dir, name)).includes(Buffer.from(apiUrl))) {
      throw new Error(`${name} does not contain ${apiUrl}: the update would talk to the wrong API`);
    }
  }
}

const MEDIA = /\.(png|jpe?g|gif|webp|wav|mp3|m4a|mp4|ttf|otf|html|ahap)$/i;

/**
 * Asset patterns for a store-channel OTA: only media changed since the
 * channel's binary was built (tools/ota-base.json). Everything else is
 * embedded in that binary. Null when the channel has no recorded base.
 */
function otaAssetPatterns(channel, git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }),
  base = JSON.parse(fs.readFileSync(path.join(__dirname, 'ota-base.json'), 'utf8'))) {
  const commit = base[channel]?.commit;
  if (!commit) return null;
  const changed = [
    ...git(['diff', '--name-only', '--diff-filter=AMR', commit, '--']).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ].filter((file) => file && MEDIA.test(file) && !file.startsWith('dist/'));
  // A pattern that matches nothing: an empty list would mean "bundle all".
  return changed.length ? [...new Set(changed)] : ['__no_changed_media__'];
}

module.exports = { publishEnv, assertBundleTargets, otaAssetPatterns, API_ENV_KEYS };

async function run() {
  const [channel, message] = process.argv.slice(2);
  if (!CHANNELS.has(channel) || !message) {
    throw new Error('usage: publish-update.cjs <testflight|production|internal-tunnel> "<message>"');
  }
  execFileSync(process.execPath, [path.join(__dirname, 'check-api-target.cjs'), channel], { cwd: root, stdio: 'inherit' });
  const env = publishEnv(channel);
  const dist = path.join(root, 'dist');
  // Export first, check the bundle, then upload exactly that export.
  const patterns = otaAssetPatterns(channel);
  if (patterns) console.log(`[assets] ${patterns.length} changed media file(s) since ${channel} binary`);
  // The pattern env is for the export only: eas update must fingerprint the
  // same config the binary was built with.
  const exportEnv = patterns ? { ...env, TPS_OTA_ASSET_PATTERNS: JSON.stringify(patterns) } : env;
  execFileSync('npx', ['expo', 'export', '--platform', 'ios', '--source-maps', '--output-dir', 'dist', '--clear'],
    { cwd: root, stdio: 'inherit', env: exportEnv });
  assertBundleTargets(dist, env.EXPO_PUBLIC_API_URL);
  const out = execFileSync('eas', [
    'update', '--channel', channel, '--platform', 'ios', '--message', message,
    '--skip-bundler', '--input-dir', 'dist', '--json', '--non-interactive',
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env });
  const jsonPath = path.join(dist, 'eas-update.json');
  fs.writeFileSync(jsonPath, out);
  const result = await uploadSourcemaps(['update', jsonPath, dist]);
  console.log(result && result.skipped ? `[sourcemaps] skipped: ${result.skipped}` : `[sourcemaps] uploaded: ${JSON.stringify(result)}`);
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
