import { useContext, useEffect, useRef } from 'react';
import { Animated, Dimensions, Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import { BroadcastContext } from '../context/BroadcastProvider';

export default function Broadcasts() {
  const { activeBroadcast } = useContext(BroadcastContext);
  const translate = useRef(new Animated.Value(0)).current;

  const slideUp = () => {
    Animated.timing(translate, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const slideDown = () => {
    Animated.timing(translate, {
      toValue: 50,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (activeBroadcast) {
      slideDown();
    }

    const timeout = setTimeout(() => {
      slideUp();
    }, 5000);

    return () => clearTimeout(timeout);
  }, [activeBroadcast]);

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
          {activeBroadcast}
        </Text>
      </View>
    </Animated.View>
  );
}
