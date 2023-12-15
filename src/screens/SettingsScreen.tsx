import dayjs from 'dayjs';
import * as WebBrowser from 'expo-web-browser';
import { useContext, useEffect, useState } from 'react';
import {
  Alert,
  PlatformColor,
  SafeAreaView,
  ScrollView,
  Switch,
} from 'react-native';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import deletePlayer from '../api/endpoints/me/delete';
import forceDeletePlayer from '../api/endpoints/me/force-delete';
import updatePlayer from '../api/endpoints/me/update-player';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function SettingsScreen() {
  const { player, logout, refreshPlayer } = useContext(AuthContext);
  const [enabledMusic, setEnabledMusic] = useState<boolean>();
  const [enabledSoundEffects, setEnabledSoundEffects] = useState<boolean>();
  const { urls, labels } = useCrumbs();
  const { reset } = useContext(LocationContext);

  useEffect(() => {
    setEnabledMusic(player?.enabled_music);
    setEnabledSoundEffects(player?.enabled_sound_effects);
  }, [player]);

  if (!player) {
    return;
  }

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton onPress={async () => await refreshPlayer()} />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Settings</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <SafeAreaView style={{ marginTop: -8, flex: 1 }}>
        <ScrollView>
          <TableView>
            <Section header={'General'.toUpperCase()}>
              <Cell
                title="Username"
                cellStyle="RightDetail"
                detail={player.screen_name}
              />
              <Cell
                title="Theme Park Shark ID"
                cellStyle="Subtitle"
                detail={player.email}
              />
              <Cell
                title="Member since"
                cellStyle="RightDetail"
                detail={dayjs(player.created_at).format('DD MMMM YYYY')}
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
                      await updatePlayer({
                        enabled_music: !player.enabled_music,
                      });
                      await refreshPlayer();
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
                      await updatePlayer({
                        enabled_sound_effects: !player?.enabled_sound_effects,
                      });
                      await refreshPlayer();
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
                onPress={() => {
                  WebBrowser.openBrowserAsync(urls.terms);
                }}
              />
              <Cell
                title="Privacy Policy"
                titleTextStyle={{
                  color: PlatformColor('systemBlue'),
                }}
                onPress={() => {
                  WebBrowser.openBrowserAsync(urls.privacy_policy);
                }}
              />
              <Cell
                title="Need help?"
                cellStyle="Subtitle"
                detail="Email: contact@themeparkshark.com"
              />
              <Cell
                title="Found a bug?"
                cellStyle="Subtitle"
                detail="Email: technical@themeparkshark.com"
              />
            </Section>
            <Section footer={labels.copyright}>
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
                          await deletePlayer();
                          await logout();
                        },
                      },
                    ]
                  );
                }}
              />
              <Cell
                title="Permanently Delete My Account"
                titleTextStyle={{
                  color: PlatformColor('systemRed'),
                }}
                onPress={() => {
                  Alert.alert(
                    'Are you sure you want to permanently delete your account?',
                    'This cannot be undone.',
                    [
                      {
                        text: 'Cancel',
                        style: 'cancel',
                      },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          await forceDeletePlayer();

                          Alert.alert(
                            'Please check your email in order to confirm to permanently delete your account.',
                            '',
                            [
                              {
                                text: 'Ok',
                                onPress: async () => {
                                  await logout();
                                },
                              },
                            ]
                          );
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
                onPress={() => {
                  reset();
                  logout();
                }}
              />
            </Section>
          </TableView>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
