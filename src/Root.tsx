import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { Storage } from 'expo-storage';
import { useContext } from 'react';
import mobileAds, {
  InterstitialAd,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useAsyncEffect } from 'rooks';
import { navigationRef } from './RootNavigation';
import getCrumbs from './api/endpoints/crumbs/getCrumbs';
import { AuthContext } from './context/AuthProvider';
import { CrumbContext } from './context/CrumbProvider';
import { CurrencyContext } from './context/CurrencyProvider';
import { ThemeContext } from './context/ThemeProvider';
import { useAxiosSetup } from './hooks/useAxiosSetup';
import LoginScreen from './screens/Auth/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';
import FriendsScreen from './screens/FriendsScreen';
import InventoryScreen from './screens/InventoryScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import LoadingScreen from './screens/LoadingScreen';
import MembershipScreen from './screens/MembershipScreen';
import NewsScreen from './screens/NewsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ParkScreen from './screens/ParkScreen';
import PendingFriendRequestsScreen from './screens/PendingFriendRequestsScreen';
import PinCollectionScreen from './screens/PinCollectionsScreen';
import PinSwapsScreen from './screens/PinSwapsScreen';
import ProfileScreen from './screens/ProfileScreen';
import QueueTimesScreen from './screens/QueueTimesScreen';
import RedeemCoinCodeScreen from './screens/RedeemCoinCodeScreen';
import SettingsScreen from './screens/SettingsScreen';
import SocialScreen from './screens/SocialScreen';
import SplashScreen from './screens/SplashScreen';
import StoreScreen from './screens/StoreScreen';
import ThreadScreen from './screens/ThreadScreen';
import PlayerScreen from './screens/PlayerScreen';
import WatchScreen from './screens/WatchScreen';
import WelcomeScreen from './screens/WelcomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  useKeepAwake();
  const { setPlayer } = useContext(AuthContext);
  const { setCrumbs, crumbsLoaded } = useContext(CrumbContext);
  const { retrieveCurrencies, currenciesLoaded } = useContext(CurrencyContext);
  const { retrieveTheme, themeLoaded } = useContext(ThemeContext);
  const [fontsLoaded] = useFonts({
    Shark: require('../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../assets/fonts/knockout.otf'),
  });
  useAxiosSetup();

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

    Storage.getItem({ key: 'player' }).then((playerString: string) => {
      if (playerString) {
        setPlayer({ ...JSON.parse(playerString) });
      }
    });
  }, []);

  if (!fontsLoaded || !crumbsLoaded || !themeLoaded || !currenciesLoaded) {
    return <></>;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
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
          options={{
            gestureEnabled: false,
          }}
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
            gestureEnabled: false,
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
