import 'dotenv/config';

export default {
  name: 'Theme Park Shark',
  slug: 'mobile-react',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
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
    usesAppleSignIn: true,
    bundleIdentifier: 'com.tomhartley97.mobile-react',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    apiBaseUrl: process.env.API_BASE_URL,
    cmsBaseUrl: process.env.CMS_API_BASE_URL,
  },
};
