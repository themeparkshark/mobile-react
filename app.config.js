import 'dotenv/config';

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.5.0',
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
    buildNumber: '20260208.3',
    bitcode: 'Debug',
    usesAppleSignIn: true,
    bundleIdentifier: 'com.themeparkshark.app',
    infoPlist: {
      UIBackgroundModes: ['location'],
      NSLocationWhenInUseUsageDescription:
        "Theme Park Shark requires your mobile device's location permissions to be enabled in order to find tasks and other redeemables near you.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Theme Park Shark tracks your rides automatically while you enjoy the park.',
      NSLocationAlwaysUsageDescription:
        'Theme Park Shark tracks your rides automatically while you enjoy the park.',
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
          'Theme Park Shark tracks your rides automatically while you enjoy the park.',
        locationAlwaysPermission:
          'Theme Park Shark tracks your rides automatically while you enjoy the park.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  scheme: 'mobile-react',
};
