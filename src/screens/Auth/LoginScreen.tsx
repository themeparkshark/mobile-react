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
import config from '../../config';

export default function LoginScreen() {
  const { user, isReady, login } = useContext(AuthContext);
  const { playMusic } = useContext(MusicContext);

  console.log(config);

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
          justifyContent: 'space-between',
          height: '100%',
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
            marginLeft: 'auto',
            marginRight: 'auto',
            paddingLeft: 75,
            paddingTop: 75,
            paddingRight: 75,
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
              try {
                const credential = await AppleAuthentication.signInAsync({
                  requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                  ],
                });

                login(credential);
              } catch (e) {
                if (e.code === 'ERR_CANCELED') {
                  // handle that the user canceled the sign-in flow
                } else {
                  // handle other errors
                }
              }
            }}
          />
          <Text
            style={{
              opacity: 0.5,
              paddingTop: 75,
              textAlign: 'center',
              fontSize: 12,
            }}
          >{`© Theme Park Shark ${new Date().getFullYear()} v1.0`}</Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}
