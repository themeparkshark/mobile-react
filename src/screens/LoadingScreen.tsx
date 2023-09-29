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
import getInventory from '../api/endpoints/me/inventory';
import { AuthContext } from '../context/AuthProvider';
import { CrumbContext } from '../context/CrumbProvider';
import { LocationContext } from '../context/LocationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import * as RootNavigation from '../RootNavigation';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { setInventory, isReady, user, refreshUser } = useContext(AuthContext);
  const { setCrumbs } = useContext(CrumbContext);
  const { setTheme } = useContext(ThemeContext);
  const { requestLocation, requestPark } = useContext(LocationContext);

  useAsyncEffect(async () => {
    if (!isReady) {
      return;
    }

    refreshUser();
    setInventory(await getInventory());
    setCrumbs(await getCrumbs());
    await requestLocation();
    await requestPark();
    setTheme(await getCurrentTheme());
    setLoading(false);
  }, [isReady]);

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
