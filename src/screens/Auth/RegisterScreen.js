import { SafeAreaView, StyleSheet, TextInput, Button, Text } from 'react-native';
import { useState } from 'react';
import register from '../../api/endpoints/auth/register';

export default function RegisterScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  const onSubmit = () => {
    register(username, email, password, passwordConfirmation)
      .then((response) => {
        navigation.navigate('Explore');
      })
      .catch((error) => {
        console.log(error.response.data);
      });
  };

  return (
    <SafeAreaView>
      <TextInput
        style={styles.input}
        onChangeText={setUsername}
        value={username}
        placeholder="Username"
        type="numeric"
      />
      <TextInput
        style={styles.input}
        onChangeText={setEmail}
        value={email}
        placeholder="Email address"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        onChangeText={setPassword}
        value={password}
        placeholder="Password"
        keyboardType="default"
        secureTextEntry={true}
      />
      <TextInput
        style={styles.input}
        onChangeText={setPasswordConfirmation}
        value={passwordConfirmation}
        placeholder="Confirm password"
        keyboardType="default"
        secureTextEntry={true}
      />
      <Button
        title="Register"
        onPress={() => onSubmit()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
  },
});
