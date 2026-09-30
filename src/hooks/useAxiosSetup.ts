import { AxiosError, AxiosResponse } from 'axios';
import { useContext, useEffect, useRef } from 'react';
import client from '../api/client';
import { AuthContext } from '../context/AuthProvider';
import { BroadcastContext } from '../context/BroadcastProvider';
import { showToast } from '../utils/toast';

/** Consecutive server-error counter: only toast after 3 in a row. */
let consecutive500Count = 0;

export const SERVER_TROUBLE_TOAST = 'The Shark servers are busy. Hang tight and try again in a moment.';

/**
 * Global response handling: broadcasts, sign-out on 401 and a single
 * server-trouble toast. Being offline is shown by OfflineBanner, not a toast.
 *
 * The interceptor is registered once. The latest enqueue/logout are read
 * through refs so a re-created context callback is never stale.
 */
export const useAxiosSetup = () => {
  const { enqueue } = useContext(BroadcastContext);
  const { logout } = useContext(AuthContext);
  const enqueueRef = useRef(enqueue);
  const logoutRef = useRef(logout);
  enqueueRef.current = enqueue;
  logoutRef.current = logout;

  useEffect(() => {
    const interceptorId = client.interceptors.response.use(
      (response: AxiosResponse) => {
        consecutive500Count = 0;
        if (response.data && Array.isArray(response.data.broadcasts)) {
          enqueueRef.current(response.data.broadcasts);
        }
        return response;
      },
      (error: AxiosError) => {
        const status = error?.response?.status;
        if (status === 401) {
          logoutRef.current();
        }
        if (status && status >= 500) {
          consecutive500Count += 1;
          if (consecutive500Count === 3) {
            showToast(SERVER_TROUBLE_TOAST, 'warning');
          }
        } else if (status) {
          consecutive500Count = 0;
        }
        return Promise.reject(error);
      }
    );

    return () => {
      client.interceptors.response.eject(interceptorId);
    };
  }, []);
};
