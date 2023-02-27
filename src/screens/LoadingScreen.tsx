import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { Dimensions } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getInventory from '../api/endpoints/me/inventory';
import { AuthContext } from '../context/AuthProvider';
import { MusicContext } from '../context/MusicProvider';
import * as RootNavigation from '../RootNavigation';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { inventory, setInventory, isReady, user, refreshUser } =
    useContext(AuthContext);
  const { playMusic } = useContext(MusicContext);

  useEffect(() => {
    playMusic(require('../../assets/sounds/music/track5.mp3'));
  }, []);

  const [fontsLoaded] = useFonts({
    Shark: require('../../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../../assets/fonts/knockout.otf'),
  });

  useAsyncEffect(async () => {
    if (!isReady) {
      return;
    }

    refreshUser();
    setInventory(await getInventory());
  }, [isReady]);

  useEffect(() => {
    if (isReady && inventory && user && fontsLoaded) {
      setLoading(false);
    }
  }, [user, inventory, isReady, fontsLoaded]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.username) {
      RootNavigation.navigate('Welcome');
      return;
    }

    RootNavigation.navigate('Explore');
  }, [loading]);

  return (
    <Image
      source={require('../../assets/images/screens/login/background.png')}
      contentFit="cover"
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    />
  );
}
