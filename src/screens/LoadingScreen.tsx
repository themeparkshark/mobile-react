import {Dimensions, ImageBackground, Text, SafeAreaView, View} from 'react-native';
import { useContext, useEffect, useState } from 'react';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import getInventory from '../api/endpoints/me/inventory';
import recordActivity from '../api/endpoints/activities/create';
import { MusicContext } from '../context/MusicProvider';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { setInventory, isReady, user } = useContext(AuthContext);
  const { playMusic } = useContext(MusicContext);

  useEffect(() => {
    playMusic(require('../../assets/sounds/music/track5.mp3'));
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    recordActivity('Viewed the Loading screen.');

    (async () => {
      setInventory(await getInventory());

      setLoading(false);
    })();
  }, [isReady]);

  useEffect(() => {
    if (!loading && isReady) {
      if (!user?.username) {
        RootNavigation.navigate('Welcome');
        return;
      }

      RootNavigation.navigate('Explore');
    }
  }, [loading, isReady]);

  return (
    <ImageBackground
      source={require('../../assets/images/screens/login/background.png')}
      resizeMode={'cover'}
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    >
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <Text
          style={{
            paddingBottom: 32,
            textShadowRadius: 5,
            textShadowColor: 'black',
            color: 'white',
            fontFamily: 'Shark',
            fontSize: 36,
            textTransform: 'uppercase',
          }}
        >
          Loading...
        </Text>
      </SafeAreaView>
    </ImageBackground>
  );
}
