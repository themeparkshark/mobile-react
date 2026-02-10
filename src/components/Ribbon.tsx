import { ImageBackground, View } from 'react-native';
import StrokedText from './StrokedText';

export default function Ribbon({ text }: { readonly text: string }) {
  return (
    <ImageBackground
      source={require('../../assets/images/ribbon.png')}
      style={{
        width: '100%',
        aspectRatio: 3.92,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
      resizeMode="contain"
    >
      <View
        style={{
          width: '80%',
          height: '50%',
          marginTop: '-4%',
          justifyContent: 'center',
        }}
      >
        <StrokedText
          style={{
            fontFamily: 'Shark',
            textTransform: 'uppercase',
            color: 'white',
            fontSize: 32,
            textShadowColor: 'rgba(0, 0, 0, .4)',
            textShadowOffset: {
              width: 1,
              height: 2,
            },
            textShadowRadius: 2,
            textAlign: 'center',
          }}
          strokeColor="#0d2b5e"
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {text}
        </StrokedText>
      </View>
    </ImageBackground>
  );
}
