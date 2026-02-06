import 'dotenv/config';

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.4.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#ffffff',
  },
  runtimeVersion: '1.4.0',
  updates: {
    url: 'https://u.expo.dev/aaf6495c-456b-4fbd-afb5-d429c1472ddb',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    buildNumber: '20260205.1',
    bitcode: 'Debug',
    usesAppleSignIn: true,
    bundleIdentifier: 'com.themeparkshark.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Theme Park Shark requires your mobile device's location permissions to be enabled in order to find tasks and other redeemables near you.",
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
  ],
  scheme: 'mobile-react',
};
