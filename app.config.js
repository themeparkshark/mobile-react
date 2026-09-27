import 'dotenv/config';

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.6.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#ffffff',
  },
  runtimeVersion: '1.5.0',
  updates: {
    url: 'https://u.expo.dev/aaf6495c-456b-4fbd-afb5-d429c1472ddb',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    buildNumber: '20260926.2',
    bitcode: 'Debug',
    usesAppleSignIn: true,
    bundleIdentifier: 'com.themeparkshark.app',
    infoPlist: {
      UIBackgroundModes: ['location'],
      NSLocationWhenInUseUsageDescription:
        'Theme Park Shark uses your location to show nearby home collectibles, park rides, and queue activities.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Theme Park Shark uses your location in the background to detect nearby rides and keep LinePlay queue progress accurate while your phone is locked.',
      NSLocationAlwaysUsageDescription:
        'Theme Park Shark uses your location in the background to detect nearby rides and keep LinePlay queue progress accurate while your phone is locked.',
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
  plugins: [
    '@maplibre/maplibre-react-native',
    'expo-notifications',
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.0',
        },
      },
    ],
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Theme Park Shark uses your location in the background to detect nearby rides and keep LinePlay queue progress accurate while your phone is locked.',
        locationAlwaysPermission:
          'Theme Park Shark uses your location in the background to detect nearby rides and keep LinePlay queue progress accurate while your phone is locked.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  // themeparkshark:// is the public scheme for Instagram Shark Drop links.
  scheme: ['mobile-react', 'themeparkshark'],
};
