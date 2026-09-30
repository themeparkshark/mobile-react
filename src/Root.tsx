import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { useContext, useCallback } from 'react';
import { View, StyleSheet as RNStyleSheet } from 'react-native';
import { DevJoystick } from './components/DevJoystick';
import { LocationContext } from './context/LocationProvider';
import mobileAds, {
  InterstitialAd,
  MaxAdContentRating,
  TestIds,
} from './helpers/ads-stub';
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
import QueueTimesPreviewScreen from './screens/QueueTimesPreviewScreen';
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
import QueueStampPreviewScreen from './screens/LinePlay/QueueStampPreviewScreen';
import CoinShelfScreen from './screens/CoinShelfScreen';
import MiniGameTesterScreen from './screens/MiniGameTesterScreen';
import GameKitGymScreen from './screens/GameKitGymScreen';
import PostWinRewardsPreviewScreen from './screens/PostWinRewardsPreviewScreen';
import ShelfArrivalPreviewScreen from './screens/ShelfArrivalPreviewScreen';
import CoinLevelingPreviewScreen from './screens/CoinLevelingPreviewScreen';
import RescuePassPreviewScreen from './screens/RescuePassPreviewScreen';
import ParkChecklistPreviewScreen from './screens/ParkChecklistPreviewScreen';
import ParkArrivalPreviewScreen from './screens/ParkArrivalPreviewScreen';
import BananaBasketScreen from './screens/BananaBasketScreen';
import CommunityCenterScreen from './screens/CommunityCenterScreen';
import SharkParkScreen from './screens/SharkParkScreen';
import LinePlayScreen from './screens/LinePlay/LinePlayScreen';
import TriviaGamePreviewScreen from './screens/LinePlay/TriviaGamePreviewScreen';
import CrewRelayPreviewScreen from './screens/LinePlay/CrewRelayPreviewScreen';
import ParkProjectPreviewScreen from './screens/ExploreScreen/ParkProjectPreviewScreen';
import TripGoalPreviewScreen from './screens/ExploreScreen/TripGoalPreviewScreen';
import ParkDayRecapPreviewScreen from './screens/ParkDayRecapPreviewScreen';
import CrewGridPreviewScreen from './screens/LinePlay/CrewGridPreviewScreen';
import SetCollectionPreviewScreen from './screens/SetCollectionPreviewScreen';
import HomeHuntPreviewScreen from './screens/ExploreScreen/HomeHuntPreviewScreen';
import InventoryPreviewScreen from './screens/InventoryPreviewScreen';
import ProfilePreviewScreen from './screens/ProfilePreviewScreen';
import RideLogSuccessPreviewScreen from './screens/RideLogSuccessPreviewScreen';
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
import { isStandalonePreviewMode } from './utils/standalonePreview';

const Stack = createNativeStackNavigator();

