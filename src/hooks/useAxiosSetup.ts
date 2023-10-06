import { useContext, useEffect } from 'react';
import { BroadcastContext } from '../context/BroadcastProvider';
import { AxiosError, AxiosResponse } from "axios";
import client from "../api/client";

export const useAxiosSetup = () => {
  const { enqueue } = useContext(BroadcastContext);

  useEffect(() => {
    const interceptorId = client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (response.data && Array.isArray(response.data.broadcasts)) {
          enqueue(response.data.broadcasts);
        }

        return response;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    return () => {
      client.interceptors.response.eject(interceptorId);
    };
  }, [BroadcastContext]);
};
