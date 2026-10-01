const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
// Run with: node --test tools/tests/tester-feedback.test.cjs
// In-app tester feedback: shake gate and detector, report body, console ring,
// endpoint, wiring, and the OTA guard (no native module the binary lacks).

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = loadTs('src/services/feedback/model.ts');

test('shake is on only for the internal tester channel and dev builds', () => {
  assert.equal(model.shakeEnabled({ channel: 'internal-tunnel', isDev: false }), true);
  assert.equal(model.shakeEnabled({ channel: null, isDev: true }), true);
  for (const channel of ['production', 'testflight', 'development', null, undefined, '']) {
    assert.equal(model.shakeEnabled({ channel, isDev: false }), false, String(channel));
  }
});

const still = { x: 0, y: 0, z: 1 };
const jolt = { x: 2.4, y: 0.3, z: 0.9 };

test('three hard jolts inside the window are a shake, then it rests', () => {
  const detect = model.createShakeDetector();
  assert.equal(detect(still, 0), false);
  assert.equal(detect(jolt, 100), false);
  assert.equal(detect(jolt, 300), false);
  assert.equal(detect(jolt, 500), true);
  assert.equal(detect(jolt, 700), false, 'cooldown');
  assert.equal(detect(jolt, 900), false);
  assert.equal(detect(jolt, 1100), false);
  assert.equal(detect(jolt, 4600), false, 'cooldown cleared the old jolts');
  assert.equal(detect(jolt, 4800), false);
  assert.equal(detect(jolt, 5000), true);
});

test('walking, a single bump, slow taps and one long jolt are not a shake', () => {
  const detect = model.createShakeDetector();
  for (let t = 0; t < 3000; t += 80) assert.equal(detect({ x: 0.3, y: 1.4, z: 0.6 }, t), false, 'walking');
  assert.equal(detect(jolt, 4000), false);
  assert.equal(detect(jolt, 5500), false, 'outside the window');
  assert.equal(detect(jolt, 7000), false);
  const long = model.createShakeDetector();
  assert.equal(long(jolt, 0), false);
  assert.equal(long(jolt, 40), false, 'same jolt');
  assert.equal(long(jolt, 80), false, 'same jolt');
  assert.equal(long({ x: NaN, y: 0, z: 0 }, 300), false);
});

test('screenshots come out about 720 px wide on both platforms', () => {
  assert.deepEqual(plain(model.feedbackCaptureSize('ios', 3, { width: 393, height: 852 })), { width: 240, height: 520 });
  assert.deepEqual(plain(model.feedbackCaptureSize('android', 2.75, { width: 411, height: 914 })), { width: 720, height: 1601 });
  assert.deepEqual(plain(model.feedbackCaptureSize('ios', 0, { width: 0, height: 0 })), { width: 720, height: 1280 });
});

const snapshot = (overrides = {}) => ({
  route: 'Explore',
  player: { id: 341, username: 'jenn', screen_name: 'Jenn' },
  park: { id: 7, name: 'Magic Kingdom' },
  gps: { accuracyMeters: 12.345, timestamp: 1_000_000 },
  app: { version: '1.6.0', build: '45' },
  updates: { updateId: 'abc-123', channel: 'internal-tunnel', runtimeVersion: 'internal-tunnel-1.6.0', isEmbeddedLaunch: false },
  device: { modelName: 'iPhone 15 Pro', osName: 'iOS', osVersion: '18.1' },
  isDev: false,
  now: 1_004_400,
  ...overrides,
});

test('the context carries screen, player, park, GPS, build and device, and drops blanks', () => {
  assert.deepEqual(plain(model.feedbackContext(snapshot())), {
    route: 'Explore', park_id: 7, park_name: 'Magic Kingdom', gps_accuracy_m: 12.3, gps_age_s: 4,
    app_version: '1.6.0', build: '45', update_id: 'abc-123', channel: 'internal-tunnel',
    runtime_version: 'internal-tunnel-1.6.0', is_embedded_launch: false, device_model: 'iPhone 15 Pro',
    os_name: 'iOS', os_version: '18.1', username: 'jenn', is_dev: false,
  });
  const bare = plain(model.feedbackContext(snapshot({
    route: '  ', player: { id: 1, username: '', screen_name: 'Shark' }, park: null, gps: { accuracyMeters: -1, timestamp: null },
    updates: { updateId: null, channel: null, runtimeVersion: null }, device: {},
  })));
  assert.deepEqual(Object.keys(bare).sort(), ['app_version', 'build', 'is_dev', 'username']);
  assert.equal(bare.username, 'Shark');
});

test('the report body needs a note or the screenshot, trims the note and honors the screenshot toggle', () => {
  const logs = Array.from({ length: 60 }, (_, i) => ({ level: 'warn', message: `w${i}`, at: i }));
  const base = { note: '  Coin vanished  ', screenshot: 'BASE64', includeScreenshot: true, trigger: 'shake', snapshot: snapshot(), logs };
  const body = plain(model.feedbackRequest(base));
  assert.equal(body.note, 'Coin vanished');
  assert.equal(body.screenshot, 'BASE64');
  assert.equal(body.trigger, 'shake');
  assert.equal(body.logs.length, 50);
  assert.equal(body.logs[0].message, 'w10', 'newest 50');
  assert.equal(body.context.route, 'Explore');

  const noShot = plain(model.feedbackRequest({ ...base, includeScreenshot: false }));
  assert.equal('screenshot' in noShot, false);
  const shotOnly = plain(model.feedbackRequest({ ...base, note: '   ' }));
  assert.equal('note' in shotOnly, false);
  assert.equal(model.feedbackRequest({ ...base, note: ' ', includeScreenshot: false }), null);
  assert.equal(model.feedbackRequest({ ...base, note: '', screenshot: null }), null);
  assert.equal(plain(model.feedbackRequest({ ...base, note: 'x'.repeat(5000) })).note.length, model.NOTE_MAX);
});

