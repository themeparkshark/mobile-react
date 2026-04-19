import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { navigationRef } from './RootNavigation';
import getCrumbs from './api/endpoints/crumbs/getCrumbs';
import { AuthContext } from './context/AuthProvider';
import { CrumbContext } from './context/CrumbProvider';
import { CurrencyContext } from './context/CurrencyProvider';
import { ThemeContext } from './context/ThemeProvider';
import { useAxiosSetup } from './hooks/useAxiosSetup';
import { useAppUpdates } from './hooks/useAppUpdates';
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
import MiniGameTesterScreen from './screens/MiniGameTesterScreen';
import PostWinRewardsPreviewScreen from './screens/PostWinRewardsPreviewScreen';
import CommunityCenterScreen from './screens/CommunityCenterScreen';
import SharkParkScreen from './screens/SharkParkScreen';
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

const Stack = createNativeStackNavigator();

export default function App() {
  useKeepAwake();
  useAppUpdates();
  const { setPlayer } = useContext(AuthContext);
  const { setCrumbs, crumbsLoaded } = useContext(CrumbContext);
  const { retrieveCurrencies, currenciesLoaded } = useContext(CurrencyContext);
  const { retrieveTheme, themeLoaded } = useContext(ThemeContext);
  const { devMode, setDevMode, moveDevLocation, location: currentLocation } = useContext(LocationContext);
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
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      testDeviceIdentifiers: ['EMULATOR'],
    });

    await mobileAds().initialize();

    InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);

    setCrumbs(await getCrumbs());
    await retrieveTheme();
    await retrieveCurrencies();

    AsyncStorage.getItem('player').then((playerString: string | null) => {
      if (playerString) {
        setPlayer({ ...JSON.parse(playerString) });
      }
    });
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
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={__DEV__ ? "PostWinRewardsPreview" : "Splash"}
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
        <Stack.Screen name="RideBatchConfirm" component={RideBatchConfirmScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="MiniGameTester" component={MiniGameTesterScreen} />
        <Stack.Screen name="PostWinRewardsPreview" component={PostWinRewardsPreviewScreen} />

      </Stack.Navigator>
      <RideDetectionOverlay />
    </NavigationContainer>
    {__DEV__ && devMode && currentLocation && (
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
