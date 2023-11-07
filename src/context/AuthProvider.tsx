import { AppleAuthenticationCredential } from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-storage';
import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import client from '../api/client';
import login from '../api/endpoints/auth/login';
import getMe from '../api/endpoints/me/me';
import { InventoryType } from '../models/inventory-type';
import { UserType } from '../models/user-type';

export interface AuthContextType {
  readonly inventory: InventoryType | null;
  readonly isReady: boolean;
  readonly login: (credential: AppleAuthenticationCredential) => void;
  readonly logout: () => void;
  readonly setInventory: (inventory: InventoryType) => void;
  readonly setUser: (user: UserType) => void;
  readonly refreshUser: () => void;
  readonly user: UserType | null;
}

export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserType | null>(null);
  const [inventory, setInventory] = useState<InventoryType | null>(null);
  const [token, setToken] = useState<string>('');
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    const { headers } = client.defaults;
    headers.common.Authorization = `Bearer ${token}`;

    if (token) {
      setIsReady(true);
    }
  }, [token]);

  useEffect(() => {
    SecureStore.getItemAsync('token').then((_token) => {
      if (_token) {
        setToken(_token);
      }
    });
  }, []);

  const requestLogin = async (credential: AppleAuthenticationCredential) => {
    try {
      const response = await login(credential);
      setToken(response.token);

      await SecureStore.setItemAsync('token', response.token);
      await refreshUser();
    } catch (error) {
      console.log(error);
    }
  };

  const refreshUser = async () => {
    const response = await getMe();
    setUser(response);

    Storage.setItem({
      key: 'user',
      value: JSON.stringify({ ...response }),
    });
  };

  const logout = async () => {
    await Storage.removeItem({ key: 'user' });
    await SecureStore.deleteItemAsync('token');
    setToken('');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        refreshUser,
        setUser,
        login: requestLogin,
        logout,
        inventory,
        setInventory,
        isReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
