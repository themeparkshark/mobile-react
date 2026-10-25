import { sample } from 'lodash';
import { useIsFocused } from '@react-navigation/native';
import { useContext, useEffect, useState, useRef } from 'react';
import { useAsyncEffect, useEffectOnceWhen, useTimeoutWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import LaunchScene, { getLaunchFact, moveLaunchBar, setLaunchFact } from '../components/launch/LaunchScene';
import { COVER_LAUNCH_MAX_MS, COVER_STEPS, LAUNCH_HANDOFF_SHARE } from '../constants/launchHandoff';

/** While the park check runs, the bar creeps from the sign-in step toward the hand-off over this long. */
const LOADING_CREEP_MS = 8000;
import { AuthContext } from '../context/AuthProvider';
import { LocationStatusContext } from '../context/LocationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import useCrumbs from '../hooks/useCrumbs';

import { warmLaunchArt } from '../helpers/launchArt';
import { CurrencyContext } from '../context/CurrencyProvider';
export default function LoadingScreen() {
  // This screen stays mounted under the map for the whole session; its bubbles run only while it
  // is the screen on top.
  const focused = useIsFocused();

  const { isReady, player } = useContext(AuthContext);
  const { requestPark, parkLoaded, permissionGranted } =
    useContext(LocationStatusContext);
  const { labels } = useCrumbs();
  const { theme } = useContext(ThemeContext);
  const { currencies } = useContext(CurrencyContext);
  // The header pills' coin and key art (server icons), decoded as soon as the list arrives.
  const currencyIcons = currencies.map((c) => c.icon_url).filter(Boolean).join('|');
  useEffect(() => {
    if (currencyIcons) warmLaunchArt(currencyIcons.split('|'), 0).catch(() => undefined);
  }, [currencyIcons]);
  const [progress, setProgress] = useState<number>(0);
  // One fact per launch: the map's cover shows the same words (no swap at the hand-off).
  const [fact, setFact] = useState<string | null>(() => getLaunchFact());
  const hasUsername = !!player?.username;
  const hasNavigated = useRef(false);
  
  // Safe navigate: prevents double navigation race condition
  const safeNavigate = async () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    // Team choice is deferred to the first gym tap; don't block the map.
    // Dev only: EXPO_PUBLIC_STANDINGS_PREVIEW=1 lands on Standings for screen captures.
    // Dev only: EXPO_PUBLIC_STANDINGS_PROFILE_ID opens that player's profile (a stranger-profile capture).
    if (__DEV__ && process.env.EXPO_PUBLIC_STANDINGS_PROFILE_ID) {
      RootNavigation.navigate('Player', { player: Number(process.env.EXPO_PUBLIC_STANDINGS_PROFILE_ID) });
      return;
    }
    if (__DEV__ && process.env.EXPO_PUBLIC_STANDINGS_PREVIEW === '1') {
      RootNavigation.navigate('Leaderboard', { tab: process.env.EXPO_PUBLIC_STANDINGS_TAB });
      return;
    }
    // Dev only: EXPO_PUBLIC_PIN_TRADING_PREVIEW=1 lands on Pin Trading for screen captures.
    if (__DEV__ && process.env.EXPO_PUBLIC_PIN_TRADING_PREVIEW === '1') {
      RootNavigation.navigate('PinSwaps');
      return;
    }
    RootNavigation.navigate('Explore');
    // A push that launched the app opens on top of the map, after sign-in.
    require('../services/push').openColdStartPush();
  };

  // Brought back on top after it already opened the map (a late "go to Loading" from the launch,
  // or an account link): go on to the map again, never sit on the launch scene with a full bar.
  const leftAfterNavigating = useRef(false);
  useEffect(() => {
    if (!focused) {
      if (hasNavigated.current) leftAfterNavigating.current = true;
      return;
    }
    if (!leftAfterNavigating.current) return;
    leftAfterNavigating.current = false;
    hasNavigated.current = false;
    if (isReady && hasUsername) safeNavigate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  useEffectOnceWhen(() => {
    RootNavigation.navigate('Welcome');
  }, Boolean(isReady && !hasUsername));

  // Real progress: signed in (50), park check done (100). The bar moves with
  // actual work, and a short floor keeps the art on screen long enough to land.
  // It fills only LAUNCH_HANDOFF_SHARE of the bar: the map's sky cover fills the rest.
  // No floor: the map's cover is this same scene and bar, so leaving early only gets the map sooner.
  const mountedAt = useRef(Date.now());
  const MIN_SHOW_MS = 0;
  useAsyncEffect(async () => {
    if (!isReady || !hasUsername) {
      return;
    }
    setProgress(50);
    if (permissionGranted) {
      try { await requestPark(); } catch { /* the map retries on its own */ }
    }
    // The map's first frame is fully painted: header, footer, coin and ticket art are warm.
    await warmLaunchArt([theme?.top_bar_url, theme?.bottom_bar_url, theme?.currency?.icon_url]);
    const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - mountedAt.current));
    setTimeout(() => setProgress(100), wait);
  }, [isReady, permissionGranted, hasUsername]);

  useEffect(() => {
    if (fact) return;
    setLaunchFact(sample(labels.splash_screen_facts));
    setFact(getLaunchFact());
  }, [fact, labels.splash_screen_facts]);

  // The one launch bar (shared with the Splash route and the map's cover) moves with real work.
  useEffect(() => {
    // Each step keeps creeping toward the next one (the park check; then, while the map screen
    // mounts, the cover's first step), so the bar never sits still between real steps.
    if (progress > 0) moveLaunchBar((progress / 100) * LAUNCH_HANDOFF_SHARE, 250, progress < 100
      ? { to: 0.9 * LAUNCH_HANDOFF_SHARE, ms: LOADING_CREEP_MS } : { to: COVER_STEPS.armed, ms: COVER_LAUNCH_MAX_MS });
  }, [progress]);

  useEffect(() => {
    if (__DEV__) console.log('🦈 Loading screen state:', { progress, isReady, hasUsername, parkLoaded, permissionGranted });
  }, [progress, isReady, hasUsername, parkLoaded, permissionGranted]);

  // Force navigate after 5 seconds regardless of state (safety net)
  useTimeoutWhen(
    () => {
      safeNavigate();
    },
    5000,
    isReady && hasUsername
  );

  // Normal navigate when progress hits 100. The map's cover keeps filling the same bar from
  // wherever it is (launchFill), so there is nothing to wait for.
  useTimeoutWhen(
    () => {
      safeNavigate();
    },
    0,
    progress === 100 && hasUsername
  );

  // The launch scene (Alex's splash art, bubbles, the fact and the one bar): the same picture the
  // native launch screen and the Splash route showed, and the same one the map's cover keeps up
  // until the park map has drawn. A kid sees one splash with one bar finishing, then the map.
  return <LaunchScene active={focused} fact={fact} />;
}
