import { View, Text } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import getInventory from '../api/endpoints/me/inventory';

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);
  const { setInventory, isReady, user } = useContext(AuthContext);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    (async () => {
      setInventory(await getInventory());

      setLoading(false);
    })();
  }, [isReady]);

  useEffect(() => {
    if (!loading) {
      if (!user?.username) {
        RootNavigation.navigate('Welcome');
        return;
      }

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
      <Text>Loading...</Text>
    </View>
  );
}
