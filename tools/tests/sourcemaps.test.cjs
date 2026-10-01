const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadTs, read, root } = require('./helpers/load-ts.cjs');

const upload = require('../upload-sourcemaps.cjs');
const { sentryReleaseAndDist } = loadTs('src/services/telemetry/releaseName.ts');
const envelope = loadTs('src/services/telemetry/sentryEnvelope.ts');

function fakeSentry() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const entry = { url, method: init.method, auth: init.headers.Authorization };
    if (init.body instanceof FormData) {
      entry.form = {};
      for (const [key, value] of init.body.entries()) entry.form[key] = typeof value === 'string' ? value : await value.text();
    } else if (init.body) {
      entry.json = JSON.parse(init.body);
    }
    calls.push(entry);
    return { ok: true, status: url.endsWith('/releases/') ? 201 : 201 };
  };
  return { calls, fetchImpl };
}

const ENV = { EXPO_PUBLIC_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2', SENTRY_AUTH_TOKEN: 'tok', SENTRY_ORG: 'tps', SENTRY_PROJECT: 'app' };

test('the uploader and the app agree on release and dist, for store builds and OTA updates', () => {
  assert.deepEqual(
    { ...sentryReleaseAndDist({ version: '1.6.0', build: '42', updateId: 'embedded-id', runtimeVersion: 'fp1', isEmbeddedLaunch: true }) },
    upload.embeddedRelease('1.6.0', '42'),
    'the embedded launch uses the build number, not the embedded update id',
  );
  assert.deepEqual(
    { ...sentryReleaseAndDist({ version: '1.6.0', build: '42', updateId: 'u-9', runtimeVersion: 'fp1', isEmbeddedLaunch: false }) },
    upload.otaRelease('fp1', 'u-9'),
  );
  assert.deepEqual({ ...sentryReleaseAndDist({}) }, {});
});

test('every release bundle frame is named app:///main.jsbundle so it finds the uploaded map', () => {
  const frames = envelope.parseStack([
    'Error: boom',
    '    at a (address at /var/containers/Bundle/Application/X/ThemeParkShark.app/main.jsbundle:1:9911)',
    '    at b (address at /var/mobile/Containers/Data/Application/Y/Library/Application Support/.expo-internal/5b8e1f2a:1:311)',
  ].join('\n'));
  assert.deepEqual([...frames.map(f => f.filename)], [envelope.BUNDLE_FRAME_FILENAME, envelope.BUNDLE_FRAME_FILENAME]);
  assert.equal(envelope.BUNDLE_FRAME_FILENAME, upload.BUNDLE_NAME);
});

test('build hook uploads the Hermes map for store builds under the Info.plist version and build', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tps-maps-'));
  const map = path.join(dir, 'main.jsbundle.map');
  fs.writeFileSync(map, '{"version":3,"sources":["src/App.tsx"],"mappings":"AAAA"}');
  const { calls, fetchImpl } = fakeSentry();
  const xml = read('ios/ThemeParkShark/Info.plist');
  const version = upload.plistString(xml, 'CFBundleShortVersionString');
  const build = upload.plistString(xml, 'CFBundleVersion');
  const result = await upload.main(['build'], { ...ENV, EAS_BUILD_PROFILE: 'testflight', EAS_BUILD_PLATFORM: 'ios', SOURCEMAP_FILE: map }, fetchImpl);
  const release = `com.themeparkshark.app@${version}+${build}`;
  assert.deepEqual({ ...result }, { release, dist: build });
  assert.equal(calls[0].url, 'https://sentry.io/api/0/organizations/tps/releases/');
  assert.deepEqual(calls[0].json, { version: release, projects: ['app'] });
  assert.equal(calls[0].auth, 'Bearer tok');
  const files = calls.slice(1);
  assert.deepEqual(files.map(c => c.form.name), ['app:///main.jsbundle', 'app:///main.jsbundle.map']);
  assert.ok(files.every(c => c.form.dist === build));
  assert.ok(files[0].url.endsWith(`/projects/tps/app/releases/${encodeURIComponent(release)}/files/`));
  assert.equal(files[0].form.header, 'Sourcemap: app:///main.jsbundle.map');
  assert.match(files[1].form.file, /src\/App\.tsx/);
});

test('build hook: dev profiles and DSN-less builds skip; a DSN without a token fails the store build', async () => {
  const { calls, fetchImpl } = fakeSentry();
  assert.match((await upload.main(['build'], { ...ENV, EAS_BUILD_PROFILE: 'development' }, fetchImpl)).skipped, /not a store build/);
  assert.match((await upload.main(['build'], { EAS_BUILD_PROFILE: 'production' }, fetchImpl)).skipped, /no EXPO_PUBLIC_SENTRY_DSN/);
  await assert.rejects(upload.main(['build'], { EXPO_PUBLIC_SENTRY_DSN: ENV.EXPO_PUBLIC_SENTRY_DSN, EAS_BUILD_PROFILE: 'production' }, fetchImpl), /SENTRY_AUTH_TOKEN/);
  await assert.rejects(upload.main(['build'], { ...ENV, EAS_BUILD_PROFILE: 'production', SOURCEMAP_FILE: '/nope/main.jsbundle.map' }, fetchImpl), /No Hermes source map/);
  assert.equal(calls.length, 0);
});

test('update mode uploads one map per iOS update, keyed by update id under the runtime release', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tps-update-'));
  const js = path.join(dir, '_expo/static/js/ios');
  fs.mkdirSync(js, { recursive: true });
  fs.writeFileSync(path.join(js, 'entry-abc.hbc'), 'hbc');
  fs.writeFileSync(path.join(js, 'entry-abc.hbc.map'), '{"version":3,"sources":["src/Root.tsx"],"mappings":"AAAA"}');
  const json = path.join(dir, 'eas-update.json');
  fs.writeFileSync(json, JSON.stringify([
    { id: 'u-ios', platform: 'ios', runtimeVersion: 'fp1' },
    { id: 'u-android', platform: 'android', runtimeVersion: 'fp1' },
  ]));
  const { calls, fetchImpl } = fakeSentry();
  const result = await upload.main(['update', json, dir], ENV, fetchImpl);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ release: 'com.themeparkshark.app@ota-fp1', dist: 'u-ios' }]);
  assert.equal(calls.length, 3);
  assert.match(calls[2].form.file, /src\/Root\.tsx/);
});

test('store profiles emit the Hermes map and upload it after a successful build', () => {
  const eas = JSON.parse(read('eas.json'));
  for (const profile of ['production', 'testflight']) assert.equal(eas.build[profile].env.SOURCEMAP_FILE, 'ios/main.jsbundle.map', profile);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['eas-build-on-success'], 'node tools/upload-sourcemaps.cjs build');
  assert.match(pkg.scripts['update-testflight'], /publish-update\.cjs testflight/);
  assert.match(read('.gitignore'), /^ios\/main\.jsbundle\.map$/m);
  // The OTA is exported with source maps, checked, then uploaded as exported.
  assert.match(read('tools/publish-update.cjs'), /'export', '--platform', 'ios', '--source-maps'/);
  assert.match(read('tools/publish-update.cjs'), /'--skip-bundler', '--input-dir', 'dist'/);
});
