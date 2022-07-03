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
            fontSize: 28,
            color: 'white',
            paddingLeft: 12,
            paddingRight: 12,
            paddingBottom: 28,
          }}
        >
          {text}
        </Text>
      </ImageBackground>
    </SafeAreaView>
  );
};
