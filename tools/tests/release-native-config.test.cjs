const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { loadTs, read, root } = require('./helpers/load-ts.cjs');

const { readPlist: plist } = require('./helpers/plist.cjs');

/** Width from the first JPEG start-of-frame marker (portable, no sips). */
function jpegWidth(file) {
  const buf = require('node:fs').readFileSync(path.join(root, file));
  let offset = 2;
  while (offset < buf.length) {
    const marker = buf[offset + 1];
    const length = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return buf.readUInt16BE(offset + 7);
    offset += 2 + length;
  }
  throw new Error(`${file}: no JPEG frame header`);
}
const info = plist('ios/ThemeParkShark/Info.plist');
const expoPlist = plist('ios/ThemeParkShark/Supporting/Expo.plist');
const privacy = plist('ios/ThemeParkShark/PrivacyInfo.xcprivacy');
const appConfig = read('app.config.js');

const PURPOSE_KEYS = [
  'NSLocationWhenInUseUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationAlwaysUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSMotionUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
];

test('every iOS purpose string is written for players, not an Expo default', () => {
  for (const key of PURPOSE_KEYS) {
    const value = info[key];
    assert.ok(value, `${key} missing`);
    assert.doesNotMatch(value, /^Allow \$\(PRODUCT_NAME\)/, key);
    assert.doesNotMatch(value, /LinePlay|—/, `${key}: no internal names or em dashes`);
    assert.match(value, /^Theme Park Shark /, key);
    assert.ok(appConfig.includes(value), `${key} must match app.config.js so prebuild cannot regress it`);
  }
});

test('the microphone string does not promise a recording feature the app does not have', () => {
  const mic = info.NSMicrophoneUsageDescription;
  assert.match(mic, /never records audio/);
  assert.doesNotMatch(mic, /record a video|if you choose/i);
});

test('no Face ID purpose string: the app never uses biometrics', () => {
  assert.equal(info.NSFaceIDUsageDescription, undefined);
  assert.match(appConfig, /\['expo-secure-store', \{ faceIDPermission: false \}\]/);
  assert.doesNotMatch(appConfig, /NSFaceIDUsageDescription:/);
});

test('share sheets can save images: the add-to-Photos purpose string names the real path', () => {
  // The only write to Photos is the system share sheet's Save Image on the
  // captured flex cards (Share Studio) and ride cards. iOS asks with this string.
  assert.match(info.NSPhotoLibraryAddUsageDescription, /Save Image in the share sheet/);
  const src = read;
  // Both through the grown-up gate (services/external).
  assert.match(src('src/share/capture.ts'), /shareExternal\(\{ url: uri \}\)/);
  assert.match(src('src/share/capture.ts'), /shareFileExternal\(uri/);
  assert.match(src('src/components/RideTracker/ShareableRideCard.tsx'), /from 'expo-sharing'/);
});

test('the camera string leads with AR, the camera use that exists regardless of the games pool', () => {
  assert.match(info.NSCameraUsageDescription, /^Theme Park Shark uses the camera to show your coins and pins/);
});

test('OTA runtime is fingerprint based on both the native and config side', () => {
  assert.equal(expoPlist.EXUpdatesRuntimeVersion, 'file:fingerprint');
  assert.equal(expoPlist.EXUpdatesCheckOnLaunch, 'ALWAYS');
  assert.equal(expoPlist.EXUpdatesLaunchWaitMs, 0);
  assert.match(appConfig, /runtimeVersion: process\.env\.TPS_INTERNAL_TUNNEL_BUILD === '1' \? 'internal-tunnel-1\.6\.0' : \{ policy: 'fingerprint' \}/);
  assert.doesNotMatch(appConfig, /runtimeVersion: '/); // store builds never pin a static runtime
  assert.doesNotMatch(appConfig, /bitcode/);
  assert.doesNotMatch(appConfig, /buildNumber/);
});

test('privacy manifest declares what the app collects and no tracking', () => {
  assert.equal(privacy.NSPrivacyTracking, false);
  const collected = new Map(privacy.NSPrivacyCollectedDataTypes.map(t => [t.NSPrivacyCollectedDataType.replace('NSPrivacyCollectedDataType', ''), t]));
  for (const kind of ['PreciseLocation', 'EmailAddress', 'UserID', 'DeviceID', 'PurchaseHistory', 'GameplayContent', 'CrashData', 'ProductInteraction']) {
    assert.ok(collected.has(kind), `${kind} not declared`);
    assert.equal(collected.get(kind).NSPrivacyCollectedDataTypeTracking, false, kind);
    assert.ok(collected.get(kind).NSPrivacyCollectedDataTypePurposes.length > 0, kind);
  }
  assert.ok(privacy.NSPrivacyAccessedAPITypes.length >= 4, 'required-reason API entries are kept');
});

test('the launch screen is the brand splash art on brand blue, never a black frame', () => {
  const storyboard = read('ios/ThemeParkShark/SplashScreen.storyboard');
  assert.match(storyboard, /image="SplashScreenLogo" contentMode="scaleAspectFill"/);
  assert.match(storyboard, /blue="0\.72549019607843" green="0\.40784313725490" red="0\.02745098039216"/);
  const catalog = JSON.parse(read('ios/ThemeParkShark/Images.xcassets/SplashScreenLogo.imageset/Contents.json'));
  assert.deepEqual(catalog.images.map(i => i.filename), ['splash.jpg']);
  // The old launch image was a 1000x2164 solid black PNG; the art is 1080 wide.
  assert.equal(jpegWidth('ios/ThemeParkShark/Images.xcassets/SplashScreenLogo.imageset/splash.jpg'), 1080);
  assert.match(appConfig, /backgroundColor: '#0768B9'/);
});

test('native splash is held until the first JS frame and released once', async () => {
  const calls = [];
  let timer = null;
  const splash = loadTs('src/nativeSplash.ts', {
    'expo-splash-screen': {
      setOptions: options => calls.push(['setOptions', options.fade]),
      preventAutoHideAsync: async () => { calls.push(['prevent']); return true; },
      hideAsync: async () => { calls.push(['hide']); },
    },
  }, {
    setTimeout: (fn, ms) => { timer = { fn, ms }; return 1; },
    clearTimeout: () => { calls.push(['clearSafety']); },
  });
  splash.holdNativeSplash();
  splash.holdNativeSplash();
  assert.deepEqual(calls, [['setOptions', true], ['prevent']]);
  assert.equal(timer.ms, splash.NATIVE_SPLASH_SAFETY_MS);
  splash.releaseNativeSplash();
  splash.releaseNativeSplash();
  timer.fn();
  assert.deepEqual(calls.slice(2), [['clearSafety'], ['hide']]);
});

test('App holds the splash at module scope and Root releases it once fonts settle', () => {
  const app = read('App.tsx');
  assert.ok(app.indexOf('holdNativeSplash();') < app.indexOf('export default function App'));
  const rootSource = read('src/Root.tsx');
  assert.match(rootSource, /if \(fontsLoaded\) releaseNativeSplash\(\)/);
  assert.match(rootSource, /fontsReady \|\| !!fontError/);
});
