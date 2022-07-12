import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { Button, SafeAreaView } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { useContext } from 'react';
import * as RootNavigation from '../RootNavigation';

export default function SettingsScreen() {
  const { logout } = useContext(AuthContext);

  return (
    <Wrapper>
      <Topbar text="Settings" />
      <SafeAreaView>
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
