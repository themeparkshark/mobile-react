import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { useContext, useEffect } from 'react';
import {
  Dimensions,
  ImageBackground,
  SafeAreaView,
  Text,
  View,
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
      resizeMode="cover"
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    >
      <SafeAreaView
        style={{
          flex: 1,
        }}
      >
        <View
          style={{
            paddingTop: 75,
          }}
        >
          <Image
            source={require('../../../assets/images/screens/login/logo.png')}
            style={{
              width: '100%',
              height: 100,
            }}
            contentFit="contain"
          />
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, .6)',
              marginLeft: 'auto',
              marginRight: 'auto',
              padding: 16,
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
        </View>
        <Text
          style={{
            opacity: 0.5,
            paddingBottom: 30,
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
