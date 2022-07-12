import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useContext, useEffect } from 'react';
import { AuthContext } from './context/AuthProvider';
import { navigationRef } from './RootNavigation';
import LoginScreen from './screens/Auth/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';
import InventoryScreen from './screens/InventoryScreen';
import NewsScreen from './screens/NewsScreen';
import ParkScreen from './screens/ParkScreen';
import ProfileScreen from './screens/ProfileScreen';
import LoadingScreen from './screens/LoadingScreen';
import ErrorScreen from './screens/ErrorScreen';
import StoreScreen from './screens/StoreScreen';
import { useFonts } from 'expo-font';
import { Storage } from 'expo-storage';
import SettingsScreen from './screens/SettingsScreen';

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
        }}
      />
      <Stack.Screen
        name="Error"
        component={ErrorScreen}
        options={{
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="Store"
        component={StoreScreen}
      />
      <Stack.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="News"
        component={NewsScreen}
        options={{
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="Park"
        component={ParkScreen}
        options={{
          headerShown: true,
          title: '',
        }}
      />
      <Stack.Screen
        name="Inventory"
        component={InventoryScreen}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
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

  useFonts({
    'Shark': require('../assets/fonts/shark-random-funnyness-2.ttf'),
    'Knockout': require('../assets/fonts/knockout.otf'),
  });

  useEffect(() => {
    Storage.getItem({ key: 'user' }).then((userString) => {
      if (userString) {
        setUser({ ...JSON.parse(userString) });
      }
    }).catch((err) => {
      console.log(err);
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
