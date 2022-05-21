import { SafeAreaView, StyleSheet, TextInput, Button, Text } from 'react-native';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import login from '../../api/endpoints/auth/login';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('token');

  const onSubmit = async () => {
    const response = await login(email, password);
    SecureStore.setItemAsync('user', JSON.stringify(response));
  };

  return (
    <SafeAreaView>
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
      <Button
        title="Login"
        onPress={() => onSubmit()}
      />
      <Text onPress={() => navigation.navigate('Register')}>
        Create an account
      </Text>
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
