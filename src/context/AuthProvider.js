import React, { createContext, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import login from '../api/endpoints/auth/login';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        error,
        isLoading,
        login: (email, password) => {
          setIsLoading(true);
          login(email, password).then((response) => {
              const userResponse = {
                token: response.data.token,
                id: response.data.user.id,
                username: response.data.user.username,
                email: response.data.user.email,
              };

              setUser(userResponse);
              setError(null);
              SecureStore.setItemAsync('user', JSON.stringify(userResponse));
              setIsLoading(false);
            })
            .catch(error => {
              console.log(error.response);
              const key = Object.keys(error.response.data.errors)[0];
              setError(error.response.data.errors[key][0]);
              setIsLoading(false);
            });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
