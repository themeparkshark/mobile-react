import { Image } from 'expo-image';
import { useContext, useRef } from 'react';
import { Dimensions, View } from 'react-native';
import { useEffectOnceWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import { CrumbContext } from '../context/CrumbProvider';

const SPLASH_ART = require('../../assets/images/splash-bg.png');

export default function SplashScreen() {
  const { isReady, player } = useContext(AuthContext);
  const { crumbsLoaded } = useContext(CrumbContext);
  const hasNavigated = useRef(false);

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
  }, Boolean(isReady && crumbsLoaded));

  return (
    // Same art, framing and blue as the native launch screen, so the handoff is seamless and the
    // title never drops out. The server theme's splash (older art with no title, framed tighter)
    // used to fade in here for under a second, which read as a zoom with the title cut off.
    <View style={{ flex: 1, backgroundColor: '#0768B9' }}>
      <Image
        source={SPLASH_ART}
        transition={0}
        contentFit="cover"
        style={{
          width: Dimensions.get('window').width,
          height: Dimensions.get('window').height,
        }}
      />
    </View>
  );
}
