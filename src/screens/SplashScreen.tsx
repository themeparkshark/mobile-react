import { Image } from 'expo-image';
import { useContext, useRef } from 'react';
import { Dimensions, SafeAreaView, View } from 'react-native';
import { useEffectOnceWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import { CrumbContext } from '../context/CrumbProvider';
import Progress from '../components/Progress';
import { SPLASH_CREEP_MS, SPLASH_ROUTE_SHARE } from '../constants/launchHandoff';

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
        cachePolicy="memory-disk"
        priority="high"
        contentFit="cover"
        style={{
          width: Dimensions.get('window').width,
          height: Dimensions.get('window').height,
        }}
      />
      {/* The launch bar from this screen's first frame, in the same spot as the Loading screen's
          bar: it creeps while sign-in and the game's words load, and the Loading screen picks it
          up from SPLASH_ROUTE_SHARE, so a kid sees one bar moving from the first second. */}
      <SafeAreaView pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end' }}>
        <View style={{ marginBottom: 32, marginLeft: 'auto', marginRight: 'auto', width: '80%' }}>
          <View style={{ borderRadius: 50, borderColor: 'white', borderWidth: 3 }}
            accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
            <Progress progress={SPLASH_ROUTE_SHARE * 100} duration={SPLASH_CREEP_MS} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
