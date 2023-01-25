import Topbar from '../components/Topbar';
import {
  Alert,
  PlatformColor,
  SafeAreaView,
  ScrollView,
  Switch,
} from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import dayjs from 'dayjs';
import * as WebBrowser from 'expo-web-browser';
import deleteUser from '../api/endpoints/me/delete';
import * as RootNavigation from '../RootNavigation';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import updateUser from '../api/endpoints/me/update-user';
import Constants from 'expo-constants';

export default function SettingsScreen() {
  const { user, logout, refreshUser } = useContext(AuthContext);
  const [enabledMusic, setEnabledMusic] = useState<boolean>();
  const [enabledSoundEffects, setEnabledSoundEffects] = useState<boolean>();

  useEffect(() => {
    setEnabledMusic(user?.enabled_music);
    setEnabledSoundEffects(user?.enabled_sound_effects);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Settings screen.');
    }, [])
  );

  if (!user) {
    return;
  }

  return (
    <>
      <Topbar
        text="Settings"
        showBackButton={true}
        onBackButtonPress={async () => {
          await refreshUser();
        }}
      />
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
                title="Member since"
                cellStyle="RightDetail"
                detail={dayjs(user.created_at).format('DD MMMM YYYY')}
              />
            </Section>
            <Section header={'Audio'.toUpperCase()}>
              <Cell
                title="Music"
                cellStyle="RightDetail"
                cellAccessoryView={
                  <Switch
                    onValueChange={async () => {
                      setEnabledMusic(!enabledMusic);
                      await updateUser({
                        enabled_music: !user.enabled_music,
                      });
                    }}
                    value={enabledMusic}
                  />
                }
              />
              <Cell
                title="Sound Effects"
                cellStyle="RightDetail"
                cellAccessoryView={
                  <Switch
                    onValueChange={async () => {
                      setEnabledSoundEffects(!enabledSoundEffects);
                      await updateUser({
                        enabled_sound_effects: !user?.enabled_sound_effects,
                      });
                    }}
                    value={enabledSoundEffects}
                  />
                }
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
              footer={`© Theme Park Shark ${new Date().getFullYear()} v${Constants.manifest.version}`}
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
