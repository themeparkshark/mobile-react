import {
  Animated,
  Easing,
  Image,
  ImageURISource,
  Text,
  View,
} from 'react-native';
import { useEffect, useRef } from 'react';
import * as Animatable from 'react-native-animatable';

export default function Box({
  background,
  image,
  text,
  number,
  small,
  type,
  pulse,
}: {
  readonly backgroundColor?: string;
  readonly background?: ImageURISource;
  readonly image: ImageURISource;
  readonly number?: number;
  readonly text?: string | number;
  readonly small?: boolean;
  readonly type: string;
  readonly pulse?: boolean;
}) {
  const rotate = useRef(new Animated.Value(0)).current;

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const backgrounds = {
    task: '#4cdcff',
    coin: '#ffe7a2',
    item: '#e5d4ff',
    pin: '#e5d4ff',
    secret_task: '#c3eaff',
  };

  const borders = {
    task: '#0d3249',
    coin: '#3d4a24',
    item: '#4a2a66',
    pin: '#4a2a66',
    secret_task: '#0c3f6c',
  };

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <View
      style={{
        height: '100%',
        backgroundColor: backgrounds[type as keyof typeof backgrounds],
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: borders[type as keyof typeof borders],
        borderWidth: 3,
        shadowOffset: {
          width: 0,
          height: 3,
        },
        shadowOpacity: 0.4,
        shadowRadius: 0,
      }}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          position: 'relative',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {pulse && (
          <Animatable.View
            animation="pulse"
            iterationCount="infinite"
            direction="alternate"
            style={{ justifyContent: 'center' }}
          >
            <Image
              source={image}
              style={{
                width: '90%',
                height: '90%',
                resizeMode: 'contain',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            />
          </Animatable.View>
        )}
        {!pulse && (
          <Image
            source={image}
            style={{
              width: '85%',
              height: '85%',
              resizeMode: 'contain',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          />
        )}
        {number && (
          <View
            style={{
              top: 4,
              right: 4,
              position: 'absolute',
            }}
          >
            <Text
              style={{
                textShadowColor: 'rgba(0, 0, 0, .5)',
                textShadowOffset: {
                  width: 2,
                  height: 2,
                },
                textShadowRadius: 0,
                color: 'white',
                fontFamily: 'Knockout',
                fontSize: 28,
              }}
            >
              {number}
            </Text>
          </View>
        )}
        {background && (
          <Animated.Image
            source={background}
            style={{
              width: '100%',
              position: 'absolute',
              zIndex: -10,
              opacity: 0.04,
              transform: [
                {
                  rotate: spin,
                },
              ],
            }}
            resizeMode="contain"
          />
        )}
      </View>
      {text && (
        <View
          style={{
            backgroundColor: 'rgba(0, 0, 0, .6)',
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 6,
            padding: 4,
            width: '100%',
          }}
        >
          <Text
            style={{
              color: 'white',
              textAlign: 'center',
              fontFamily: 'Knockout',
              fontSize: small ? 18 : 24,
              paddingLeft: 8,
              paddingRight: 8,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
          >
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}
