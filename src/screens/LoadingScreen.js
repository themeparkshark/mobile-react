import { View, Text } from 'react-native';
import { useEffect, useContext, useState } from 'react';
import { ThemeContext } from '../context/ThemeProvider';
import * as RootNavigation from '../RootNavigation';
import currentTheme from '../api/endpoints/themes/current';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { setTheme } = useContext(ThemeContext);

  useEffect(() => {
    currentTheme().then((response) => {
      setTheme(response);
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
