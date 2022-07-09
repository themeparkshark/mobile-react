import { View, Text } from 'react-native';
import { useEffect, useContext, useState } from 'react';
import { ThemeContext } from '../context/ThemeProvider';
import * as RootNavigation from '../RootNavigation';
import client from '../api/client';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { setTheme } = useContext(ThemeContext);

  useEffect(() => {
    Promise.all([
      client.get('/health'),
      client.get('/current-theme'),
    ]).then((responses) => {
      const [health, theme] = responses;

      if (
        health.status !== 200
        || health.data.checkResults.filter((result) => result.status === 'failed').length)
      {
        return RootNavigation.navigate('Error');
      }

      setTheme(theme.data.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) {
      RootNavigation.navigate('Explore');
    }
  }, [loading]);

  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text>
        Loading...
      </Text>
    </View>
  );
};
