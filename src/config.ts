import Constants from 'expo-constants';

const config = {
  // EXPO_PUBLIC_API_URL is inlined at bundle time, so a dev build can target a
  // local backend without a native rebuild (the baked-in expoConfig can't change).
  apiUrl: process.env.EXPO_PUBLIC_API_URL || Constants?.expoConfig?.extra?.apiUrl,
  primary: '#09268f',
  secondary: '#00a5f5',
  tertiary: '#fec90e',
  lightBlue: '#dbf1ff',
  red: '#ff0000',
};

export default config;
