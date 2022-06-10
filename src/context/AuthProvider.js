import * as SecureStore from 'expo-secure-store';
import { createContext, useEffect, useState } from 'react';
import client from '../api/client';
import login from '../api/endpoints/auth/login';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const { headers } = client.defaults;
    headers.common.Authorization = `Bearer ${user?.token}`;
  }, [user?.token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        login: (credential) => {
          login(credential)
            .then((response) => {
              const userResponse = {
                token: response.token,
                id: response.user.id,
                username: response.user.username,
                email: response.user.email,
              };

              setUser(userResponse);
              SecureStore.setItemAsync('user', JSON.stringify(userResponse));
            })
            .catch((error) => {
              console.log(error);
            });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
