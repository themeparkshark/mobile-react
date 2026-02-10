import { AxiosError, AxiosResponse } from 'axios';
import { useContext, useEffect } from 'react';
import client from '../api/client';
import { AuthContext } from '../context/AuthProvider';
import { BroadcastContext } from '../context/BroadcastProvider';
import { showToast } from '../utils/toast';

/** Consecutive 500-error counter — only toast after 3 in a row */
let consecutive500Count = 0;

/** Track whether we've already shown the offline toast (suppress duplicates) */
let offlineToastShown = false;

export const useAxiosSetup = () => {
  const { enqueue } = useContext(BroadcastContext);
  const { logout } = useContext(AuthContext);

  useEffect(() => {
    const interceptorId = client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Success — reset failure tracking
        consecutive500Count = 0;
        offlineToastShown = false;

        if (response.data && Array.isArray(response.data.broadcasts)) {
          enqueue(response.data.broadcasts);
        }

        return response;
      },
      (error: AxiosError) => {
        if (error?.response?.status === 401) {
          logout();
        }

        if (error?.response?.status && error.response.status >= 500) {
          consecutive500Count++;
          // Only show toast after 3 consecutive server errors
          if (consecutive500Count === 3) {
            showToast('Connection issue — retrying...', 'warning');
          }
        }

        // Network error (no response / timeout) — likely offline
        if (!error.response) {
          if (!offlineToastShown) {
            offlineToastShown = true;
            showToast("You're offline — showing cached data", 'info');
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      client.interceptors.response.eject(interceptorId);
    };
  }, [BroadcastContext]);
};
