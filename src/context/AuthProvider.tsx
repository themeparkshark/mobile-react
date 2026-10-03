import { AppleAuthenticationCredential } from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, FC, ReactNode, useEffect, useRef, useState } from 'react';
import { listenForPushTaps, refreshPushRegistration } from '../services/push';
import { useAsyncEffect } from 'rooks';
import client from '../api/client';
import login from '../api/endpoints/auth/login';
import getMe from '../api/endpoints/me/me';
import { PlayerType } from '../models/player-type';
import * as RootNavigation from '../RootNavigation';
import { clearQueueBackgroundHeartbeat } from '../services/lineplay/backgroundQueueHeartbeat';
import { clearCache } from '../utils/apiCache';
import { isStandalonePreviewMode } from '../utils/standalonePreview';

export interface AuthContextType {
  readonly isReady: boolean;
  readonly login: (credential: AppleAuthenticationCredential) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly setPlayer: (player: PlayerType) => void;
  readonly refreshPlayer: () => Promise<PlayerType>;
  /**
   * Switch to a session the server issued for another account (original
   * account recovery). Validates it first; the previous session is replaced
   * and its cached data dropped. Opens the game for the new account unless
   * navigate is false (the caller shows a celebration first).
   */
  readonly adoptSession: (token: string, options?: { readonly navigate?: boolean }) => Promise<PlayerType>;
  readonly player: PlayerType | null;
}

export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [player, setPlayer] = useState<PlayerType | null>(null);
  const [token, setToken] = useState<string>();
  const [isReady, setIsReady] = useState<boolean>(false);
  const hasInitialNavigated = useRef(false);

  useAsyncEffect(async () => {
    const { headers } = client.defaults;
    if (token) headers.common.Authorization = `Bearer ${token}`;
    else delete headers.common.Authorization;

    if (token) {
      // A newly signed-in player was already loaded before committing the token.
      if (hasInitialNavigated.current) {
        return;
      }
      try {
        const player = await refreshPlayer();
        setIsReady(true);
        hasInitialNavigated.current = true;
        if (!isStandalonePreviewMode()) RootNavigation.navigate(player.username ? 'Loading' : 'Welcome');
      } catch (error: any) {
        if (error?.response?.status === 401) {
          await logout();
          setIsReady(true);
          return;
        }
        // Preserve a previously verified profile during a temporary outage.
        const cached = await AsyncStorage.getItem('player');
        if (cached) {
          try {
            const cachedPlayer = JSON.parse(cached) as PlayerType;
            if (cachedPlayer?.id) {
              setPlayer(cachedPlayer);
              hasInitialNavigated.current = true;
              setIsReady(true);
              if (!isStandalonePreviewMode()) RootNavigation.navigate(cachedPlayer.username ? 'Loading' : 'Welcome');
              return;
            }
          } catch { /* corrupt cache; show sign-in */ }
        }
        setIsReady(true);
        if (!isStandalonePreviewMode()) RootNavigation.navigate('Login');
      }
    }
  }, [token]);

  // Keep this device's push token current once signed in, and open tapped pushes.
  useEffect(() => { if (player?.id) void refreshPushRegistration(); }, [player?.id]);
  useEffect(() => listenForPushTaps(), []);

  useEffect(() => {
    // Dev builds only: sign straight in as a local test player so the real
    // screens can be exercised against a local backend without Apple sign-in.
    const devToken = __DEV__ ? process.env.EXPO_PUBLIC_DEV_AUTH_TOKEN : undefined;
    if (devToken) {
      setToken(devToken);
      return;
    }
    SecureStore.getItemAsync('token').then((_token) => {
      if (_token) {
        setToken(_token);
      } else {
        // No token found - user is not logged in, but auth state is ready
        setIsReady(true);
      }
    }).catch(() => {
      // A failed keychain read should still let the guest reach sign-in.
      setIsReady(true);
    });
  }, []);

  const requestLogin = async (credential: AppleAuthenticationCredential) => {
    if (!credential.user || !credential.identityToken) {
      throw new Error('Apple sign-in did not return a credential.');
    }

    // A build can outlive its API DNS target. Check a public app-specific
    // response before sending an Apple identity token to that target.
    const apiCheck = await client.get('/crumbs', { timeout: 10000 });
    if (!apiCheck.data?.data?.labels || !apiCheck.data?.data?.errors) {
      throw new Error('Theme Park Shark sign-in service is unavailable.');
    }

    // The authorization code lets the server keep an Apple refresh token, so a
    // later account deletion can revoke this app's Sign in with Apple grant.
    const response = await login(credential.user, credential.identityToken, credential.authorizationCode);
    // Validate the session before saving it. A server outage must leave the
    // sign-in screen with an actionable error, not an unusable saved token.
    const signedInPlayer = await getMe({ token: response.token, throwOnError: true });
    if (!signedInPlayer) {
      throw new Error('Sign-in did not return a player profile.');
    }

    let tokenSaved = false;
    try {
      await SecureStore.setItemAsync('token', response.token);
      tokenSaved = true;
      await AsyncStorage.setItem('player', JSON.stringify(signedInPlayer));
    } catch (error) {
      if (tokenSaved) {
        await SecureStore.deleteItemAsync('token');
      }
      throw error;
    }

    client.defaults.headers.common.Authorization = `Bearer ${response.token}`;
    hasInitialNavigated.current = true;
    setPlayer(signedInPlayer);
    setToken(response.token);
    setIsReady(true);
    RootNavigation.navigate(signedInPlayer.username ? 'Loading' : 'Welcome');
  };

  const adoptSession = async (nextToken: string, options: { readonly navigate?: boolean } = {}): Promise<PlayerType> => {
    if (!nextToken.trim()) throw new Error('No session to switch to.');
    const adopted = await getMe({ token: nextToken, throwOnError: true });
    if (!adopted) throw new Error('Sign-in did not return a player profile.');

    // The old session's account no longer exists: drop what was cached for it.
    await clearCache().catch(() => undefined);
    await SecureStore.setItemAsync('token', nextToken);
    await AsyncStorage.setItem('player', JSON.stringify(adopted)).catch(() => undefined);

    client.defaults.headers.common.Authorization = `Bearer ${nextToken}`;
    hasInitialNavigated.current = true;
    setPlayer(adopted);
    setToken(nextToken);
    setIsReady(true);
    if (options.navigate !== false && !isStandalonePreviewMode()) {
      RootNavigation.navigate(adopted.username ? 'Loading' : 'Welcome');
    }
    return adopted;
  };

  const refreshPlayer = async (): Promise<PlayerType> => {
    const response = await getMe({ throwOnError: true });
    if (!response) throw new Error('Player profile is unavailable.');
    setPlayer(response);

    await AsyncStorage.setItem('player', JSON.stringify(response));

    return response;
  };

  const logout = async () => {
    // Friend answers and hearts belong to this player only.
    try { require('../screens/social/socialStore').resetSocialStore(); } catch { /* not loaded */ }
    hasInitialNavigated.current = false; // Allow navigation on next login
    delete client.defaults.headers.common.Authorization;
    setToken(undefined);
    setPlayer(null);
    setIsReady(true);
    await clearQueueBackgroundHeartbeat().catch(error =>
      console.warn('Could not stop queue background tracking:', error));
    await Promise.all([
      AsyncStorage.removeItem('player'),
      SecureStore.deleteItemAsync('token'),
      clearCache(),
    ]);
    RootNavigation.navigate('Login');
  };

  return (
    <AuthContext.Provider
      value={{
        player,
        refreshPlayer,
        setPlayer,
        login: requestLogin,
        adoptSession,
        logout,
        isReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
