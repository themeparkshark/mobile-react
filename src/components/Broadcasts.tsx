import { delay } from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Text, View } from 'react-native';
import { useIntervalWhen, useQueueState } from 'rooks';

export default function Broadcasts() {
  const translate = useRef(new Animated.Value(0)).current;
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
    !!length
  );

  useEffect(() => {
    const messages = [
      'You completed the Rollercoaster task!',
      'You earned a Park Coin!',
      'You earned 50 coins!',
      'You earned 200 Experience!',
    ];

    messages.forEach((message) => {
      delay(() => {
        setMessage(message);
      }, 1000);
    });
  }, []);

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

  useEffect(() => {
    if (peek()) {
      slideDown();
    }

    const timeout = setTimeout(() => {
      slideUp();
    }, 5000);

    return () => clearTimeout(timeout);
  }, [peek()]);

  return (
    <Animated.View
      style={{
        width: Dimensions.get('window').width,
        position: 'absolute',
        top: 0,
        zIndex: 0,
        alignItems: 'center',
        transform: [
          {
            translateY: translate,
          },
        ],
      }}
    >
      <View
        style={{
          width: '80%',
          backgroundColor: 'rgba(255, 255, 255, .8)',
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          borderColor: 'white',
          borderWidth: 3,
          paddingTop: 16,
          paddingBottom: 12,
          paddingLeft: 12,
          paddingRight: 12,
          shadowOffset: {
            width: 0,
            height: 0,
          },
          shadowOpacity: 0.4,
          shadowRadius: 3,
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            fontFamily: 'Knockout',
            fontSize: 20,
          }}
        >
          {peek()}
        </Text>
      </View>
    </Animated.View>
  );
}
