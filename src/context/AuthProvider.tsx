import * as SecureStore from 'expo-secure-store';
import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import client from '../api/client';
import login from '../api/endpoints/auth/login';
import getMe from '../api/endpoints/me/me';
import Storage from 'expo-storage';
import { UserType } from '../models/user-type';
import { InventoryType } from '../models/inventory-type';

export interface AuthContextType {
  readonly inventory: InventoryType;
  readonly isReady: () => void;
  readonly login: () => void;
  readonly logout: () => void;
  readonly setInventory: (inventory: InventoryType) => void;
  readonly setUser: () => void;
  readonly updateUser: () => void;
  readonly user: UserType;
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

  const requestLogin = async (credential: {
    readonly identityToken: string;
    readonly user: string;
  }) => {
    try {
      const response = await login(credential);
      setToken(response.token);

      await SecureStore.setItemAsync('token', response.token);
      await updateUser();
    } catch (error) {
      console.log(error);
    }
  };

  const updateUser = () => {
    getMe()
      .then((_user) => {
        setUser(_user);

        Storage.setItem({
          key: 'user',
          value: JSON.stringify({ ..._user }),
        });
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const logout = async () => {
    try {
      await Storage.removeItem({ key: 'user' });
      await SecureStore.deleteItemAsync('token');
      setUser(null);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        updateUser,
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
