import { Image } from 'expo-image';
import { useIsFocused } from '@react-navigation/native';
import { useContext, useRef } from 'react';
import { Dimensions, View } from 'react-native';
import { useEffectOnceWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import { ThemeContext } from '../context/ThemeProvider';
import { CrumbContext } from '../context/CrumbProvider';

const SPLASH_ART = require('../../assets/images/splash-bg.png');

export default function SplashScreen() {
  const { theme } = useContext(ThemeContext);
  const { isReady, player } = useContext(AuthContext);
  const { crumbsLoaded } = useContext(CrumbContext);
  const hasNavigated = useRef(false);
  // Splash stays mounted at the bottom of the stack. AuthProvider moves a signed-in player on
  // by itself, so when the copy (crumbs) arrives late on a slow network, Splash must not
  // navigate from underneath: navigate('Loading') then popped the map back to a Loading
  // screen that had already done its one navigate, and the kid sat there for good.
  const focused = useIsFocused();

  // Use useEffectOnceWhen to navigate only once when ready
  useEffectOnceWhen(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    
    if (player) {
      // User is authenticated - go to loading screen
      RootNavigation.navigate('Loading');
    } else {
      // User is not authenticated - go to login
      RootNavigation.navigate('Login');
    }
  }, Boolean(isReady && crumbsLoaded && focused));

  return (
    // Same art and blue as the native launch screen, so the handoff from the
    // launch storyboard is seamless. A server theme splash fades in over it.
    <View style={{ flex: 1, backgroundColor: '#0768B9' }}>
      <Image
        source={theme?.splash_screen_url ? { uri: theme.splash_screen_url } : SPLASH_ART}
        placeholder={SPLASH_ART}
        placeholderContentFit="cover"
        transition={theme?.splash_screen_url ? 250 : 0}
        contentFit="cover"
        style={{
          width: Dimensions.get('window').width,
          height: Dimensions.get('window').height,
        }}
      />
    </View>
  );
}
