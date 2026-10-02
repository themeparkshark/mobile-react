// 1.7.0 store build: native checklist items (tps-prime-time-audit/NEXT_NATIVE_BUILD.md).
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

function adConfig(env, dev = false) {
  return loadTs('src/services/adConfig.ts', {}, { process: { env }, __DEV__: dev });
}

test('store bundles have no Google test ad units and ads stay off until real ids exist', () => {
  const store = adConfig({});
  assert.equal(store.ADS_ENABLED, false);
  assert.equal(store.USING_TEST_ADS, false);
  assert.ok(Object.values(store.REWARDED_AD_UNITS).every(id => id === null));
  // No Google test unit literal in app code: tester bundles use the SDK's TestIds.
  for (const file of ['src/services/adConfig.ts', 'src/services/ads.ts']) assert.doesNotMatch(read(file), /ca-app-pub-3940256099942544\//);
  assert.match(read('src/services/ads.ts'), /REWARDED_AD_UNITS\[placement\] \?\? \(USING_TEST_ADS \? TestIds\.REWARDED : null\)/);
});

test('dev and internal tester bundles keep Google test units', () => {
  for (const config of [adConfig({ EXPO_PUBLIC_TPS_TEST_ADS: '1' }), adConfig({}, true)]) {
    assert.equal(config.ADS_ENABLED, true);
    assert.equal(config.USING_TEST_ADS, true);
  }
});

test('only the internal tester profile turns test ads on; store profiles never do', () => {
  const eas = JSON.parse(read('eas.json'));
  assert.equal(eas.build['internal-tunnel'].env.EXPO_PUBLIC_TPS_TEST_ADS, '1');
  for (const name of ['production', 'testflight']) assert.equal(eas.build[name].env.EXPO_PUBLIC_TPS_TEST_ADS, undefined);
  assert.match(read('tools/publish-update.cjs'), /'EXPO_PUBLIC_TPS_TEST_ADS'/);
});

test('adsAvailable() is false whenever ads are off, before touching the native module', () => {
  const ads = read('src/services/ads.ts');
  assert.match(ads, /if \(!ADS_ENABLED \|\| Platform\.OS !== 'ios'\) return false;/);
});

test('version 1.7.0 everywhere and 120 Hz off', () => {
  assert.match(read('app.config.js'), /version: '1\.7\.0'/);
  const plist = read('ios/ThemeParkShark/Info.plist');
  assert.match(plist, /<key>CFBundleShortVersionString<\/key>\n\t<string>1\.7\.0<\/string>/);
  assert.doesNotMatch(plist, /CADisableMinimumFrameDurationOnPhone/);
  const pbx = read('ios/ThemeParkShark.xcodeproj/project.pbxproj');
  assert.equal((pbx.match(/MARKETING_VERSION = 1\.7\.0;/g) || []).length, 4);
  assert.doesNotMatch(pbx, /MARKETING_VERSION = 1\.6\.0;/);
});

test('foreground GPS uses the walking activity type', () => {
  const delegate = read('ios/ThemeParkShark/AppDelegate.mm');
  assert.match(delegate, /@implementation CLLocationManager \(TPSWalking\)/);
  assert.match(delegate, /!self\.allowsBackgroundLocationUpdates && self\.activityType == CLActivityTypeOther/);
  assert.match(delegate, /self\.activityType = CLActivityTypeFitness;/);
});

test('Dim Flashing Lights reaches both level-up effects through the FlashSafety module', () => {
  assert.match(read('modules/flash-safety/ios/FlashSafetyModule.swift'), /MADimFlashingLightsEnabled\(\)/);
  assert.match(read('ios/Podfile.lock'), /FlashSafety \(from `\.\.\/modules\/flash-safety\/ios`\)/);
  for (const file of ['src/components/CoinLevelingModal.tsx', 'src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx']) {
    assert.match(read(file), /dimFlashingLights: isDimFlashingLightsEnabled\(\)/);
  }
  const off = loadTs('modules/flash-safety/index.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-modules-core': { requireOptionalNativeModule: () => null },
  });
  assert.equal(off.isDimFlashingLightsEnabled(), false);
  const on = loadTs('modules/flash-safety/index.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-modules-core': { requireOptionalNativeModule: () => ({ isDimFlashingLightsEnabled: () => true }) },
  });
  assert.equal(on.isDimFlashingLightsEnabled(), true);
});
