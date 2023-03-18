import { ImageBackground, Text, View } from 'react-native';

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
        <Text
          style={{
            fontFamily: 'Shark',
            textTransform: 'uppercase',
            color: 'white',
            fontSize: 32,
            textShadowColor: 'rgba(0, 0, 0, .5)',
            textShadowOffset: {
              width: 2,
              height: 2,
            },
            textShadowRadius: 0,
            textAlign: 'center',
          }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {text}
        </Text>
      </View>
    </ImageBackground>
  );
}
