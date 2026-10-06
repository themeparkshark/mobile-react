import 'dotenv/config';
import withTpsNativeInvariants, { assertPrebuildAllowed } from './plugins/withTpsNativeInvariants';
import privacyManifest from './plugins/privacy-manifest.json';

// `expo prebuild --clean` would delete the LinePlayWidget target. See RELEASE.md.
assertPrebuildAllowed();

// Purpose strings shown by iOS permission prompts. They must describe what
// Theme Park Shark actually does; ios/ThemeParkShark/Info.plist mirrors them
// (tools/tests/release-native-config.test.cjs keeps the two in sync).
const LOCATION_WHEN_IN_USE =
  'Theme Park Shark uses your location to show nearby collectibles at home, the rides around you in the park, and the queue games for the line you are in.';
const LOCATION_ALWAYS =
  'Theme Park Shark uses your location in the background to notice the rides you go on and keep your queue games in sync while your phone is locked.';
// AdMob (rewarded ads, opt-in). Google's sample app ids until Dustin's AdMob
// app exists (tps-prime-time-audit/monetization/SETUP.md); mirrored in
// ios/ThemeParkShark/Info.plist and src/services/adConfig.ts (a test keeps the
// three equal). No tracking usage string: ads are non-personalized,
// so there is no App Tracking Transparency prompt and no IDFA.
const ADMOB_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const ADMOB_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
// Google's own SKAdNetwork id (install attribution without the IDFA).
const ADMOB_SKADNETWORK_ITEMS = ['cstr6suwn9.skadnetwork'];

const PURPOSE_STRINGS = {
  NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
  NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS,
  NSLocationAlwaysUsageDescription: LOCATION_ALWAYS,
  NSCameraUsageDescription:
    'Theme Park Shark uses the camera to show your coins and pins in the world around you, and for a ride photo when a game asks for one. Photos stay on your phone unless you share them.',
  // Kept only because expo-camera links AVCaptureDevice audio capture
  // (CameraPermissionsRequester.swift, CameraView.swift), which App Store
  // Connect's binary scan flags as ITMS-90683 when this key is missing. The app
  // never asks for the microphone, so players never see this string.
  NSMicrophoneUsageDescription:
    'Theme Park Shark never records audio and never turns on your microphone. The camera features take still photos only.',
  NSMotionUsageDescription:
    'Theme Park Shark uses motion so your 3D coins and pins tilt as you move your phone.',
  NSPhotoLibraryAddUsageDescription:
    'Theme Park Shark saves a park day or ride card to your Photos when you tap Save Image in the share sheet.',
};

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.7.2',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  // Matches ios/Podfile.properties.json; without it prebuild turns Fabric off.
  newArchEnabled: true,
  splash: {
    image: './assets/images/splash-bg.png',
    resizeMode: 'cover',
    backgroundColor: '#0768B9',
  },
  // Fingerprint runtime: an OTA update only reaches binaries whose native
  // code matches the JS it was built against. The native side reads the
  // build-time fingerprint (Expo.plist EXUpdatesRuntimeVersion file:fingerprint).
  // Store builds use the fingerprint policy. The internal tester profile (EAS
  // "internal-tunnel") pins a fixed label: EAS installs pods and rewrites the
  // bare ios/ project before CONFIGURE_EXPO_UPDATES, so a local fingerprint can
  // never match there, and these builds never receive OTA updates anyway.
  runtimeVersion: process.env.TPS_INTERNAL_TUNNEL_BUILD === '1' ? 'internal-tunnel-1.6.0' : { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/aaf6495c-456b-4fbd-afb5-d429c1472ddb',
    // One check per cold start, downloaded in the background and applied on
    // the next cold start. No in-session reloads.
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    // Set only while tools/publish-update.cjs exports a store OTA: just the
    // media changed since that binary's build (the rest is embedded), which
    // keeps updates under EAS's 1000-asset cap. Unset for builds/fingerprints.
    ...(process.env.TPS_OTA_ASSET_PATTERNS
      ? { assetPatternsToBeBundled: JSON.parse(process.env.TPS_OTA_ASSET_PATTERNS) }
      : {}),
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    // Build numbers are managed remotely by EAS (appVersionSource: remote).
    usesAppleSignIn: true,
    bundleIdentifier: 'com.themeparkshark.app',
    // Same data as ios/ThemeParkShark/PrivacyInfo.xcprivacy, so prebuild keeps it.
    privacyManifests: privacyManifest,
    infoPlist: {
      UIBackgroundModes: ['location'],
      ...PURPOSE_STRINGS,
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    apiUrl: process.env.API_URL,
    eas: {
      projectId: 'aaf6495c-456b-4fbd-afb5-d429c1472ddb',
    },
  },
  // withTpsNativeInvariants is first so its mods run last. The
  // @maplibre/maplibre-react-native plugin is intentionally absent: it moves
  // MapLibre to SPM, which breaks App Store archives (see the plugin file).
  plugins: [
    withTpsNativeInvariants,
    'expo-notifications',
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.0',
        },
      },
    ],
    [
      'react-native-google-mobile-ads',
      {
        iosAppId: ADMOB_IOS_APP_ID,
        androidAppId: ADMOB_ANDROID_APP_ID,
        skAdNetworkItems: ADMOB_SKADNETWORK_ITEMS,
        delayAppMeasurementInit: true,
      },
    ],
    // The app never uses biometrics, so no Face ID purpose string at all.
    ['expo-secure-store', { faceIDPermission: false }],
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
        locationAlwaysPermission: LOCATION_ALWAYS,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  // themeparkshark:// is the public scheme for Instagram Shark Drop links.
  scheme: ['mobile-react', 'themeparkshark'],
};
