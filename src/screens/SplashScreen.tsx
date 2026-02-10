import { Image } from 'expo-image';
import { useContext, useRef } from 'react';
import { Dimensions, View } from 'react-native';
import { useEffectOnceWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import { ThemeContext } from '../context/ThemeProvider';
import { CrumbContext } from '../context/CrumbProvider';

export default function SplashScreen() {
  const { theme } = useContext(ThemeContext);
  const { isReady, player } = useContext(AuthContext);
  const { crumbsLoaded } = useContext(CrumbContext);
  const hasNavigated = useRef(false);

  // Use useEffectOnceWhen to navigate only once when ready
  useEffectOnceWhen(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    
    console.log('🦈 Splash: ready, player:', player?.username || 'none');
    
    if (player) {
      // User is authenticated - go to loading screen
      RootNavigation.navigate('Loading');
    } else {
      // User is not authenticated - go to login
      RootNavigation.navigate('Login');
    }
  }, Boolean(isReady && crumbsLoaded));

  return (
    <View style={{ flex: 1, backgroundColor: '#09268f' }}>
      <Image
        source={
          theme?.splash_screen_url
            ? { uri: theme.splash_screen_url }
            : require('../../assets/images/loading-screen.png')
        }
        contentFit="cover"
        style={{
          width: Dimensions.get('window').width,
          height: Dimensions.get('window').height,
        }}
      />
    </View>
  );
}
