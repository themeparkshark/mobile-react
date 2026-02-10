import { AppleAuthenticationCredential } from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, FC, ReactNode, useEffect, useRef, useState } from 'react';
import { useAsyncEffect } from 'rooks';
import client from '../api/client';
import login from '../api/endpoints/auth/login';
import getMe from '../api/endpoints/me/me';
import { PlayerType } from '../models/player-type';
import * as RootNavigation from '../RootNavigation';

export interface AuthContextType {
  readonly isReady: boolean;
  readonly login: (credential: AppleAuthenticationCredential) => void;
  readonly logout: () => void;
  readonly setPlayer: (player: PlayerType) => void;
  readonly refreshPlayer: () => Promise<PlayerType>;
  readonly player: PlayerType | null;
}

export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [player, setPlayer] = useState<PlayerType>(null);
  const [token, setToken] = useState<string>();
  const [isReady, setIsReady] = useState<boolean>(false);
  const hasInitialNavigated = useRef(false);

  useAsyncEffect(async () => {
    const { headers } = client.defaults;
    headers.common.Authorization = `Bearer ${token}`;

    if (token) {
      const player = await refreshPlayer();
      setIsReady(true);
      
      // Only navigate on initial token load, not on subsequent refreshes
      if (hasInitialNavigated.current) {
        return;
      }
      hasInitialNavigated.current = true;
      
      if (player) {
        if (player.username) {
          // Existing user with username - go to loading screen
          console.log('🦈 Player loaded:', player.username);
          RootNavigation.navigate('Loading');
        } else {
          // New user without username - go to welcome to set up
          console.log('🦈 New user, needs username setup');
          RootNavigation.navigate('Welcome');
        }
      } else {
        // Token is invalid/expired - clear it and go to login
        console.log('🦈 Token invalid or expired - logging out');
        await SecureStore.deleteItemAsync('token');
        await AsyncStorage.removeItem('player');
        setToken('');
        setPlayer(null);
        hasInitialNavigated.current = false; // Allow navigation on next login
        RootNavigation.navigate('Login');
      }
    }
  }, [token]);

  useEffect(() => {
    SecureStore.getItemAsync('token').then((_token) => {
      if (_token) {
        setToken(_token);
      } else {
        // No token found - user is not logged in, but auth state is ready
        console.log('🦈 No token found - user is guest or logged out');
        setIsReady(true);
      }
    });
  }, []);

  const requestLogin = async (credential: AppleAuthenticationCredential) => {
    try {
      console.log('🦈 Attempting login with Apple credential...');
      console.log('🦈 Credential user:', credential.user?.substring(0, 20) + '...');
      console.log('🦈 Credential identityToken:', credential.identityToken ? 'present' : 'missing');
      
      const response = await login(credential.user, credential.identityToken);
      console.log('🦈 Login response received:', JSON.stringify(response).substring(0, 300));
      console.log('🦈 Token in response?', !!response?.token, 'Token value:', response?.token?.substring(0, 30) + '...');
      
      if (response?.token) {
        console.log('🦈 Saving token to SecureStore...');
        await SecureStore.setItemAsync('token', response.token);
        console.log('🦈 Token saved! Setting state...');
        setToken(response.token);
        console.log('🦈 Token state updated!');
      } else {
        console.log('🦈 Login failed - no token in response. Full response:', JSON.stringify(response));
      }
    } catch (error: any) {
      console.log('🦈 Login error:', error?.message || error);
      console.log('🦈 Error response:', error?.response?.data);
    }
  };

  const refreshPlayer = async (): Promise<PlayerType> => {
    const response = await getMe();
    console.log('🦈 refreshPlayer got:', JSON.stringify(response).substring(0, 300));
    console.log('🦈 refreshPlayer username:', response?.username);
    setPlayer(response);

    await AsyncStorage.setItem('player', JSON.stringify({ ...response }));

    return response;
  };

  const logout = async () => {
    hasInitialNavigated.current = false; // Allow navigation on next login
    RootNavigation.navigate('Login');
    await AsyncStorage.removeItem('player');
    await SecureStore.deleteItemAsync('token');
    setToken('');
    setPlayer(null);
  };

  return (
    <AuthContext.Provider
      value={{
        player,
        refreshPlayer,
        setPlayer,
        login: requestLogin,
        logout,
        isReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
