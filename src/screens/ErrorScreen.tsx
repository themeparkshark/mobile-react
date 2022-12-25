import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import recordActivity from '../api/endpoints/activities/create';

export default function ErrorScreen() {
  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Error screen.');
    }, [])
  );

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text>There was an error.</Text>
    </View>
  );
}
