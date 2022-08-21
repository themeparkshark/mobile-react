import * as SecureStore from 'expo-secure-store';
import { createContext, useEffect, useState } from 'react';
import client from '../api/client';
import login from '../api/endpoints/auth/login';
import getMe from '../api/endpoints/me/me';
import Storage from 'expo-storage';

export const AuthContext = createContext({
  user: null,
  updateUser: () => { },
  login: () => { },
  logout: () => { },
  inventory: null,
  setInventory: () => { },
  setUser: () => { }
})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [token, setToken] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const { headers } = client.defaults;
    headers.common.Authorization = `Bearer ${token}`;

    if (token) {
      setIsReady(true);
    }
  }, [token]);

  useEffect(() => {
    SecureStore.getItemAsync('token').then(_token => {
      if (_token) {
        setToken(_token);
      }
    });
  }, []);

  const requestLogin = async (credential) => {
    try {
      const response = await login(credential);
      setToken(response.token);

      await SecureStore.setItemAsync('token', response.token);
      await updateUser();
    } catch (error) {
      console.log(error);
    }
  }

  const updateUser = () => {
    getMe().then((_user) => {
      setUser(_user);

      Storage.setItem({
        key: 'user',
        value: JSON.stringify({ ..._user })
      });
    }).catch(error => {
      console.log(error);
    })
  }

  const logout = async () => {
    try {
      await Storage.removeItem({ key: 'user' })
      await SecureStore.deleteItemAsync('token');
      setUser(null);
    } catch (error) {
      console.log(error);
    }
  }

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
