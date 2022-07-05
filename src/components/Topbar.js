import { ImageBackground, SafeAreaView, Text } from 'react-native';
import topbar from '../../assets/images/screens/explore/topbar.png';

export default function Topbar({ text }) {
  return (
    <SafeAreaView>
      <ImageBackground
        source={topbar}
        resizeMode="cover"
        style={{
          height: 120,
          marginTop: -50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            fontSize: 42,
            color: 'white',
            paddingLeft: 12,
            paddingRight: 12,
            paddingBottom: 20,
            fontFamily: 'Shark',
            textTransform: 'uppercase',
            textShadowOffset: {
              width: -1,
            },
            textShadowColor: '#09268f',
            textShadowRadius: 5,
          }}
        >
          {text}
        </Text>
      </ImageBackground>
    </SafeAreaView>
  );
};
