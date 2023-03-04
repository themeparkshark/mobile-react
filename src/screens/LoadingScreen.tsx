import { useFonts } from 'expo-font';
import { useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import getCrumbs from '../api/endpoints/crumbs/getCrumbs';
import getInventory from '../api/endpoints/me/inventory';
import { AuthContext } from '../context/AuthProvider';
import { CrumbContext } from '../context/CrumbProvider';
import * as RootNavigation from '../RootNavigation';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { inventory, setInventory, isReady, user, refreshUser } =
    useContext(AuthContext);
  const { crumbs, setCrumbs } = useContext(CrumbContext);
  const [loadingText, setLoadingText] = useState<string>('Loading Interface');

  useEffect(() => {
    setLoadingText('Loading Music');
  }, []);

  const [fontsLoaded] = useFonts({
    Shark: require('../../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../../assets/fonts/knockout.otf'),
  });

  useAsyncEffect(async () => {
    if (!isReady) {
      return;
    }

    setLoadingText('Loading User');
    refreshUser();
    setLoadingText('Loading Inventory');
    setInventory(await getInventory());
    setLoadingText('Loading Crumbs');
    setCrumbs(await getCrumbs());
  }, [isReady]);

  useEffect(() => {
    if (isReady && inventory && user && fontsLoaded && crumbs) {
      setLoading(false);
    }
  }, [user, inventory, isReady, fontsLoaded, crumbs]);

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
    <ImageBackground
      source={require('../../assets/images/screens/login/background.png')}
      resizeMode="cover"
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    >
      <View
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, .8)',
            marginLeft: 'auto',
            marginRight: 'auto',
            padding: 16,
            width: '50%',
            borderRadius: 5,
          }}
        >
          <ActivityIndicator size="large" color="rgba(0, 0, 0, .5)" />
          <Text
            style={{
              textAlign: 'center',
              paddingTop: 16,
            }}
          >
            {loadingText}...
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
