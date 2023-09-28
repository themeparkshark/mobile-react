import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { Storage } from 'expo-storage';
import { useContext, useEffect } from 'react';
import mobileAds, {
  InterstitialAd,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';
import { AuthContext } from './context/AuthProvider';
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
import StoreScreen from './screens/StoreScreen';
import ThreadScreen from './screens/ThreadScreen';
import UserScreen from './screens/UserScreen';
import WatchScreen from './screens/WatchScreen';
import WelcomeScreen from './screens/WelcomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const { user, setUser } = useContext(AuthContext);

  useKeepAwake();
  const [fontsLoaded] = useFonts({
    Shark: require('../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../assets/fonts/knockout.otf'),
  });

  useEffect(() => {
    if (!fontsLoaded) {
      return;
    }

    mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      testDeviceIdentifiers: ['EMULATOR'],
    });

    mobileAds().initialize();

    InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);

    Storage.getItem({ key: 'user' }).then((userString: string) => {
      if (userString) {
        setUser({ ...JSON.parse(userString) });
      }
    });
  }, [fontsLoaded]);

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={user ? 'Loading' : 'Login'}
          screenOptions={{
            headerShown: false,
          }}
        >
          {!user && (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
            </>
          )}
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
      </NavigationContainer>
    </>
  );
}
