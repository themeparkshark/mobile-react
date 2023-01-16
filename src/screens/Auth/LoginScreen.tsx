import * as AppleAuthentication from 'expo-apple-authentication';
import { useContext, useEffect } from 'react';
import {
  ImageBackground,
  SafeAreaView,
  Dimensions,
  View,
  Text,
  Image,
} from 'react-native';
import { AuthContext } from '../../context/AuthProvider';
import { MusicContext } from '../../context/MusicProvider';

export default function LoginScreen() {
  const { user, isReady, login } = useContext(AuthContext);
  const { playMusic } = useContext(MusicContext);

  useEffect(() => {
    if (!user && isReady) {
      playMusic(require('../../../assets/sounds/music/track1.mp3'));
    }
  }, []);

  return (
    <ImageBackground
      source={require('../../../assets/images/screens/login/background.png')}
      resizeMode={'cover'}
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    >
      <SafeAreaView
        style={{
          flex: 1,
          position: 'relative',
        }}
      >
        <View
          style={{
            paddingTop: 75,
          }}
        >
          <Image
            source={require('../../../assets/images/screens/login/logo.png')}
            resizeMode={'contain'}
            style={{
              width: '100%',
              height: 100,
            }}
          />
        </View>
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, .8)',
            marginTop: 300,
            marginLeft: 'auto',
            marginRight: 'auto',
            padding: 20,
            borderRadius: 5,
          }}
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={5}
            style={{ width: 200, height: 44 }}
            onPress={async () => {
              const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                  AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
              });

              login(credential);
            }}
          />
        </View>
        <Text
          style={{
            opacity: 0.5,
            paddingTop: 75,
            textAlign: 'center',
            fontSize: 12,
            marginTop: 'auto',
          }}
        >
          {`© Theme Park Shark ${new Date().getFullYear()}`}
        </Text>
      </SafeAreaView>
    </ImageBackground>
  );
}
