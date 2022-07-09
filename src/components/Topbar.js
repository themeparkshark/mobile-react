import { ImageBackground, SafeAreaView, Text } from 'react-native';
import { ThemeContext} from '../context/ThemeProvider';
import { useContext } from 'react';

export default function Topbar({ text }) {
  const { theme } = useContext(ThemeContext);

  return (
    <SafeAreaView>
      <ImageBackground
        source={{
          uri: theme.top_bar_url,
        }}
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
