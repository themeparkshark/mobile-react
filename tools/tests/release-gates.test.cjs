const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { read, root } = require('./helpers/load-ts.cjs');

const pkg = JSON.parse(read('package.json'));

test('typecheck and test scripts exist and verify chains them', () => {
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
  assert.equal(pkg.scripts.test, 'node --test tools/tests/*.test.cjs');
  assert.match(pkg.scripts.verify, /typecheck/);
});

test('every EAS build runs the API gate, even when eas build is called directly', () => {
  assert.match(pkg.scripts['eas-build-pre-install'], /check-api-target\.cjs "\$EAS_BUILD_PROFILE"/);
  for (const [name, script] of Object.entries(pkg.scripts)) {
    if (/eas build --profile (\S+)/.test(script)) {
      const profile = script.match(/eas build --profile (\S+)/)[1];
      assert.match(script, new RegExp(`check:api -- ${profile} &&`), name);
    }
  }
  assert.equal(pkg.scripts['build-preview'], undefined, 'the dead preview profile is gone');
});

test('the pre-commit hook is executable and runs both gates', () => {
  const hook = path.join(root, '.githooks/pre-commit');
  assert.ok(fs.statSync(hook).mode & 0o111, 'hook must be executable');
  const body = fs.readFileSync(hook, 'utf8');
  assert.match(body, /typecheck/);
  assert.match(body, /npm test/);
  assert.equal(pkg.scripts['hooks:install'], 'git config core.hooksPath .githooks');
});

test('CI runs typecheck and node tests', () => {
  const ci = read('.github/workflows/app-ci.yml');
  assert.match(ci, /npm run typecheck/);
  assert.match(ci, /npm test/);
});

test('AdMob is gone from JS and unlinked from the native binary', () => {
  const { execFileSync } = require('node:child_process');
  let hits = ''; try { hits = execFileSync('git', ['grep', '-l', '-E', 'ads-stub|google-mobile-ads|mobileAds\\(', '--', 'src', 'App.tsx', 'index.js'], { cwd: root, encoding: 'utf8' }).trim(); } catch (error) { if (error.status !== 1) throw error; }
  assert.equal(hits, '');
  assert.ok(!fs.existsSync(path.join(root, 'app.json')), 'app.json only held the AdMob app id');
  const rnConfig = require(path.join(root, 'react-native.config.js'));
  assert.equal(rnConfig.dependencies['react-native-google-mobile-ads'].platforms.ios, null);
  assert.equal(rnConfig.dependencies['react-native-worklets-core'].platforms.ios, null);
});

test('the committed native project matches the unlinked modules (no ads SDK, maps or worklets pods)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const lock = fs.readFileSync(path.join(__dirname, '..', '..', 'ios/Podfile.lock'), 'utf8');
  const pbx = fs.readFileSync(path.join(__dirname, '..', '..', 'ios/ThemeParkShark.xcodeproj/project.pbxproj'), 'utf8');
  for (const pod of ['Google-Mobile-Ads-SDK', 'GoogleAppMeasurement', 'react-native-google-mobile-ads', 'react-native-maps', 'react-native-worklets-core', 'ExpoGL', 'ExpoImagePicker']) {
    assert.doesNotMatch(lock, new RegExp(`^  - ${pod.replace(/[-]/g, '\\-')} `, 'm'), `${pod} is still in Podfile.lock`);
  }
  assert.doesNotMatch(pbx, /RNGoogleMobileAds/, 'the ads Info.plist script phase would fail the build without app.json');
  assert.doesNotMatch(pbx, /ReactNativeMapsPrivacy\.bundle/);
});
