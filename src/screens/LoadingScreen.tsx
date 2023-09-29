import { useFonts } from 'expo-font';
import { isEmpty } from 'lodash';
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
import getCurrentTheme from '../api/endpoints/current-theme/get';
import getDailyGift from '../api/endpoints/daily-gifts/create';
import getInventory from '../api/endpoints/me/inventory';
import { AuthContext } from '../context/AuthProvider';
import { CrumbContext } from '../context/CrumbProvider';
import { DailyGiftContext } from '../context/DailyGiftProvider';
import { LocationContext } from '../context/LocationProvider';
import { NotificationContext } from '../context/NotificationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import * as RootNavigation from '../RootNavigation';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { inventory, setInventory, isReady, user, refreshUser } =
    useContext(AuthContext);
  const { crumbs, setCrumbs } = useContext(CrumbContext);
  const { dailyGift, setDailyGift } = useContext(DailyGiftContext);
  const { theme, setTheme, themeLoaded } = useContext(ThemeContext);
  const { location, requestLocation, requestPark, parkLoaded } =
    useContext(LocationContext);
  const [loadingText, setLoadingText] = useState<string>('Loading Interface');
  const { refreshNotificationCount } = useContext(NotificationContext);

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

    refreshUser();
    setInventory(await getInventory());
    setCrumbs(await getCrumbs());
    refreshNotificationCount();
    setDailyGift(await getDailyGift());
    await requestLocation();
    await requestPark();
    setTheme(await getCurrentTheme());
    setLoading(false);
  }, [isReady]);

  useEffect(() => {
    if (
      isReady &&
      inventory &&
      user &&
      fontsLoaded &&
      !isEmpty(crumbs) &&
      !isEmpty(location) &&
      parkLoaded &&
      dailyGift &&
      themeLoaded
    ) {
      setLoading(false);
    }
  }, [
    user,
    inventory,
    isReady,
    fontsLoaded,
    crumbs,
    location,
    parkLoaded,
    dailyGift,
  ]);

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
            Loading...
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
