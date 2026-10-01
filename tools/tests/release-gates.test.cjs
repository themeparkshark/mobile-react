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

test('AdMob is used only through the guarded rewarded-ads service, with no tracking prompt', () => {
  const { execFileSync } = require('node:child_process');
  let hits = ''; try { hits = execFileSync('git', ['grep', '--untracked', '-l', '-E', 'ads-stub|google-mobile-ads|mobileAds\\(', '--', 'src', 'App.tsx', 'index.js'], { cwd: root, encoding: 'utf8' }).trim(); } catch (error) { if (error.status !== 1) throw error; }
  // The SDK is required lazily in one file, only on a binary that has it.
  assert.deepEqual(hits.split('\n').filter(Boolean), ['src/services/ads.ts']);
  const ads = read('src/services/ads.ts');
  assert.doesNotMatch(ads, /^import [^;]*from 'react-native-google-mobile-ads'/m, 'never a top-level import');
  assert.match(ads, /requestNonPersonalizedAdsOnly/);
  assert.doesNotMatch(ads + read('app.config.js'), /requestTrackingPermission|NSUserTrackingUsageDescription|userTrackingUsageDescription/);
  assert.ok(!fs.existsSync(path.join(root, 'app.json')), 'AdMob is configured through app.config.js, not app.json');
  const rnConfig = require(path.join(root, 'react-native.config.js'));
  assert.equal(rnConfig.dependencies['react-native-google-mobile-ads'], undefined, 'linked from 1.7.0');
  assert.equal(rnConfig.dependencies['react-native-worklets-core'].platforms.ios, null);
});

test('the AdMob app id is the same in app.config.js, Info.plist and adConfig.ts', () => {
  const plist = read('ios/ThemeParkShark/Info.plist');
  const appId = read('app.config.js').match(/ADMOB_IOS_APP_ID = '([^']+)'/)[1];
  assert.match(appId, /^ca-app-pub-\d+~\d+$/);
  assert.ok(plist.includes(`<key>GADApplicationIdentifier</key>\n\t<string>${appId}</string>`));
  assert.ok(read('src/services/adConfig.ts').includes(`ADMOB_IOS_APP_ID = '${appId}'`));
  assert.match(plist, /cstr6suwn9\.skadnetwork/);
  assert.doesNotMatch(plist, /NSUserTrackingUsageDescription/);
});

test('the committed native project matches the linked modules (ads SDK in, no maps or worklets pods)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const lock = fs.readFileSync(path.join(__dirname, '..', '..', 'ios/Podfile.lock'), 'utf8');
  const pbx = fs.readFileSync(path.join(__dirname, '..', '..', 'ios/ThemeParkShark.xcodeproj/project.pbxproj'), 'utf8');
  for (const pod of ['GoogleAppMeasurement', 'react-native-maps', 'react-native-worklets-core', 'ExpoGL', 'ExpoImagePicker']) {
    assert.doesNotMatch(lock, new RegExp(`^  - ${pod.replace(/[-]/g, '\\-')} `, 'm'), `${pod} is still in Podfile.lock`);
  }
  // Rewarded ads (1.7.0): the SDK with its privacy manifest (12.x), no App Measurement.
  assert.match(lock, /^  - Google-Mobile-Ads-SDK \(12\./m);
  assert.match(lock, /^  - RNGoogleMobileAds \(15\.8\.3\)/m);
  // Its Info.plist script exits cleanly without app.json (our app id comes from Info.plist).
  assert.match(pbx, /\[RNGoogleMobileAds\] Configuration/);
  assert.doesNotMatch(pbx, /ReactNativeMapsPrivacy\.bundle/);
});
