#!/usr/bin/env node
// Upload Hermes source maps to Sentry so release crash stacks are readable.
// Dependency free (Node 20 fetch/FormData), because this repo cannot add
// @sentry/cli right now. Release and dist match src/services/telemetry/
// releaseName.ts exactly; a test keeps the two in step.
//
//   node tools/upload-sourcemaps.cjs build
//     EAS build hook (eas-build-on-success). The Xcode bundle phase wrote the
//     composed Hermes map to $SOURCEMAP_FILE (set in eas.json). Version and
//     build number come from the Info.plist EAS just built.
//
//   node tools/upload-sourcemaps.cjs update <eas-update.json> [distDir]
//     After `eas update --json` (tools/publish-update.cjs runs both). One map
//     per iOS update, keyed by the update id.
//
// Needs SENTRY_AUTH_TOKEN (scope project:releases), SENTRY_ORG and
// SENTRY_PROJECT; SENTRY_URL defaults to https://sentry.io. With no
// EXPO_PUBLIC_SENTRY_DSN the app sends nothing, so there is nothing to map and
// the upload is skipped. With a DSN but no token a store build fails: events
// without maps are unreadable.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SENTRY_APP_ID = 'com.themeparkshark.app';
const STORE_PROFILES = new Set(['production', 'testflight']);
const BUNDLE_NAME = 'app:///main.jsbundle';
const MAP_NAME = 'app:///main.jsbundle.map';
const DEFAULT_SOURCEMAP_FILE = 'ios/main.jsbundle.map';
const INFO_PLIST = 'ios/ThemeParkShark/Info.plist';

function embeddedRelease(version, build) {
  const b = build || '0';
  return { release: `${SENTRY_APP_ID}@${version}+${b}`, dist: b };
}

function otaRelease(runtimeVersion, updateId) {
  return { release: `${SENTRY_APP_ID}@ota-${runtimeVersion}`, dist: updateId };
}

function plistString(xml, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml);
  return match ? match[1].trim() : undefined;
}

function sentryConfig(env) {
  return {
    token: env.SENTRY_AUTH_TOKEN,
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    url: (env.SENTRY_URL || 'https://sentry.io').replace(/\/+$/, ''),
  };
}

async function sentryRequest(cfg, method, apiPath, body, fetchImpl) {
  const headers = { Authorization: `Bearer ${cfg.token}` };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetchImpl(`${cfg.url}/api/0${apiPath}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return response;
}

/**
 * Create the release (idempotent), then upload a bundle stub that points at
 * the map, and the map itself. Hermes bytecode is not text, so the stub
 * carries the sourceMappingURL; the map's sourcesContent gives the code.
 * A 409 means this exact file is already there, which is fine on a re-run.
 */
async function uploadMap({ release, dist, mapPath }, cfg, fetchImpl = fetch) {
  const project = encodeURIComponent(cfg.project);
  const org = encodeURIComponent(cfg.org);
  const created = await sentryRequest(cfg, 'POST', `/organizations/${org}/releases/`, { version: release, projects: [cfg.project] }, fetchImpl);
  if (!created.ok && created.status !== 208 && created.status !== 409) {
    throw new Error(`Sentry release ${release}: HTTP ${created.status}`);
  }
  const files = [
    { name: BUNDLE_NAME, data: `//# sourceMappingURL=${MAP_NAME}\n`, header: `Sourcemap: ${MAP_NAME}`, type: 'application/javascript' },
    { name: MAP_NAME, data: fs.readFileSync(mapPath), type: 'application/json' },
  ];
  for (const file of files) {
    const form = new FormData();
    form.append('file', new Blob([file.data], { type: file.type }), path.basename(file.name));
    form.append('name', file.name);
    form.append('dist', dist);
    if (file.header) form.append('header', file.header);
    const response = await sentryRequest(cfg, 'POST', `/projects/${org}/${project}/releases/${encodeURIComponent(release)}/files/`, form, fetchImpl);
    if (!response.ok && response.status !== 409) throw new Error(`Sentry upload ${file.name} for ${release} (${dist}): HTTP ${response.status}`);
  }
  return { release, dist };
}

