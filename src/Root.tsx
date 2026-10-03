import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { useContext, useCallback, useEffect } from 'react';
import { View, StyleSheet as RNStyleSheet } from 'react-native';
import { DevJoystick } from './components/DevJoystick';
import { LocationContext, LocationStatusContext } from './context/LocationProvider';
import { useAsyncEffect } from 'rooks';
import { flushPendingNavigation, navigationRef } from './RootNavigation';
import getCrumbs from './api/endpoints/crumbs/getCrumbs';
import { AuthContext } from './context/AuthProvider';
import { CrumbContext } from './context/CrumbProvider';
import { CurrencyContext } from './context/CurrencyProvider';
import { ThemeContext } from './context/ThemeProvider';
import { useAxiosSetup } from './hooks/useAxiosSetup';
import { useAppUpdates } from './hooks/useAppUpdates';
import { useRideDetection } from './hooks/useRideDetection';
import LoginScreen from './screens/Auth/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';
import LoadingScreen from './screens/LoadingScreen';
import SplashScreen from './screens/SplashScreen';
import WelcomeScreen from './screens/WelcomeScreen';
// Only the launch path (Splash, Loading, Login, Welcome, Explore) loads with the
// app. Every other screen loads on first visit through getComponent, so its
// module, styles and assets are not evaluated during startup.
import RideDetectionOverlay from './components/RideTracker/RideDetectionOverlay';
import SharkDropHandler from './components/SharkDropHandler';
import OfflineBanner from './components/OfflineBanner';
import FeedbackHost from './components/Feedback/FeedbackHost';
import { GameDialogHost } from './ui';
import { isStandalonePreviewMode } from './utils/standalonePreview';
import { DEV_SCREENS, devInitialRoute } from './devRoutes';
import { releaseNativeSplash } from './nativeSplash';
import { addBreadcrumb, setTelemetryUser } from './services/telemetry';
import { markUserActivity } from './hooks/useUserIdle';

const Stack = createNativeStackNavigator();

