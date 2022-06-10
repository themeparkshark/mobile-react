import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { useContext, useEffect } from 'react';
import { AuthContext } from './context/AuthProvider';
import LoginScreen from './screens/Auth/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';

const Stack = createNativeStackNavigator();

const HomeStackNavigator = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Explore" component={ExploreScreen} />
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

  useEffect(() => {
    SecureStore.getItemAsync('user')
      .then((userString) => {
        if (userString) {
          setUser(JSON.parse(userString));
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  return (
    <>
      {user ? (
        <NavigationContainer>
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