export default function App() {
  const isLinePlayFlowPreview = __DEV__ && process.env.EXPO_PUBLIC_LINEPLAY_FLOW_PREVIEW === '1';
  const isTriviaGamePreview = __DEV__ && process.env.EXPO_PUBLIC_TRIVIA_GAME_PREVIEW === '1';
  const linePlayPreviewBigThunder = __DEV__ &&
    process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_RIDE === 'big-thunder';
  const isCrewRelayPreview = __DEV__ && process.env.EXPO_PUBLIC_CREW_RELAY_PREVIEW === '1';
  const isParkProjectPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_PROJECT_PREVIEW === '1';
  const isTripGoalPreview = __DEV__ && process.env.EXPO_PUBLIC_TRIP_GOAL_PREVIEW === '1';
  const isParkDayRecapPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_DAY_RECAP_PREVIEW === '1';
  const isCrewGridPreview = __DEV__ && process.env.EXPO_PUBLIC_CREW_GRID_PREVIEW === '1';
  const isSetCollectionPreview = __DEV__ && process.env.EXPO_PUBLIC_SET_COLLECTION_PREVIEW === '1';
  const isPostWinRewardsPreview = __DEV__ && (process.env.EXPO_PUBLIC_POST_WIN_REWARDS_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_POST_WIN_FIRST_PREVIEW === '1');
  const isCoinLevelingPreview = __DEV__ && process.env.EXPO_PUBLIC_COIN_LEVELING_PREVIEW === '1';
  const isRescuePassPreview = __DEV__ && process.env.EXPO_PUBLIC_RESCUE_PASS_PREVIEW === '1';
  const isStampBookPreview = __DEV__ && process.env.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1';
  const isQueueStampPreview = __DEV__ && process.env.EXPO_PUBLIC_QUEUE_STAMP_PREVIEW === '1';
  const isParkChecklistPreview = __DEV__ && (process.env.EXPO_PUBLIC_PARK_CHECKLIST_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_RESCUE_GOAL_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_DOWN_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_PASSPORT_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_PASSPORT_COMPLETE_PREVIEW === '1');
  const isParkArrivalPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_PREVIEW === '1';
  const isCoinShelfPreview = __DEV__ && process.env.EXPO_PUBLIC_COIN_SHELF_PREVIEW === '1';
  const isRideTrackerPreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_TRACKER_PREVIEW === '1';
  const isRideGamePreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_GAME_PREVIEW === '1';
  const isHomeHuntPreview = __DEV__ && (
    process.env.EXPO_PUBLIC_HOME_HUNT_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_HOME_SAVED_PREVIEW === '1');
  const isInventoryPreview = __DEV__ && process.env.EXPO_PUBLIC_INVENTORY_PREVIEW === '1';
  const isProfilePreview = __DEV__ && process.env.EXPO_PUBLIC_PROFILE_PREVIEW === '1';
  const isRideLogSuccessPreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_LOG_SUCCESS_PREVIEW === '1';
  const isRideLogPreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_LOG_PREVIEW === '1';
  const isRideBatchPreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_BATCH_PREVIEW === '1';
  const isRideDetectionPreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_DETECTION_PREVIEW === '1';
  const isTutorialPreview = __DEV__ && process.env.EXPO_PUBLIC_TUTORIAL_PREVIEW === '1';
  const isQueueTimesPreview = __DEV__ && process.env.EXPO_PUBLIC_QUEUE_TIMES_PREVIEW === '1';
  const isStandalonePreview = isStandalonePreviewMode();
  const initialRouteName = __DEV__ && process.env.EXPO_PUBLIC_SHELF_ARRIVAL_PREVIEW === '1'
    ? 'ShelfArrivalPreview' : isTriviaGamePreview
    ? 'TriviaGamePreview'
    : isLinePlayFlowPreview
    ? 'LinePlay'
    : isQueueTimesPreview
    ? 'QueueTimesPreview'
    : isParkArrivalPreview
    ? 'ParkArrivalPreview'
    : isParkChecklistPreview
    ? 'ParkChecklistPreview'
    : isInventoryPreview
    ? 'InventoryPreview'
    : isProfilePreview
    ? 'ProfilePreview'
    : isRideLogSuccessPreview
    ? 'RideLogSuccessPreview'
    : isRideLogPreview
    ? 'RideLog'
    : isRideBatchPreview
    ? 'RideBatchConfirm'
    : isRideDetectionPreview
    ? 'RideTracker'
    : isRescuePassPreview
    ? 'RescuePassPreview'
    : isStampBookPreview
    ? 'StampBook'
    : isQueueStampPreview
    ? 'QueueStampPreview'
    : isRideGamePreview
    ? 'MiniGameTester'
    : isCoinShelfPreview
    ? 'CoinShelf'
    : isRideTrackerPreview
    ? 'RideTracker'
    : isCoinLevelingPreview
    ? 'CoinLevelingPreview'
    : isHomeHuntPreview || isTutorialPreview
    ? 'HomeHuntPreview'
    : isSetCollectionPreview
    ? 'SetCollectionPreview'
    : isCrewGridPreview
    ? 'CrewGridPreview'
    : isParkDayRecapPreview
    ? 'ParkDayRecapPreview'
    : isTripGoalPreview
    ? 'TripGoalPreview'
    : isParkProjectPreview
      ? 'ParkProjectPreview'
      : isCrewRelayPreview
        ? 'CrewRelayPreview'
        : isPostWinRewardsPreview
          ? 'PostWinRewardsPreview'
          : 'Splash';
  useAppUpdates();
  const { player } = useContext(AuthContext);
  const { setCrumbs, crumbsLoaded } = useContext(CrumbContext);
  const { retrieveCurrencies, currenciesLoaded } = useContext(CurrencyContext);
  const { retrieveTheme, themeLoaded } = useContext(ThemeContext);
  const { devMode, setDevMode, moveDevLocation, location: currentLocation, permissionGranted } = useContext(LocationContext);
  // Keep ride detection alive as the guest moves between map, queue, and profile.
  // The service itself never asks for Always permission during app startup.
  useRideDetection(!isStandalonePreview && !!player && permissionGranted);
  const [fontsLoaded] = useFonts({
    Shark: require('../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../assets/fonts/knockout.otf'),
  });
  useAxiosSetup();

  const handleJoystickMove = useCallback((dx: number, dy: number, speed: number) => {
    moveDevLocation(dx, dy, speed);
  }, [moveDevLocation]);

  const handleJoystickStop = useCallback(() => {}, []);

  useAsyncEffect(async () => {
    if (isStandalonePreview) return;
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      testDeviceIdentifiers: ['EMULATOR'],
    });

    await mobileAds().initialize();

    InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);

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
  if (!fontsLoaded) {
    console.log('🦈 Waiting for fonts...');
    return <></>;
  }
  console.log('🦈 App loading! Theme:', themeLoaded, 'Currencies:', currenciesLoaded);

  return (
    <View style={{ flex: 1 }}>
    <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>
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
        {__DEV__ && <Stack.Screen name="QueueTimesPreview" component={QueueTimesPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="TriviaGamePreview" component={TriviaGamePreviewScreen} />}
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
        {__DEV__ && <Stack.Screen name="QueueStampPreview" component={QueueStampPreviewScreen} />}
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
        {__DEV__ && <Stack.Screen name="MiniGameTester" component={MiniGameTesterScreen} />}
        {__DEV__ && <Stack.Screen name="GameKitGym" component={GameKitGymScreen} />}
        {__DEV__ && <Stack.Screen name="ShelfArrivalPreview" component={ShelfArrivalPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="PostWinRewardsPreview" component={PostWinRewardsPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="CoinLevelingPreview" component={CoinLevelingPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="RescuePassPreview" component={RescuePassPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="ParkChecklistPreview" component={ParkChecklistPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="ParkArrivalPreview" component={ParkArrivalPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="CrewRelayPreview" component={CrewRelayPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="ParkProjectPreview" component={ParkProjectPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="TripGoalPreview" component={TripGoalPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="ParkDayRecapPreview" component={ParkDayRecapPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="CrewGridPreview" component={CrewGridPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="SetCollectionPreview" component={SetCollectionPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="HomeHuntPreview" component={HomeHuntPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="InventoryPreview" component={InventoryPreviewScreen} />}
        {__DEV__ && <Stack.Screen name="ProfilePreview" component={ProfilePreviewScreen} />}
        {__DEV__ && <Stack.Screen name="RideLogSuccessPreview" component={RideLogSuccessPreviewScreen} />}
        <Stack.Screen
          name="BananaBasket"
          component={BananaBasketScreen}
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />

      </Stack.Navigator>
      <RideDetectionOverlay />
      <SharkDropHandler />
    </NavigationContainer>
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