export default function App() {
  const isLinePlayFlowPreview = __DEV__ && process.env.EXPO_PUBLIC_LINEPLAY_FLOW_PREVIEW === '1';
  const linePlayPreviewBigThunder = __DEV__ &&
    process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE === 'big-thunder';
  const isRideBatchPreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_BATCH_PREVIEW === '1';
  const isStandalonePreview = isStandalonePreviewMode();
  const initialRouteName = devInitialRoute() ?? 'Splash';
  useAppUpdates();
  const { player } = useContext(AuthContext);
  useEffect(() => {
    setTelemetryUser(player?.id);
  }, [player?.id]);
  const { setCrumbs } = useContext(CrumbContext);
  const { retrieveCurrencies } = useContext(CurrencyContext);
  const { retrieveTheme } = useContext(ThemeContext);
  // The app shell reads park presence, not the moving position: a GPS step
  // must not re-render the navigator and every overlay (see RideDetectionDriver
  // and DevJoystickHost, which take the position themselves).
  const { devMode, permissionGranted, park: currentPark } = useContext(LocationStatusContext);
  const [fontsReady, fontError] = useFonts({
    Shark: require('../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../assets/fonts/knockout.otf'),
  });
  // A font failure falls back to system fonts instead of a blank app.
  const fontsLoaded = fontsReady || !!fontError;
  useEffect(() => {
    if (fontsLoaded) releaseNativeSplash();
  }, [fontsLoaded]);
  useAxiosSetup();


  useAsyncEffect(async () => {
    if (isStandalonePreview) return;
    // These resources do not depend on one another. Keep a slow theme request
    // from delaying currencies or the fallback copy needed to leave Splash.
    void Promise.allSettled([
      getCrumbs().then(setCrumbs),
      retrieveTheme(),
      retrieveCurrencies(),
    ]);

  }, []);

  // Wait for fonts to load - but let crumbs load in background
  // SplashScreen will wait for crumbs before navigating
  // The native launch screen stays up until fonts are ready (nativeSplash.ts).
  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }} onTouchStart={onAnyTouch}>
    {/* Keep ride detection alive as the guest moves between map, queue, and profile,
        but only at a park: away from one, background GPS is battery drain and an
        unexplained location indicator. Park presence is sticky, so this never flaps.
        The service itself never asks for Always permission during app startup. */}
    <RideDetectionDriver enabled={!isStandalonePreview && !!player && permissionGranted && !!currentPark}
      parkId={currentPark?.id ?? null} />
    <NavigationContainer
      ref={navigationRef}
      onReady={flushPendingNavigation}
      onStateChange={() => {
        const route = navigationRef.getCurrentRoute?.();
        if (route?.name) addBreadcrumb('navigation', route.name);
      }}
    >
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 250,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Store" getComponent={() => require('./screens/StoreScreen').default} />
        <Stack.Screen name="PinCollections" getComponent={() => require('./screens/PinCollectionsScreen').default} />
        <Stack.Screen
          name="Profile"
          getComponent={() => require('./screens/ProfileScreen').default}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Player" getComponent={() => require('./screens/PlayerScreen').default} />
        <Stack.Screen name="Park" getComponent={() => require('./screens/ParkScreen').default} />
        <Stack.Screen
          name="Inventory"
          getComponent={() => require('./screens/InventoryScreen').default}
        />
        <Stack.Screen name="Settings" getComponent={() => require('./screens/SettingsScreen').default} />
        <Stack.Screen name="HowToPlay" getComponent={() => require('./screens/HowToPlayScreen').default} />
        <Stack.Screen name="QueueTimes" getComponent={() => require('./screens/QueueTimesScreen').default} />
        <Stack.Screen
          name="LinePlay"
          getComponent={() => require('./screens/LinePlay/LinePlayScreen').default}
          initialParams={isLinePlayFlowPreview ? { ride: process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE_ID ? {
            // Dev only: a real local-backend ride, so verified Parts and the
            // Lock Screen Live Activity run end to end.
            rideId: Number(process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE_ID),
            rideName: (process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE_NAME ?? 'Ride').replace(/_/g, ' '),
            rideSlug: process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE_SLUG,
            parkId: Number(process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_PARK_ID ?? 1),
            postedWaitMinutes: 35, postedWaitObservedAt: Date.now(), lineRewardsReady: true,
          } : {
            rideId: 0,
            rideName: linePlayPreviewBigThunder ? 'Big Thunder Mountain Railroad' : 'Space Mountain',
            rideSlug: linePlayPreviewBigThunder ? 'big-thunder-mountain-railroad-8' : 'space-mountain-2',
            parkId: linePlayPreviewBigThunder ? 8 : 2,
            postedWaitMinutes: 35, postedWaitObservedAt: Date.now(), lineRewardsReady: false,
          } } : undefined}
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen name="Friends" getComponent={() => require('./screens/FriendsScreen').default} />
        <Stack.Screen name="Notifications" getComponent={() => require('./screens/NotificationsScreen').default} />
        <Stack.Screen
          name="PendingFriendRequests"
          getComponent={() => require('./screens/PendingFriendRequestsScreen').default}
        />
        <Stack.Screen name="Thread" getComponent={() => require('./screens/ThreadScreen').default} />
        <Stack.Screen name="PinSwaps" getComponent={() => require('./screens/PinSwapsScreen').default} />
        <Stack.Screen name="RedeemCoinCode" getComponent={() => require('./screens/RedeemCoinCodeScreen').default} />
        <Stack.Screen
          name="Membership"
          getComponent={() => require('./screens/MembershipScreen').default}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen name="Watch" getComponent={() => require('./screens/WatchScreen').default} />
        <Stack.Screen
          name="Loading"
          component={LoadingScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Leaderboard"
          getComponent={() => require('./screens/LeaderboardScreen').default}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Social"
          getComponent={() => require('./screens/SocialScreen').default}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Explore"
          component={ExploreScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="News"
          getComponent={() => require('./screens/NewsScreen').default}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Article" getComponent={() => require('./screens/ArticleScreen').default} />
        {/* V2 Screens */}
        <Stack.Screen name="SetCollection" getComponent={() => require('./screens/SetCollectionScreen').default} />
        <Stack.Screen name="StampBook" getComponent={() => require('./screens/StampBookScreen').default} />
        <Stack.Screen name="CoinShelf" getComponent={() => require('./screens/CoinShelfScreen').default} />
        <Stack.Screen name="SharkPark" getComponent={() => require('./screens/SharkParkScreen').default} />
        <Stack.Screen 
          name="CommunityCenter" 
          getComponent={() => require('./screens/CommunityCenterScreen').default}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        {/* Gym Battle Screens */}
        <Stack.Screen 
          name="TeamSelection" 
          getComponent={() => require('./screens/GymBattle').TeamSelectionScreen}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen 
          name="GymBattle" 
          getComponent={() => require('./screens/GymBattle').GymBattleScreen}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        {/* Ride Tracker */}
        <Stack.Screen name="RideTracker" getComponent={() => require('./screens/RideTracker/RideTrackerScreen').default} />
        <Stack.Screen name="RideLog" getComponent={() => require('./screens/RideTracker/RideLogScreen').default} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="RideHistory" getComponent={() => require('./screens/RideTracker/RideHistoryScreen').default} />
        <Stack.Screen name="RideStats" getComponent={() => require('./screens/RideTracker/RideStatsScreen').default} />
        <Stack.Screen name="RideDetail" getComponent={() => require('./screens/RideTracker/RideDetailScreen').default} />
        <Stack.Screen name="RideAchievements" getComponent={() => require('./screens/RideTracker/RideAchievementsScreen').default} />
        <Stack.Screen name="RideWrapped" getComponent={() => require('./screens/RideTracker/RideWrappedScreen').default} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="RideCollections" getComponent={() => require('./screens/RideTracker/RideCollectionsScreen').default} />
        <Stack.Screen name="RideWishlist" getComponent={() => require('./screens/RideTracker/RideWishlistScreen').default} />
        <Stack.Screen name="RideOnboarding" getComponent={() => require('./screens/RideTracker/RideOnboardingScreen').default} options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="RideBatchConfirm" getComponent={() => require('./screens/RideTracker/RideBatchConfirmScreen').default}
          initialParams={isRideBatchPreview ? { detections: [
            { id: 'det_preview_1', rideId: 10, rideName: 'Space Mountain', rideType: 'coaster', parkId: 2,
              enteredAt: Date.now() - 600000, exitedAt: Date.now(), dwellTimeMs: 600000,
              confidence: 'high', isReRide: false, detectedAt: Date.now() },
            { id: 'det_preview_2', rideId: 11, rideName: 'Pirates of the Caribbean', rideType: 'dark_ride', parkId: 2,
              enteredAt: Date.now() - 1200000, exitedAt: Date.now(), dwellTimeMs: 900000,
              confidence: 'medium', isReRide: false, detectedAt: Date.now() },
          ] } : undefined}
          options={{ animation: 'slide_from_bottom' }} />
        {DEV_SCREENS.map(screen => (
          <Stack.Screen key={screen.name} name={screen.name} getComponent={screen.getComponent} />
        ))}
        <Stack.Screen
          name="BananaBasket"
          getComponent={() => require('./screens/BananaBasketScreen').default}
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />

      </Stack.Navigator>
      <RideDetectionOverlay />
      <SharkDropHandler />
    </NavigationContainer>
    <OfflineBanner />
    {/* The one app-wide host for gameAlert / confirmGame (WS0 kit). */}
    <GameDialogHost />
    {/* Tester reports: Settings > Report a Problem, or shake on the internal channel. */}
    {!isStandalonePreview && <FeedbackHost />}
    {(__DEV__ || player?.is_app_reviewer) && !isStandalonePreview && player && devMode && <DevJoystickHost />}
    </View>
  );
}

/** Any touch in the app counts as activity for idle-aware polls (useUserIdle). */
const onAnyTouch = () => markUserActivity();

/** Runs ride detection. Its own component, so a GPS step re-renders only this. */
function RideDetectionDriver({ enabled, parkId }: { readonly enabled: boolean; readonly parkId: number | null }) {
  useRideDetection(enabled, parkId);
  return null;
}

/** Dev builds and the App Store review account: the location joystick, which needs the live position. */
function DevJoystickHost() {
  const { location, moveDevLocation } = useContext(LocationContext);
  const onMove = useCallback((dx: number, dy: number, speed: number) => moveDevLocation(dx, dy, speed), [moveDevLocation]);
  const onStop = useCallback(() => {}, []);
  // Dev only: Standings screen captures run without the joystick over the board.
  if (__DEV__ && process.env.EXPO_PUBLIC_STANDINGS_PREVIEW === '1') return null;
  if (!location) return null;
  return <DevJoystick onMove={onMove} onStop={onStop} currentLat={location.latitude} currentLng={location.longitude} />;
}
