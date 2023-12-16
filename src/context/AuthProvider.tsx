import { AppleAuthenticationCredential } from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-storage';
import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import { useAsyncEffect, useTimeoutWhen } from 'rooks';
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
  const [player, setPlayer] = useState<PlayerType | null>(null);
  const [token, setToken] = useState<string>('');
  const [isReady, setIsReady] = useState<boolean>(false);

  useAsyncEffect(async () => {
    const { headers } = client.defaults;
    headers.common.Authorization = `Bearer ${token}`;

    if (token) {
      setIsReady(true);
      await refreshPlayer();
      RootNavigation.navigate('Loading');
    }
  }, [token]);

  useTimeoutWhen(
    () => {
      RootNavigation.navigate('Welcome');
    },
    5000,
    Boolean(player && !player.username)
  );

  useEffect(() => {
    SecureStore.getItemAsync('token').then((_token) => {
      if (_token) {
        setToken(_token);
      }
    });
  }, []);

  const requestLogin = async (credential: AppleAuthenticationCredential) => {
    try {
      const response = await login({
        user: credential.user,
        identity_token: credential.identityToken ?? '',
      });
      setToken(response.token);

      await SecureStore.setItemAsync('token', response.token);
    } catch (error) {
      console.log(error);
    }
  };

  const refreshPlayer = async (): Promise<PlayerType> => {
    const response = await getMe();
    setPlayer(response);

    Storage.setItem({
      key: 'player',
      value: JSON.stringify({ ...response }),
    });

    return response;
  };

  const logout = async () => {
    RootNavigation.navigate('Login');
    await Storage.removeItem({ key: 'player' });
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
