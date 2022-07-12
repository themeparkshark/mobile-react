import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { Button, SafeAreaView, Text } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { useContext } from 'react';

export default function SettingsScreen() {
  const { logout } = useContext(AuthContext);

  return (
    <Wrapper>
      <Topbar text="Settings" />
      <SafeAreaView>
        <Text>Update email</Text>
        <Text>Sound volume</Text>
        <Text>Delete account</Text>
        <Text>Views Terms and Conditions</Text>
        <Button
          onPress={() => {
            logout();
          }}
          title="Sign out"
        />
      </SafeAreaView>
    </Wrapper>
  );
};
