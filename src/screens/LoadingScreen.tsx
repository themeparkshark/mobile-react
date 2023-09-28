import { isEmpty } from 'ramda';
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
  const { setTheme, themeLoaded } = useContext(ThemeContext);
  const { location, requestLocation, requestPark, parkLoaded } =
    useContext(LocationContext);
  const { refreshNotificationCount } = useContext(NotificationContext);

  useAsyncEffect(async () => {
    console.log('isready');
    console.log(isReady);
    if (!isReady) {
      return;
    }

    console.log('test');

    if (!user) {
      setCrumbs(await getCrumbs());
      setTheme(await getCurrentTheme());
      setLoading(false);
      console.log('finished');
      return;
    }

    refreshUser();
    setInventory(await getInventory());
    refreshNotificationCount();
    setDailyGift(await getDailyGift());
    await requestLocation();
    await requestPark();
    setLoading(false);
  }, [isReady, user]);

  useEffect(() => {
    if (!user && !isEmpty(crumbs) && themeLoaded) {
      setLoading(false);
      return;
    }

    if (
      isReady &&
      inventory &&
      user &&
      !isEmpty(crumbs) &&
      !isEmpty(location) &&
      parkLoaded &&
      dailyGift &&
      themeLoaded
    ) {
      setLoading(false);
    }
  }, [user, inventory, isReady, crumbs, location, parkLoaded, dailyGift]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user && !user.username) {
      RootNavigation.navigate('Welcome');
      return;
    }

    RootNavigation.navigate('Explore');
  }, [loading, user]);

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
