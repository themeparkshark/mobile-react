import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { useContext, useCallback, useEffect } from 'react';
import { View, StyleSheet as RNStyleSheet } from 'react-native';
import { DevJoystick } from './components/DevJoystick';
import { LocationContext } from './context/LocationProvider';
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
import FriendsScreen from './screens/FriendsScreen';
import InventoryScreen from './screens/InventoryScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import LoadingScreen from './screens/LoadingScreen';
import MembershipScreen from './screens/MembershipScreen';
import ArticleScreen from './screens/ArticleScreen';
import NewsScreen from './screens/NewsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ParkScreen from './screens/ParkScreen';
import PendingFriendRequestsScreen from './screens/PendingFriendRequestsScreen';
import PinCollectionScreen from './screens/PinCollectionsScreen';
import PinSwapsScreen from './screens/PinSwapsScreen';
import PlayerScreen from './screens/PlayerScreen';
import ProfileScreen from './screens/ProfileScreen';
import QueueTimesScreen from './screens/QueueTimesScreen';
import RedeemCoinCodeScreen from './screens/RedeemCoinCodeScreen';
import SettingsScreen from './screens/SettingsScreen';
import SocialScreen from './screens/SocialScreen';
import SplashScreen from './screens/SplashScreen';
import StoreScreen from './screens/StoreScreen';
import ThreadScreen from './screens/ThreadScreen';
import WatchScreen from './screens/WatchScreen';
import WelcomeScreen from './screens/WelcomeScreen';
// V2 Screens
import SetCollectionScreen from './screens/SetCollectionScreen';
import StampBookScreen from './screens/StampBookScreen';
import CoinShelfScreen from './screens/CoinShelfScreen';
import BananaBasketScreen from './screens/BananaBasketScreen';
import CommunityCenterScreen from './screens/CommunityCenterScreen';
import SharkParkScreen from './screens/SharkParkScreen';
import LinePlayScreen from './screens/LinePlay/LinePlayScreen';
// Gym Battle Screens
import { TeamSelectionScreen, GymBattleScreen } from './screens/GymBattle';
// Ride Tracker Screens
import RideTrackerScreen from './screens/RideTracker/RideTrackerScreen';
import RideLogScreen from './screens/RideTracker/RideLogScreen';
import RideHistoryScreen from './screens/RideTracker/RideHistoryScreen';
import RideStatsScreen from './screens/RideTracker/RideStatsScreen';
import RideDetailScreen from './screens/RideTracker/RideDetailScreen';
import RideAchievementsScreen from './screens/RideTracker/RideAchievementsScreen';
import RideWrappedScreen from './screens/RideTracker/RideWrappedScreen';
import RideCollectionsScreen from './screens/RideTracker/RideCollectionsScreen';
import RideWishlistScreen from './screens/RideTracker/RideWishlistScreen';
import RideOnboardingScreen from './screens/RideTracker/RideOnboardingScreen';
import RideBatchConfirmScreen from './screens/RideTracker/RideBatchConfirmScreen';
import RideDetectionOverlay from './components/RideTracker/RideDetectionOverlay';
import SharkDropHandler from './components/SharkDropHandler';
import OfflineBanner from './components/OfflineBanner';
import { GameDialogHost } from './ui';
import { isStandalonePreviewMode } from './utils/standalonePreview';
import { DEV_SCREENS, devInitialRoute } from './devRoutes';
import { releaseNativeSplash } from './nativeSplash';
import { addBreadcrumb, setTelemetryUser } from './services/telemetry';

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
  const { devMode, setDevMode, moveDevLocation, location: currentLocation, permissionGranted } = useContext(LocationContext);
  // Keep ride detection alive as the guest moves between map, queue, and profile.
  // The service itself never asks for Always permission during app startup.
  useRideDetection(!isStandalonePreview && !!player && permissionGranted);
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

  const handleJoystickMove = useCallback((dx: number, dy: number, speed: number) => {
    moveDevLocation(dx, dy, speed);
  }, [moveDevLocation]);

  const handleJoystickStop = useCallback(() => {}, []);

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
    <View style={{ flex: 1 }}>
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
        <Stack.Screen name="Store" component={StoreScreen} />
        <Stack.Screen name="PinCollections" component={PinCollectionScreen} />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Player" component={PlayerScreen} />
        <Stack.Screen name="Park" component={ParkScreen} />
        <Stack.Screen
          name="Inventory"
          component={InventoryScreen}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="QueueTimes" component={QueueTimesScreen} />
        <Stack.Screen
          name="LinePlay"
          component={LinePlayScreen}
          initialParams={isLinePlayFlowPreview ? { ride: process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE_ID ? {
            // Dev only: a real local-backend ride, so verified Parts and the
            // Lock Screen Live Activity run end to end.
            rideId: Number(process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE_ID),
            rideName: process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE_NAME ?? 'Ride',
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
        <Stack.Screen name="Friends" component={FriendsScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen
          name="PendingFriendRequests"
          component={PendingFriendRequestsScreen}
        />
        <Stack.Screen name="Thread" component={ThreadScreen} />
        <Stack.Screen name="PinSwaps" component={PinSwapsScreen} />
        <Stack.Screen name="RedeemCoinCode" component={RedeemCoinCodeScreen} />
        <Stack.Screen
          name="Membership"
          component={MembershipScreen}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen name="Watch" component={WatchScreen} />
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
          component={LeaderboardScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Social"
          component={SocialScreen}
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
          component={NewsScreen}
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Article" component={ArticleScreen} />
        {/* V2 Screens */}
        <Stack.Screen name="SetCollection" component={SetCollectionScreen} />
        <Stack.Screen name="StampBook" component={StampBookScreen} />
        <Stack.Screen name="CoinShelf" component={CoinShelfScreen} />
        <Stack.Screen name="SharkPark" component={SharkParkScreen} />
        <Stack.Screen 
          name="CommunityCenter" 
          component={CommunityCenterScreen}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        {/* Gym Battle Screens */}
        <Stack.Screen 
          name="TeamSelection" 
          component={TeamSelectionScreen}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen 
          name="GymBattle" 
          component={GymBattleScreen}
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        {/* Ride Tracker */}
        <Stack.Screen name="RideTracker" component={RideTrackerScreen} />
        <Stack.Screen name="RideLog" component={RideLogScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="RideHistory" component={RideHistoryScreen} />
        <Stack.Screen name="RideStats" component={RideStatsScreen} />
        <Stack.Screen name="RideDetail" component={RideDetailScreen} />
        <Stack.Screen name="RideAchievements" component={RideAchievementsScreen} />
        <Stack.Screen name="RideWrapped" component={RideWrappedScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="RideCollections" component={RideCollectionsScreen} />
        <Stack.Screen name="RideWishlist" component={RideWishlistScreen} />
        <Stack.Screen name="RideOnboarding" component={RideOnboardingScreen} options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="RideBatchConfirm" component={RideBatchConfirmScreen}
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
          component={BananaBasketScreen}
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />

      </Stack.Navigator>
      <RideDetectionOverlay />
      <SharkDropHandler />
    </NavigationContainer>
    <OfflineBanner />
    {/* The one app-wide host for gameAlert / confirmGame (WS0 kit). */}
    <GameDialogHost />
    {__DEV__ && !isStandalonePreview && player && devMode && currentLocation && (
      <DevJoystick
        onMove={handleJoystickMove}
        onStop={handleJoystickStop}
        currentLat={currentLocation.latitude}
        currentLng={currentLocation.longitude}
      />
    )}
    </View>
  );
}
