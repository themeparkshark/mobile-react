import { View, Text } from 'react-native';
import { useEffect, useContext, useState } from 'react';
import { ThemeContext } from '../context/ThemeProvider';
import * as RootNavigation from '../RootNavigation';
import client from '../api/client';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { setTheme } = useContext(ThemeContext);

  useEffect(() => {
    client.get('/current-theme').then((response) => {
      setTheme(response.data.data)
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) {
      RootNavigation.navigate('Explore');
    }
  }, [loading]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text>
        Loading...
      </Text>
    </View>
  );
};
