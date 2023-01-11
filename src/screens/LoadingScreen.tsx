import { Dimensions, Image } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import getInventory from '../api/endpoints/me/inventory';
import recordActivity from '../api/endpoints/activities/create';
import { MusicContext } from '../context/MusicProvider';
import {useFonts} from 'expo-font';
import {
  Pusher,
  PusherEvent,
} from '@pusher/pusher-websocket-react-native';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { inventory, setInventory, isReady, user } = useContext(AuthContext);
  const { playMusic } = useContext(MusicContext);

  useEffect(() => {
    playMusic(require('../../assets/sounds/music/track5.mp3'));
  }, []);

  const [fontsLoaded] = useFonts({
    Shark: require('../../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../../assets/fonts/knockout.otf'),
  });

  useEffect(() => {
    if (!isReady) {
      return;
    }

    recordActivity('Viewed the Loading screen.');

    (async () => {
      setInventory(await getInventory());
    })();
  }, [isReady]);

  useEffect(() => {
    if (isReady && inventory && user && fontsLoaded) {
      setLoading(false);
    }
  }, [user, inventory, isReady, fontsLoaded]);

  useEffect(() => {
    if (!loading) {
      if (!user?.username) {
        RootNavigation.navigate('Welcome');
        return;
      }

      RootNavigation.navigate('Explore');
    }
  }, [loading]);

  return (
    <Image
      source={require('../../assets/images/screens/login/background.png')}
      resizeMode={'cover'}
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    />
  );
}
