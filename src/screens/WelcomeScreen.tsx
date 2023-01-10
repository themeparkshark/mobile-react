import { Button, Text, TextInput, View } from 'react-native';
import { useCallback, useContext, useLayoutEffect, useState } from 'react';
import updateUser from '../api/endpoints/me/update-user';
import { AuthContext } from '../context/AuthProvider';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';

export default function WelcomeScreen({ navigation }) {
  const [username, setUsername] = useState<string>('');
  const { refreshUser } = useContext(AuthContext);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Welcome screen.');
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          title="Next"
          onPress={async () => {
            await updateUser({
              username,
            });

            await refreshUser();

            navigation.navigate('Explore');
          }}
        />
      ),
    });
  }, [navigation, username]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text>Welcome! Get started by entering a username below:</Text>
      <TextInput
        style={{
          height: 40,
          width: 200,
          margin: 12,
          borderWidth: 1,
          padding: 10,
        }}
        onChangeText={setUsername}
        value={username}
        maxLength={12}
      />
    </View>
  );
}
