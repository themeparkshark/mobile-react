import { Pusher, PusherEvent } from '@pusher/pusher-websocket-react-native';
import { delay } from 'lodash';
import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAsyncEffect, useIntervalWhen, useQueueState } from 'rooks';
import client from '../api/client';
import { AuthContext } from './AuthProvider';

export interface BroadcastContextType {
  readonly activeBroadcast: string | undefined;
}

export const BroadcastContext = createContext<BroadcastContextType>(
  {} as BroadcastContextType
);

export const BroadcastProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [list, { enqueue, dequeue, peek, length }] = useQueueState<string>([]);
  const { user, isReady } = useContext(AuthContext);
  const pusher = Pusher.getInstance();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (message) {
      enqueue(message);
    }
  }, [message]);

  useAsyncEffect(async () => {
    if (!isReady) {
      return;
    }

    console.log(process.env);

    await pusher.init({
      apiKey: process.env.PUSHER_KEY ?? '',
      cluster: 'mt1',
      onAuthorizer: async (channelName, socketId) => {
        const { data } = await client.post('/broadcasting/auth', {
          channel_name: channelName,
          socket_id: socketId,
        });

        console.log(data);

        return data;
      },
    });

    await pusher.connect();
    await pusher.subscribe({
      channelName: `private-App.Models.User.${user.id}`,
      onEvent: (event: PusherEvent) => {
        delay(() => {
          setMessage(JSON.parse(event.data).message);
        }, 1000);
      },
    });
  }, [isReady]);

  useIntervalWhen(
    () => {
      dequeue();
    },
    5250,
    !!length
  );

  return (
    <BroadcastContext.Provider
      value={{
        activeBroadcast: peek(),
      }}
    >
      {children}
    </BroadcastContext.Provider>
  );
};
