import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { resolveApiUrl } from './apiTarget';

const config = {
  // Development: EXPO_PUBLIC_API_URL is inlined at bundle time so a dev build
  // can target a local backend without a native rebuild. Store builds use the
  // fixed URL for their EAS channel (see apiTarget.ts).
  apiUrl: resolveApiUrl({
    isDev: __DEV__,
    channel: Updates.channel,
    publicEnvUrl: process.env.EXPO_PUBLIC_API_URL,
    bakedUrl: Constants?.expoConfig?.extra?.apiUrl,
  }),
  primary: '#09268f',
  secondary: '#00a5f5',
  tertiary: '#fec90e',
  lightBlue: '#dbf1ff',
  red: '#ff0000',
};

export default config;
