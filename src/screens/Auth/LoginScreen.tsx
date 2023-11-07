import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext } from 'react';
import {
  Dimensions,
  ImageBackground,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import SignInButtons from '../../components/SignInButtons';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { MusicContext } from '../../context/MusicProvider';
import useCrumbs from '../../hooks/useCrumbs';

export default function LoginScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const { playMusic } = useContext(MusicContext);
  const { setPark } = useContext(LocationContext);
  const { labels } = useCrumbs();

  useFocusEffect(
    useCallback(() => {
      setPark(undefined);

      if (!user) {
        playMusic(require('../../../assets/sounds/music/track1.mp3'));
      }
    }, [])
  );

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
          <SignInButtons>
            <TouchableOpacity
              onPress={() => {
                navigation.navigate('Explore');
              }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 16,
                  paddingTop: 32,
                }}
              >
                {labels.continue_as_guest}
              </Text>
            </TouchableOpacity>
          </SignInButtons>
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
          {labels.copyright}
        </Text>
      </SafeAreaView>
    </ImageBackground>
  );
}
