import Topbar from '../components/Topbar';
import { Alert, PlatformColor, SafeAreaView, ScrollView } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { useCallback, useContext } from 'react';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import dayjs from 'dayjs';
import * as WebBrowser from 'expo-web-browser';
import deleteUser from '../api/endpoints/me/delete';
import * as RootNavigation from '../RootNavigation';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';

export default function SettingsScreen() {
  const { user, logout } = useContext(AuthContext);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Settings screen.');
    }, [])
  );

  return (
    <>
      <Topbar text="Settings" showBackButton={true} />
      <SafeAreaView style={{ marginTop: -8, flex: 1 }}>
        <ScrollView>
          <TableView>
            <Section header={'General'.toUpperCase()}>
              <Cell
                title="Username"
                cellStyle="RightDetail"
                detail={user.screen_name}
              />
              <Cell
                title="Theme Park Shark ID"
                cellStyle="RightDetail"
                detail={user.email}
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
                onPress={() =>
                  WebBrowser.openBrowserAsync(
                    'https://themeparkshark.com/info/terms-of-service'
                  )
                }
              />
              <Cell
                title="Privacy Policy"
                titleTextStyle={{
                  color: PlatformColor('systemBlue'),
                }}
                onPress={() =>
                  WebBrowser.openBrowserAsync(
                    'https://themeparkshark.com/info/privacy-policy'
                  )
                }
              />
            </Section>
            <Section
              footer={`© Theme Park Shark ${new Date().getFullYear()} v1.0`}
            >
              <Cell
                title="Deactivate My Account"
                titleTextStyle={{
                  color: PlatformColor('systemRed'),
                }}
                onPress={() => {
                  Alert.alert(
                    'Are you sure you want to deactivate your account?',
                    'You can reactivate by signing in again.',
                    [
                      {
                        text: 'Cancel',
                        style: 'cancel',
                      },
                      {
                        text: 'Deactivate',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteUser();
                          await logout();

                          RootNavigation.navigate('Login');
                        },
                      },
                    ]
                  );
                }}
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
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
