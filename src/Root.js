import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from './context/AuthProvider';
import { ThemeContext } from './context/ThemeProvider';
import { navigationRef } from './RootNavigation';
import LoginScreen from './screens/Auth/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';
import InventoryScreen from './screens/InventoryScreen';
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
import { Audio } from 'expo-av';
import client from './api/client';
import LeaderboardScreen from './screens/LeaderboardScreen';
import PinCollectionScreen from './screens/PinCollectionsScreen';
import UpdateEmailScreen from './screens/SettingsScreen/UpdateEmailScreen';
import SocialScreen from './screens/SocialScreen';

const Stack = createNativeStackNavigator();

const HomeStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="Loading"
        component={LoadingScreen}
        options={{
          animation: 'none',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Error"
        component={ErrorScreen}
        options={{
          animation: 'none',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Store"
        component={StoreScreen}
      />
      <Stack.Screen
        name="PinCollections"
        component={PinCollectionScreen}
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
      <Stack.Screen
        name="Entry"
        component={EntryScreen}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          animation: 'none',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="User"
        component={UserScreen}
      />
      <Stack.Screen
        name="Park"
        component={ParkScreen}
      />
      <Stack.Screen
        name="Inventory"
        component={InventoryScreen}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
      />
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
    </Stack.Navigator>
  );
};

const AuthStackNavigator = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
};

export default function App() {
  const { user, setUser } = useContext(AuthContext);
  const { setTheme, theme } = useContext(ThemeContext);
  const [isPlaying, setIsPlaying] = useState(false);

  useFonts({
    'Shark': require('../assets/fonts/shark-random-funnyness-2.ttf'),
    'Knockout': require('../assets/fonts/knockout.otf'),
  });

  useEffect(() => {
    client.get('/current-theme').then((response) => setTheme(response.data.data));

    Storage.getItem({ key: 'user' }).then((userString) => {
      if (userString) {
        setUser({ ...JSON.parse(userString) });
      }
    }).catch((err) => {
      console.log(err);
    });
  }, []);

  useEffect(() => {
    if (theme?.music.length && !isPlaying) {
      (async () => {
        const music = theme.music[Math.floor(Math.random() * theme.music.length)];

        const { sound } = await Audio.Sound.createAsync({
          uri: music.source_url,
        });

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            sound.unloadAsync();
            setIsPlaying(false);
          }
        });
        await sound.playAsync();
        setIsPlaying(true);
      })();
    }
  }, [theme?.id, isPlaying]);

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
