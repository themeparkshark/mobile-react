import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import { useIntervalWhen, useQueueState } from 'rooks';

export interface BroadcastContextType {
  readonly activeBroadcast: string | undefined;
  readonly enqueue: (messages: string[]) => void;
}

export const BroadcastContext = createContext<BroadcastContextType>(
  {} as BroadcastContextType
);

export const BroadcastProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [list, { enqueue, dequeue, peek, length }] = useQueueState<string>([]);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (message) {
      enqueue(message);
    }
  }, [message]);

  useIntervalWhen(
    () => {
      dequeue();
    },
    5250,
    Boolean(length)
  );

  return (
    <BroadcastContext.Provider
      value={{
        activeBroadcast: peek(),
        enqueue: (messages) => {
          messages.forEach((message) => {
            setMessage(message);
          });
        },
      }}
    >
      {children}
    </BroadcastContext.Provider>
  );
};