test('the console ring keeps the last 50 warnings and errors, masks tokens and still logs', () => {
  const ring = loadTs('src/services/feedback/consoleRing.ts');
  const seen = [];
  const fakeConsole = { warn: (...args) => seen.push(['warn', ...args]), error: (...args) => seen.push(['error', ...args]) };
  ring.installConsoleRing(fakeConsole);
  ring.installConsoleRing(fakeConsole);

  fakeConsole.warn('slow tile', { id: 3 });
  const error = new TypeError('undefined is not an object');
  fakeConsole.error(error);
  fakeConsole.error('Request failed', 'Authorization: Bearer abc.def.ghi', '{"token":"s3cret"}');
  assert.equal(seen.length, 3, 'originals run once each');

  const lines = plain(ring.recentLogLines());
  assert.equal(lines.length, 3);
  assert.equal(lines[0].message, 'slow tile {"id":3}');
  assert.equal(lines[0].level, 'warn');
  assert.match(lines[1].message, /^TypeError: undefined is not an object/);
  assert.equal(lines[1].level, 'error');
  assert.doesNotMatch(lines[2].message, /abc\.def\.ghi|s3cret/);
  assert.match(lines[2].message, /Bearer \[redacted\]/);

  for (let i = 0; i < 70; i += 1) fakeConsole.warn(`line ${i}`);
  const capped = ring.recentLogLines();
  assert.equal(capped.length, ring.LOG_RING_LIMIT);
  assert.equal(capped.at(-1).message, 'line 69');
  fakeConsole.error('x'.repeat(5000));
  assert.equal(ring.recentLogLines().at(-1).message.length, ring.LOG_LINE_MAX);
  ring.clearLogRing();
  assert.equal(ring.recentLogLines().length, 0);
});

test('the endpoint posts the body to /me/feedback with room for a screenshot upload', async () => {
  const calls = [];
  const send = loadTs('src/api/endpoints/me/tester-feedback.ts', {
    '../../client': { post: async (...args) => { calls.push(args); return { data: { data: { id: 12 } } }; } },
  }).default;
  assert.equal(await send({ note: 'x', trigger: 'settings', context: {}, logs: [] }), 12);
  assert.equal(calls[0][0], '/me/feedback');
  assert.equal(calls[0][2].timeout, 30000);
});

test('wiring: ring installed at launch, one host in Root, Settings row always shown', () => {
  const app = read('App.tsx');
  assert.ok(app.indexOf('installConsoleRing();') > -1 && app.indexOf('installConsoleRing();') < app.indexOf('if (initTelemetry()'));
  const rootSource = read('src/Root.tsx');
  assert.equal((rootSource.match(/<FeedbackHost \/>/g) || []).length, 1);
  const settings = read('src/screens/SettingsScreen.tsx');
  assert.match(settings, /title=\{FEEDBACK_COPY\.settingsTitle\}[^]*?onPress=\{\(\) => openFeedbackReport\('settings'\)\}/);
  const helpSection = settings.slice(settings.indexOf('<Section title="Help"'), settings.indexOf('<Section title="Account"'));
  assert.match(helpSection, /openFeedbackReport/);
  assert.doesNotMatch(helpSection, /__DEV__/, 'the Settings row is not gated');
  const host = read('src/components/Feedback/FeedbackHost.tsx');
  assert.match(host, /shakeEnabled\(\{ channel: Updates\.channel, isDev: __DEV__ \}\)/);
  assert.match(host, /captureScreen\(/);
  assert.ok(host.indexOf('captureScreen(') < host.indexOf('setVisible(true)'), 'screenshot before the dialog opens');
});

test('OTA safe: every package the feedback code imports is JS or already linked in the binary', () => {
  const podfileLock = read('ios/Podfile.lock');
  const pkg = JSON.parse(read('package.json'));
  const nativePods = {
    'expo-application': 'EXApplication', 'expo-device': 'ExpoDevice', 'expo-sensors': 'ExpoSensors',
    'expo-updates': 'EXUpdates', 'react-native-view-shot': 'react-native-view-shot',
  };
  const pureJs = new Set(['react', 'react-native']);
  for (const file of ['src/components/Feedback/FeedbackHost.tsx', 'src/services/feedback/model.ts',
    'src/services/feedback/consoleRing.ts', 'src/api/endpoints/me/tester-feedback.ts']) {
    const packages = [...read(file).matchAll(/from '([^'.][^']*)'/g)].map(match => match[1]);
    for (const name of packages) {
      if (pureJs.has(name)) continue;
      assert.ok(name in nativePods, `${file} imports ${name}: add it to this list only if the shipped binary links it`);
      assert.ok(pkg.dependencies[name], `${name} is a dependency`);
      assert.match(podfileLock, new RegExp(`\\n  - ${nativePods[name]} \\(`), `${name} is linked in the binary`);
    }
  }
});

test('feedback copy has no em dashes or emoji', () => {
  for (const copy of Object.values(model.FEEDBACK_COPY)) {
    assert.doesNotMatch(copy, /—/);
    assert.doesNotMatch(copy, /\p{Extended_Pictographic}/u);
  }
});
