import 'dotenv/config';

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.0.18',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  owner: 'theme-park-shark',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#ffffff',
  },
  updates: {
    fallbackToCacheTimeout: 0,
    url: 'https://u.expo.dev/38c3f46e-df32-43a2-8272-44b9556aaa36',
  },
  runtimeVersion: {
    policy: 'sdkVersion',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    buildNumber: '20231006',
    bitcode: 'Debug',
    usesAppleSignIn: true,
    bundleIdentifier: 'com.tomhartley97.mobile-react',
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
      projectId: '38c3f46e-df32-43a2-8272-44b9556aaa36',
    },
    pusherKey: process.env.PUSHER_KEY,
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
