import { useContext, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useEffectOnceWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import { CrumbContext } from '../context/CrumbProvider';
import LaunchScene, { moveLaunchBar } from '../components/launch/LaunchScene';
import { SPLASH_CREEP_MS, SPLASH_ROUTE_SHARE } from '../constants/launchHandoff';

export default function SplashScreen() {
  const { isReady, player } = useContext(AuthContext);
  const { crumbsLoaded } = useContext(CrumbContext);
  const hasNavigated = useRef(false);
  const focused = useIsFocused();

  // Use useEffectOnceWhen to navigate only once when ready. Only while this screen is on top: the
  // sign-in (AuthProvider) often moves to Loading first, and Loading may already have opened the
  // map. A late "go to Loading" from here (the game's words arrived after the map) popped the map
  // off and left the launch scene up for good, with its bar full (seen under a slow network).
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

  // The launch bar from this screen's first frame: it creeps while sign-in and the game's words
  // load, and the Loading screen and the map's cover keep filling the same bar (launchFill).
  useEffect(() => { moveLaunchBar(SPLASH_ROUTE_SHARE, SPLASH_CREEP_MS); }, []);

  // Same art, framing and blue as the native launch screen (the launch scene), so the hand-off is
  // seamless and the title never drops out.
  return <LaunchScene active={focused} />;
}
