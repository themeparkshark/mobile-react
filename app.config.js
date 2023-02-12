import 'dotenv/config';

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.0.8',
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
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    bitcode: 'Debug',
    usesAppleSignIn: true,
    bundleIdentifier: 'com.tomhartley97.mobile-react',
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
};
