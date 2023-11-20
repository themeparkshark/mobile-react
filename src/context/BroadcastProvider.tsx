import {
  createContext,
  FC,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated } from 'react-native';
import { useIntervalWhen, useQueueState } from 'rooks';

export interface BroadcastContextType {
  readonly activeBroadcast: string | undefined;
  readonly enqueue: (messages: string[]) => void;
  readonly translate: Animated.Value;
}

export const BroadcastContext = createContext<BroadcastContextType>(
  {} as BroadcastContextType
);

export const BroadcastProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [list, { enqueue, dequeue, peek, length }] = useQueueState<string>([]);
  const [message, setMessage] = useState<string>();
  const translate = useRef(new Animated.Value(0)).current;

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

  useIntervalWhen(
    () => {
      slideUp();
    },
    5000,
    Boolean(length)
  );

  useEffect(() => {
    if (peek()) {
      slideDown();
    }
  }, [peek()]);

  const slideUp = () => {
    Animated.timing(translate, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const slideDown = () => {
    Animated.timing(translate, {
      toValue: 60,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  return (
    <BroadcastContext.Provider
      value={{
        activeBroadcast: peek(),
        enqueue: (messages) => {
          messages.forEach((message) => {
            setMessage(message);
          });
        },
        translate,
      }}
    >
      {children}
    </BroadcastContext.Provider>
  );
};
