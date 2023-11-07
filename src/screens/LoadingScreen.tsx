import * as Location from 'expo-location';
import { useContext } from 'react';
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
  const { user, inventory, setInventory } = useContext(AuthContext);
  const { requestLocation, requestPark, parkLoaded } =
    useContext(LocationContext);
  const { labels } = useCrumbs();

  useAsyncEffect(async () => {
    if (!user) {
      return;
    }

    setInventory(await getInventory());

    const { status } = await Location.getBackgroundPermissionsAsync();

    if (status !== 'granted') {
      RootNavigation.navigate('Explore');
      return;
    }

    await requestLocation();
    await requestPark();

    if (!user?.username) {
      RootNavigation.navigate('Welcome');
      return;
    }

    RootNavigation.navigate('Explore');
  }, [user?.id]);

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
