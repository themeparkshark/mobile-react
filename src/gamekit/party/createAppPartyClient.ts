/**
 * Production wiring for Line Party: the app's own API client (Sanctum bearer
 * token set by AuthProvider), AsyncStorage for an in-flight submit, AppState
 * for "phone went away" (the ghost takes the seat), and Reverb from the
 * EXPO_PUBLIC_REVERB_* bundle settings. Without those settings the party runs
 * over HTTP polling, which is slower but complete.
 *
 *   const party = useMemo(() => createAppPartyClient(player.id), [player.id]);
 *   <LineParty client={party} rideId={ride.id} onExit={close} />
 */
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../api/client';
import { PartyClient, type HttpLike } from '../net/PartyClient';
import { createReverbSocket, reverbConfigFromEnv } from '../net/reverbSocket';

export function appReverbConfig() {
  // Literal process.env reads so Expo inlines them at bundle time.
  return reverbConfigFromEnv({
    EXPO_PUBLIC_REVERB_KEY: process.env.EXPO_PUBLIC_REVERB_KEY,
    EXPO_PUBLIC_REVERB_HOST: process.env.EXPO_PUBLIC_REVERB_HOST,
    EXPO_PUBLIC_REVERB_PORT: process.env.EXPO_PUBLIC_REVERB_PORT,
    EXPO_PUBLIC_REVERB_SCHEME: process.env.EXPO_PUBLIC_REVERB_SCHEME,
  });
}

export function createAppPartyClient(userId: number, http: HttpLike = apiClient): PartyClient {
  const reverb = appReverbConfig();
  return new PartyClient({
    http,
    userId,
    createSocket: reverb ? (authorize) => createReverbSocket(reverb, authorize) : undefined,
    storage: AsyncStorage,
    appState: AppState,
    log: __DEV__ ? (m, d) => console.log(`[party] ${m}`, d ?? '') : undefined,
  });
}