/** Decide whether to upload, skip, or fail, before touching the network. */
function gate(env, { store }) {
  const cfg = sentryConfig(env);
  if (!env.EXPO_PUBLIC_SENTRY_DSN) return { action: 'skip', reason: 'no EXPO_PUBLIC_SENTRY_DSN, so the app sends no events' };
  if (!cfg.token || !cfg.org || !cfg.project) {
    const reason = 'EXPO_PUBLIC_SENTRY_DSN is set but SENTRY_AUTH_TOKEN, SENTRY_ORG or SENTRY_PROJECT is missing; crash stacks would be unreadable';
    return store ? { action: 'fail', reason } : { action: 'skip', reason };
  }
  return { action: 'upload', cfg };
}

async function buildMode(env, fetchImpl) {
  const profile = env.EAS_BUILD_PROFILE || '';
  if (env.EAS_BUILD_PLATFORM && env.EAS_BUILD_PLATFORM !== 'ios') return { skipped: 'not an iOS build' };
  const store = STORE_PROFILES.has(profile);
  if (!store) return { skipped: `profile "${profile}" is not a store build` };
  const decision = gate(env, { store });
  if (decision.action === 'skip') return { skipped: decision.reason };
  if (decision.action === 'fail') throw new Error(decision.reason);
  const mapPath = path.resolve(root, env.SOURCEMAP_FILE || DEFAULT_SOURCEMAP_FILE);
  if (!fs.existsSync(mapPath)) throw new Error(`No Hermes source map at ${mapPath}. Is SOURCEMAP_FILE set for the "${profile}" profile in eas.json?`);
  const xml = fs.readFileSync(path.join(root, INFO_PLIST), 'utf8');
  const version = plistString(xml, 'CFBundleShortVersionString');
  const build = plistString(xml, 'CFBundleVersion');
  if (!version || /\$\(/.test(version) || !build || /\$\(/.test(build)) throw new Error(`Could not read a literal version and build from ${INFO_PLIST}`);
  return uploadMap({ ...embeddedRelease(version, build), mapPath }, decision.cfg, fetchImpl);
}

function findIosMap(distDir) {
  const dir = path.join(distDir, '_expo/static/js/ios');
  const maps = fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file.endsWith('.map')) : [];
  if (maps.length !== 1) throw new Error(`Expected one iOS source map in ${dir}, found ${maps.length}. Run eas update with source maps on (the default).`);
  return path.join(dir, maps[0]);
}

async function updateMode(env, updateJsonPath, distDir, fetchImpl) {
  const decision = gate(env, { store: true });
  if (decision.action === 'skip') return { skipped: decision.reason };
  if (decision.action === 'fail') throw new Error(decision.reason);
  const updates = JSON.parse(fs.readFileSync(updateJsonPath, 'utf8'));
  const ios = (Array.isArray(updates) ? updates : []).filter(update => update.platform === 'ios' && update.id && update.runtimeVersion);
  if (!ios.length) throw new Error(`No iOS update in ${updateJsonPath}`);
  const mapPath = findIosMap(distDir);
  const results = [];
  for (const update of ios) results.push(await uploadMap({ ...otaRelease(update.runtimeVersion, update.id), mapPath }, decision.cfg, fetchImpl));
  return results;
}

async function main(argv, env = process.env, fetchImpl = fetch) {
  const [mode, ...rest] = argv;
  if (mode === 'build') return buildMode(env, fetchImpl);
  if (mode === 'update') {
    const [updateJson, distDir = 'dist'] = rest;
    if (!updateJson) throw new Error('usage: upload-sourcemaps.cjs update <eas-update.json> [distDir]');
    return updateMode(env, path.resolve(updateJson), path.resolve(distDir), fetchImpl);
  }
  throw new Error('usage: upload-sourcemaps.cjs build | update <eas-update.json> [distDir]');
}

module.exports = { main, uploadMap, embeddedRelease, otaRelease, plistString, gate, findIosMap, BUNDLE_NAME, MAP_NAME };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    result => {
      if (result && result.skipped) console.log(`[sourcemaps] skipped: ${result.skipped}`);
      else console.log(`[sourcemaps] uploaded: ${JSON.stringify(result)}`);
    },
    error => {
      console.error(`[sourcemaps] ${error.message}`);
      process.exit(1);
    },
  );
}
