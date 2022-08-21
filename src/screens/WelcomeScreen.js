import { Button, Text, View, TextInput } from 'react-native';
import { useLayoutEffect, useState, useContext } from 'react';
import updateUsername from '../api/endpoints/me/update-username';
import { AuthContext } from '../context/AuthProvider';

export default function WelcomeScreen({ navigation }) {
  const [username, setUsername] = useState();
  const { updateUser } = useContext(AuthContext);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          title="Next"
          onPress={async () => {
            await updateUsername({
              username,
            });

            await updateUser();

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
