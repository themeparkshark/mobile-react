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
const PURPOSE_STRINGS = {
  NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
  NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS,
  NSLocationAlwaysUsageDescription: LOCATION_ALWAYS,
  NSCameraUsageDescription:
    'Theme Park Shark uses the camera for ride photo challenges and to show your coins and pins in the world around you. Photos stay on your phone unless you share them.',
  NSMicrophoneUsageDescription:
    'Theme Park Shark never records audio. Your microphone stays off during ride photos, games and everything else in the app.',
  NSMotionUsageDescription:
    'Theme Park Shark uses motion so your 3D coins and pins tilt as you move your phone.',
  NSPhotoLibraryAddUsageDescription:
    'Theme Park Shark saves the park day and ride cards you choose to keep to your Photos.',
  NSFaceIDUsageDescription:
    'Theme Park Shark keeps your sign-in in the iOS Keychain and does not use Face ID to unlock it.',
};

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.6.0',
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
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/aaf6495c-456b-4fbd-afb5-d429c1472ddb',
    // One check per cold start, downloaded in the background and applied on
    // the next cold start. No in-session reloads.
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
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
    ['expo-secure-store', { faceIDPermission: PURPOSE_STRINGS.NSFaceIDUsageDescription }],
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
