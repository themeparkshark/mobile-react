import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from './context/AuthProvider';
import { navigationRef } from './RootNavigation';
import LoginScreen from './screens/Auth/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';
import InventoryScreen from './screens/InventoryScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import NewsScreen from './screens/NewsScreen';
import ParkScreen from './screens/ParkScreen';
import ProfileScreen from './screens/ProfileScreen';
import EntryScreen from './screens/EntryScreen';
import LoadingScreen from './screens/LoadingScreen';
import ErrorScreen from './screens/ErrorScreen';
import StoreScreen from './screens/StoreScreen';
import UserScreen from './screens/UserScreen';
import { useFonts } from 'expo-font';
import { Storage } from 'expo-storage';
import SettingsScreen from './screens/SettingsScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import PinCollectionScreen from './screens/PinCollectionsScreen';
import UpdateEmailScreen from './screens/SettingsScreen/UpdateEmailScreen';
import SocialScreen from './screens/SocialScreen';
import { useKeepAwake } from 'expo-keep-awake';
import QueueTimesScreen from './screens/QueueTimesScreen';

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
        name="Welcome"
        component={WelcomeScreen}
        options={{
          title: 'Welcome',
          headerBackVisible: false,
          headerShown: true,
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
      <Stack.Screen name="Inventory" component={InventoryScreen} options={{
        gestureEnabled: false,
      }}/>
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen
        name="UpdateEmail"
        component={UpdateEmailScreen}
        options={{
          headerBackTitle: 'Settings',
          title: 'Email',
          headerShown: true,
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
      <Stack.Screen name="QueueTimes" component={QueueTimesScreen} />
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
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
};

export default function App() {
  useKeepAwake();
  const { user, setUser } = useContext(AuthContext);

  useFonts({
    Shark: require('../assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('../assets/fonts/knockout.otf'),
  });

  useEffect(() => {
    Storage.getItem({ key: 'user' }).then((userString: string) => {
      if (userString) {
        setUser({ ...JSON.parse(userString) });
      }
    });
  }, []);

  return (
    <>
      {user ? (
        <NavigationContainer ref={navigationRef}>
          <HomeStackNavigator />
        </NavigationContainer>
      ) : (
        <NavigationContainer>
          <AuthStackNavigator />
        </NavigationContainer>
      )}
    </>
  );
}
