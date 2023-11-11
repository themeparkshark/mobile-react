import { useContext, useEffect } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import getInventory from '../api/endpoints/me/inventory';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function LoadingScreen() {
  const { isReady, user, setInventory } = useContext(AuthContext);
  const { requestPark, parkLoaded, permissionGranted } =
    useContext(LocationContext);
  const { labels } = useCrumbs();

  useAsyncEffect(async () => {
    if (!isReady) {
      return;
    }

    if (!permissionGranted) {
      RootNavigation.navigate('Explore');
      return;
    }
    await requestPark();
  }, [isReady, permissionGranted]);

  useAsyncEffect(async () => {
    if (!isReady) {
      return;
    }

    setInventory(await getInventory());
  }, [isReady]);

  useEffect(() => {
    if (!parkLoaded) {
      return;
    }

    RootNavigation.navigate('Explore');
  }, [parkLoaded]);

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
            {labels.loading}
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
