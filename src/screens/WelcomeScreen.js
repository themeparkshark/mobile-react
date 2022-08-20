import { Button, Text, View, TextInput } from 'react-native';
import { useLayoutEffect, useState } from 'react';
import updateUsername from '../api/endpoints/me/update-username';

export default function WelcomeScreen({ navigation }) {
  const [username, setUsername] = useState();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          title="Next"
          onPress={async () => {
            await updateUsername({
              username,
            });

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
      <Text>
        Welcome! Get started by entering a username below:
      </Text>
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
