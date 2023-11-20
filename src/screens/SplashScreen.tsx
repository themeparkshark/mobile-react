import { Image } from 'expo-image';
import { Storage } from 'expo-storage';
import { useContext, useEffect } from 'react';
import { Dimensions } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { ThemeContext } from '../context/ThemeProvider';

export default function SplashScreen() {
  const { theme } = useContext(ThemeContext);

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
      source={
        theme?.splash_screen_url
          ? {
              uri: theme?.splash_screen_url,
            }
          : require('../../assets/images/screens/login/background.png')
      }
      contentFit="cover"
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    />
  );
}
