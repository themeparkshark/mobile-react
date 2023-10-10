import { BlurView } from 'expo-blur';
import { ReactNode } from 'react';
import { Dimensions, Text } from 'react-native';

export default function WarningMessage({
  title,
  message,
  children = null,
}: {
  readonly title: string;
  readonly message: string;
  readonly children?: ReactNode;
}) {
  return (
    <BlurView
      intensity={80}
      tint="dark"
      style={{
        zIndex: 10,
        alignSelf: 'center',
        position: 'absolute',
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <Text
        style={{
          color: 'white',
          fontFamily: 'Shark',
          textTransform: 'uppercase',
          textShadowColor: 'rgba(0, 0, 0, .5)',
          textShadowOffset: {
            width: 2,
            height: 2,
          },
          textShadowRadius: 0,
          fontSize: 32,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: 'white',
          textAlign: 'center',
          fontFamily: 'Knockout',
          fontSize: 20,
          paddingTop: 30,
          textShadowColor: 'rgba(0, 0, 0, .5)',
          textShadowOffset: {
            width: 2,
            height: 2,
          },
          textShadowRadius: 0,
        }}
      >
        {message}
      </Text>
      {children}
    </BlurView>
  );
}
