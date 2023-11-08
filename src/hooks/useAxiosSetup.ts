import { AxiosError, AxiosResponse } from 'axios';
import { useContext, useEffect } from 'react';
import { Alert } from 'react-native';
import client from '../api/client';
import { AuthContext } from '../context/AuthProvider';
import { BroadcastContext } from '../context/BroadcastProvider';

export const useAxiosSetup = () => {
  const { enqueue } = useContext(BroadcastContext);
  const { logout } = useContext(AuthContext);

  useEffect(() => {
    const interceptorId = client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (response.data && Array.isArray(response.data.broadcasts)) {
          enqueue(response.data.broadcasts);
        }

        return response;
      },
      (error: AxiosError) => {
        if (error?.response?.status === 401) {
          logout();
        }

        if (error?.response?.status >= 500) {
          Alert.alert(
            'Whoops! Something went wrong.',
            'Please try again or contact support.'
          );
        }

        return Promise.reject(error);
      }
    );

    return () => {
      client.interceptors.response.eject(interceptorId);
    };
  }, [BroadcastContext]);
};
