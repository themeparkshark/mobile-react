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
import getCrumbs from './api/endpoints/crumbs/getCrumbs';
import getCurrentTheme from './api/endpoints/current-theme/get';
import { AuthContext } from './context/AuthProvider';
import { CrumbContext } from './context/CrumbProvider';
import { ThemeContext } from './context/ThemeProvider';
import { navigationRef } from './RootNavigation';
import LoginScreen from './screens/Auth/LoginScreen';
import EntryScreen from './screens/EntryScreen';
import ErrorScreen from './screens/ErrorScreen';
import ExploreScreen from './screens/ExploreScreen';
import FriendsScreen from './screens/FriendsScreen';
import InventoryScreen from './screens/InventoryScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import LoadingScreen from './screens/LoadingScreen';
import LogoutScreen from './screens/LogoutScreen';
import MembershipScreen from './screens/MembershipScreen';
import NewsScreen from './screens/NewsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ParkScreen from './screens/ParkScreen';
import PendingFriendRequestsScreen from './screens/PendingFriendRequestsScreen';
import PinCollectionScreen from './screens/PinCollectionsScreen';
import PinSwapsScreen from './screens/PinSwapsScreen';
import ProfileScreen from './screens/ProfileScreen';
import QueueTimesScreen from './screens/QueueTimesScreen';
import SettingsScreen from './screens/SettingsScreen';
import SocialScreen from './screens/SocialScreen';
import SplashScreen from './screens/SplashScreen';
import StoreScreen from './screens/StoreScreen';
import ThreadScreen from './screens/ThreadScreen';
import UserScreen from './screens/UserScreen';
import WatchScreen from './screens/WatchScreen';
import WelcomeScreen from './screens/WelcomeScreen';

const Stack = createNativeStackNavigator();

const HomeStackNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Loading"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="Error"
        component={ErrorScreen}
        options={{
          animation: 'none',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Logout"
        component={LogoutScreen}
        options={{
          animation: 'none',
          gestureEnabled: false,
        }}
      />
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
      <Stack.Screen name="Entry" component={EntryScreen} />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          animation: 'none',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="User" component={UserScreen} />
      <Stack.Screen name="Park" component={ParkScreen} />
      <Stack.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} />
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
      <Stack.Screen name="QueueTimes" component={QueueTimesScreen} />
      <Stack.Screen name="Friends" component={FriendsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen
        name="PendingFriendRequests"
        component={PendingFriendRequestsScreen}
      />
      <Stack.Screen name="Thread" component={ThreadScreen} />
      <Stack.Screen name="PinSwaps" component={PinSwapsScreen} />
      <Stack.Screen name="Membership" component={MembershipScreen} />
      <Stack.Screen name="Watch" component={WatchScreen} />
      <Stack.Screen
        name="Loading"
        component={LoadingScreen}
        options={{
          animation: 'none',
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
};

const AuthStackNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
      }}
    >
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
      <Stack.Screen name="User" component={UserScreen} />
      <Stack.Screen name="Park" component={ParkScreen} />
      <Stack.Screen name="Thread" component={ThreadScreen} />
      <Stack.Screen name="Entry" component={EntryScreen} />
    </Stack.Navigator>
  );
};

export default function App() {
  useKeepAwake();
  const { user, setUser } = useContext(AuthContext);
  const { setCrumbs } = useContext(CrumbContext);
  const { setTheme } = useContext(ThemeContext);
  const [fontsLoaded] = useFonts({
    Shark: require('../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../assets/fonts/knockout.otf'),
  });

  useAsyncEffect(async () => {
    if (!fontsLoaded) {
      return;
    }

    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      testDeviceIdentifiers: ['EMULATOR'],
    });

    await mobileAds().initialize();

    InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);

    setCrumbs(await getCrumbs());
    setTheme(await getCurrentTheme());

    Storage.getItem({ key: 'user' }).then((userString: string) => {
      if (userString) {
        setUser({ ...JSON.parse(userString) });
      }
    });
  }, [fontsLoaded]);

  return (
    <>
      {user ? (
        <NavigationContainer ref={navigationRef}>
          <HomeStackNavigator />
        </NavigationContainer>
      ) : (
        <NavigationContainer ref={navigationRef}>
          <AuthStackNavigator />
        </NavigationContainer>
      )}
    </>
  );
}
