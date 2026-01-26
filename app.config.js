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
  runtimeVersion: {
    policy: 'sdkVersion',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    buildNumber: '20231218.4',
    bitcode: 'Debug',
    usesAppleSignIn: true,
    bundleIdentifier: 'com.dustinsparage.themeparkshark',
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
  ],
  scheme: 'mobile-react',
};
