import { createContext, FC, ReactNode, useContext, useEffect } from 'react';
import { useQueueState } from 'rooks';
import { Pusher, PusherEvent } from '@pusher/pusher-websocket-react-native';
import { AuthContext } from './AuthProvider';

export interface BroadcastType {
  readonly message: string;
  readonly id: string;
  readonly type: string;
}

export interface BroadcastContextType {
  readonly activeBroadcast: BroadcastType | null;
}

export const BroadcastContext = createContext<BroadcastContextType>(
  {} as BroadcastContextType
);

export const BroadcastProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useContext(AuthContext);
  const [list, { peek, enqueue, dequeue }] = useQueueState<BroadcastType[]>([]);
  const pusher = Pusher.getInstance();

  useEffect(() => {
    (async () => {
      if (!user) {
        return;
      }


    })();
  }, [user]);

  useEffect(() => {
    if (!list.length) {
      return;
    }

    const interval = setInterval(() => {
      dequeue();
    }, 5000);

    return () => clearInterval(interval);
  }, [list]);

  return (
    <BroadcastContext.Provider
      value={{
        activeBroadcast: !!peek() ? peek()[0] : null,
      }}
    >
      {children}
    </BroadcastContext.Provider>
  );
};
