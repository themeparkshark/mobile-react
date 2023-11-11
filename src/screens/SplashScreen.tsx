import { Image } from 'expo-image';
import { Storage } from 'expo-storage';
import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import * as RootNavigation from '../RootNavigation';

export default function SplashScreen() {
  useEffect(() => {
    Storage.getItem({ key: 'user' }).then((userString: string) => {
      if (!userString) {
        RootNavigation.navigate('Login');
      } else {
        RootNavigation.navigate('Loading');
      }
    });
  }, []);

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
