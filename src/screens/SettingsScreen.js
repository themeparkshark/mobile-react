import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { SafeAreaView, PlatformColor } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { useContext } from 'react';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import dayjs from 'dayjs';
import * as WebBrowser from 'expo-web-browser';

export default function SettingsScreen() {
  const { user, logout } = useContext(AuthContext);

  return (
    <Wrapper>
      <Topbar text="Settings" />
      <SafeAreaView>
        <TableView>
          <Section header={'General'.toUpperCase()}>
            <Cell
              title="Theme Park Shark ID"
              cellStyle="RightDetail"
              detail={user.username}
            />
            <Cell
              title="Email"
              cellStyle="RightDetail"
              detail={user.email}
              accessory="DisclosureIndicator"
            />
            <Cell
              title="Joined on"
              cellStyle="RightDetail"
              detail={dayjs(user.created_at).format('DD MMMM YYYY')}
            />
          </Section>
          <Section header={'Help'.toUpperCase()}>
            <Cell
              title="Terms of Service"
              titleTextStyle={{
                color: PlatformColor('systemBlue'),
              }}
              onPress={() => WebBrowser.openBrowserAsync('https://themeparkshark.com/info/terms-of-service')}
            />
            <Cell
              title="Privacy Policy"
              titleTextStyle={{
                color: PlatformColor('systemBlue'),
              }}
              onPress={() => WebBrowser.openBrowserAsync('https://themeparkshark.com/info/privacy-policy')}
            />
          </Section>
          <Section footer={`© Theme Park Shark ${new Date().getFullYear()} v1.0`}>
            <Cell
              title="Delete My Account"
              titleTextStyle={{
                color: PlatformColor('systemRed'),
              }}
              onPress={() => logout()}
            />
            <Cell
              title="Sign Out"
              titleTextStyle={{
                color: PlatformColor('systemBlue'),
              }}
              onPress={() => logout()}
            />
          </Section>
        </TableView>
      </SafeAreaView>
    </Wrapper>
  );
};
