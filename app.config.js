export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  owner: 'theme-park-shark',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
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
    eas: {
      projectId: '38c3f46e-df32-43a2-8272-44b9556aaa36',
    },
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '13.0',
        },
      },
    ],
  ],
};
