const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { read, root } = require('./helpers/load-ts.cjs');

const plugin = require(path.join(root, 'plugins/withTpsNativeInvariants.js'));
const { readPlist: plist } = require('./helpers/plist.cjs');

// Shape of the Expo SDK 52 bare template's Podfile around the anchors the
// plugin relies on.
const STOCK_PODFILE = `target 'ThemeParkShark' do
  use_expo_modules!

  config = use_native_modules!(config_command)

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',
    )

    # This is necessary for Xcode 14, because it signs resource bundles by default
  end
end
`;

test('the committed Podfile already satisfies the plugin (prebuild is a no-op there)', () => {
  const podfile = read('ios/Podfile');
  assert.equal(plugin.applyPodfilePatches(podfile), podfile);
});

test('a stock Podfile gains the MapLibre pod, fmt patch and search paths, idempotently', () => {
  const once = plugin.applyPodfilePatches(STOCK_PODFILE);
  assert.match(once, /use_expo_modules!\n {2}pod 'MapLibre', '6\.17\.1'\n/);
  assert.match(once, /TPS: consteval off for Xcode 26/);
  assert.match(once, /t\.name == 'maplibre-react-native'/);
  assert.ok(once.indexOf('TPS: consteval off') > once.indexOf('react_native_post_install('), 'patch runs after RN post install');
  assert.equal(plugin.applyPodfilePatches(once), once);
  assert.throws(() => plugin.applyPodfilePatches('target do\nend\n'), /use_expo_modules! not found/);
});

test('expo prebuild --clean is refused unless explicitly allowed', () => {
  assert.throws(() => plugin.assertPrebuildAllowed(['node', 'expo', 'prebuild', '--clean'], {}), /LinePlayWidget/);
  assert.doesNotThrow(() => plugin.assertPrebuildAllowed(['node', 'expo', 'prebuild', '--platform', 'ios'], {}));
  assert.doesNotThrow(() => plugin.assertPrebuildAllowed(['node', 'expo', 'start', '--clear'], {}));
  assert.doesNotThrow(() => plugin.assertPrebuildAllowed(['node', 'expo', 'prebuild', '--clean'], { TPS_ALLOW_PREBUILD_CLEAN: '1' }));
  assert.match(read('app.config.js'), /^assertPrebuildAllowed\(\);$/m);
});

test('Info.plist invariants: location-only background mode, no Expo default purpose strings', () => {
  const committed = plist('ios/ThemeParkShark/Info.plist');
  assert.deepEqual(plugin.applyInfoPlistInvariants(committed), committed);

  const drifted = plugin.applyInfoPlistInvariants({
    ...committed,
    UIBackgroundModes: ['location', 'fetch'],
    NSPhotoLibraryUsageDescription: 'Allow $(PRODUCT_NAME) to access your photos',
  });
  assert.deepEqual(drifted.UIBackgroundModes, ['location']);
  assert.equal('NSPhotoLibraryUsageDescription' in drifted, false);
  assert.throws(
    () => plugin.applyInfoPlistInvariants({ ...committed, NSCameraUsageDescription: 'Allow $(PRODUCT_NAME) to access your camera' }),
    /NSCameraUsageDescription is an Expo default/,
  );
});

test('app config carries what prebuild would otherwise drop', () => {
  const { getConfig } = require(require.resolve('@expo/config', { paths: [root] }));
  const { exp } = getConfig(root, { skipSDKVersionRequirement: true, isPublicConfig: false });

  assert.deepEqual(exp.ios.privacyManifests, (({ NSPrivacyTracking, NSPrivacyTrackingDomains, NSPrivacyCollectedDataTypes, NSPrivacyAccessedAPITypes }) =>
    ({ NSPrivacyTracking, NSPrivacyTrackingDomains, NSPrivacyCollectedDataTypes, NSPrivacyAccessedAPITypes }))(plist('ios/ThemeParkShark/PrivacyInfo.xcprivacy')));

  const podProps = JSON.parse(read('ios/Podfile.properties.json'));
  assert.equal(exp.newArchEnabled, true);
  assert.equal(podProps.newArchEnabled, 'true');

  const pluginNames = exp.plugins.map(p => (Array.isArray(p) ? p[0] : p));
  assert.equal(pluginNames[0], 'withTpsNativeInvariants', 'listed first so its mods run last');
  assert.ok(!pluginNames.includes('@maplibre/maplibre-react-native'), 'the MapLibre plugin would switch the pod to SPM');
});

test('committed native project keeps the widget target and the CocoaPods MapLibre route', () => {
  assert.match(read('ios/ThemeParkShark.xcodeproj/project.pbxproj'), /LinePlayWidget/);
  assert.doesNotMatch(read('ios/Podfile'), /\$MLRN\.post_install/);
  assert.match(read('RELEASE.md'), /never run `expo prebuild --clean`/i);
});

test('bitcode is gone from the committed Xcode project and the plugin strips it after prebuild', () => {
  assert.doesNotMatch(read('ios/ThemeParkShark.xcodeproj/project.pbxproj'), /ENABLE_BITCODE/);
  const configs = {
    A: { isa: 'XCBuildConfiguration', buildSettings: { ENABLE_BITCODE: 'YES', SWIFT_VERSION: '5.0' } },
    A_comment: 'Debug',
    B: { isa: 'XCBuildConfiguration', buildSettings: { ENABLE_BITCODE: 'NO' } },
    C: { isa: 'XCBuildConfiguration', buildSettings: {} },
  };
  assert.equal(plugin.stripBitcode(configs), 2);
  assert.deepEqual(configs.A.buildSettings, { SWIFT_VERSION: '5.0' });
  assert.deepEqual(configs.B.buildSettings, {});
  assert.equal(plugin.stripBitcode(configs), 0, 'idempotent');
});
