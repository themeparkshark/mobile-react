import { createContext, FC, ReactNode, useContext, useEffect } from 'react';
import { useQueueState, useIntervalWhen } from 'rooks';
import { Pusher, PusherEvent } from '@pusher/pusher-websocket-react-native';
import { AuthContext } from './AuthProvider';
import client from '../api/client';

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

  useEffect(() => {
    if (!isReady) {
      return;
    }

    (async () => {
      await pusher.init({
        apiKey: 'fa6a1b978c66821f97dc',
        cluster: 'mt1',
        onAuthorizer: async (channelName, socketId) => {
          const { data } = await client.post('/broadcasting/auth', {
            channel_name: channelName,
            socket_id: socketId,
          });

          return data;
        },
      });

      await pusher.connect();
      await pusher.subscribe({
        channelName: `private-App.Models.User.${user.id}`,
        onEvent: (event: PusherEvent) => {
          enqueue(JSON.parse(event.data).message);
        },
      });
    })();
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
