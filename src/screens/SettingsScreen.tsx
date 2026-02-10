import dayjs from 'dayjs';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useContext, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
  faUser,
  faIdBadge,
  faCalendar,
  faMusic,
  faVolumeHigh,
  faFileContract,
  faShieldHalved,
  faEnvelope,
  faBug,
  faRightFromBracket,
  faUserSlash,
  faTrash,
  faChevronRight,
  faGamepad,
  faLocationCrosshairs,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';
import deletePlayer from '../api/endpoints/me/delete';
import forceDeletePlayer from '../api/endpoints/me/force-delete';
import updatePlayer from '../api/endpoints/me/update-player';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import useCrumbs from '../hooks/useCrumbs';
import { useTutorial } from '../components/Tutorial';

// --- Reusable row components ---

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  );
}

function SettingsRow({
  icon,
  iconColor = '#64748b',
  iconBg = 'rgba(0,0,0,0.04)',
  title,
  detail,
  onPress,
  accessory,
  isLast = false,
  destructive = false,
}: {
  icon: any;
  iconColor?: string;
  iconBg?: string;
  title: string;
  detail?: string;
  onPress?: () => void;
  accessory?: React.ReactNode;
  isLast?: boolean;
  destructive?: boolean;
}) {
  const content = (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
        <FontAwesomeIcon icon={icon} size={15} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, destructive && { color: '#ef4444' }]}>
          {title}
        </Text>
        {detail && (
          <Text style={styles.rowDetail} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
      {accessory ? (
        accessory
      ) : onPress ? (
        <FontAwesomeIcon icon={faChevronRight} size={13} color="#cbd5e1" />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { player, logout, refreshPlayer } = useContext(AuthContext);
  const [enabledMusic, setEnabledMusic] = useState<boolean>();
  const [enabledSoundEffects, setEnabledSoundEffects] = useState<boolean>();
  const { urls, labels } = useCrumbs();
  const { reset, devMode, setDevMode } = useContext(LocationContext);
  const { resetAll: resetTutorials } = useTutorial();

  useEffect(() => {
    setEnabledMusic(player?.enabled_music);
    setEnabledSoundEffects(player?.enabled_sound_effects);
  }, [player]);

  if (!player) {
    return null;
  }

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton onPress={async () => await refreshPlayer()} />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Settings</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* General */}
        <SectionHeader title="General" />
        <View style={styles.card}>
          <SettingsRow
            icon={faUser}
            iconColor={config.secondary}
            iconBg="rgba(0, 165, 245, 0.1)"
            title="Username"
            detail={player.screen_name}
          />
          <SettingsRow
            icon={faIdBadge}
            iconColor="#a855f7"
            iconBg="rgba(168, 85, 247, 0.1)"
            title="Theme Park Shark ID"
            detail={player.email}
          />
          <SettingsRow
            icon={faCalendar}
            iconColor="#22c55e"
            iconBg="rgba(34, 197, 94, 0.1)"
            title="Member Since"
            detail={dayjs(player.created_at).format('DD MMMM YYYY')}
            isLast
          />
        </View>

        {/* Audio */}
        <SectionHeader title="Audio" />
        <View style={styles.card}>
          <SettingsRow
            icon={faMusic}
            iconColor="#ec4899"
            iconBg="rgba(236, 72, 153, 0.1)"
            title="Music"
            accessory={
              <Switch
                trackColor={{ false: '#e2e8f0', true: config.secondary }}
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
          <SettingsRow
            icon={faVolumeHigh}
            iconColor="#f59e0b"
            iconBg="rgba(245, 158, 11, 0.1)"
            title="Sound Effects"
            isLast
            accessory={
              <Switch
                trackColor={{ false: '#e2e8f0', true: config.secondary }}
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
        </View>

        {/* Developer (debug only) */}
        {__DEV__ && (
          <>
            <SectionHeader title="Developer" />
            <View style={styles.card}>
              <SettingsRow
                icon={faLocationCrosshairs}
                iconColor="#64748b"
                iconBg="rgba(100, 116, 139, 0.1)"
                title="GPS Joystick"
                detail="Simulate movement with on-screen joystick"
                accessory={
                  <Switch
                    trackColor={{ false: '#e2e8f0', true: config.secondary }}
                    onValueChange={() => setDevMode(!devMode)}
                    value={devMode}
                  />
                }
              />
              <SettingsRow
                icon={faGamepad}
                iconColor="#64748b"
                iconBg="rgba(100, 116, 139, 0.1)"
                title="Mini-Game Tester"
                detail="Play and test all mini-games"
                onPress={() => (navigation as any).navigate('MiniGameTester')}
              />
              <SettingsRow
                icon={faRotateRight}
                iconColor="#64748b"
                iconBg="rgba(100, 116, 139, 0.1)"
                title="Reset Tutorials"
                detail="Show onboarding tutorial again"
                isLast
                onPress={() => {
                  resetTutorials();
                  Alert.alert('Tutorials Reset', 'All tutorials will show again on next visit.');
                }}
              />
            </View>
          </>
        )}

        {/* Help */}
        <SectionHeader title="Help" />
        <View style={styles.card}>
          <SettingsRow
            icon={faFileContract}
            iconColor={config.secondary}
            iconBg="rgba(0, 165, 245, 0.1)"
            title="Terms of Service"
            onPress={() => WebBrowser.openBrowserAsync(urls.terms)}
          />
          <SettingsRow
            icon={faShieldHalved}
            iconColor={config.secondary}
            iconBg="rgba(0, 165, 245, 0.1)"
            title="Privacy Policy"
            onPress={() => WebBrowser.openBrowserAsync(urls.privacy_policy)}
          />
          <SettingsRow
            icon={faEnvelope}
            iconColor="#64748b"
            iconBg="rgba(0,0,0,0.04)"
            title="Need Help?"
            detail="contact@themeparkshark.com"
          />
          <SettingsRow
            icon={faBug}
            iconColor="#64748b"
            iconBg="rgba(0,0,0,0.04)"
            title="Found a Bug?"
            detail="technical@themeparkshark.com"
            isLast
          />
        </View>

        {/* Account */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <SettingsRow
            icon={faRightFromBracket}
            iconColor={config.secondary}
            iconBg="rgba(0, 165, 245, 0.1)"
            title="Sign Out"
            onPress={() => {
              reset();
              logout();
            }}
          />
          <SettingsRow
            icon={faUserSlash}
            iconColor="#ef4444"
            iconBg="rgba(239, 68, 68, 0.08)"
            title="Deactivate My Account"
            destructive
            onPress={() => {
              Alert.alert(
                'Are you sure you want to deactivate your account?',
                'You can reactivate by signing in again.',
                [
                  { text: 'Cancel', style: 'cancel' },
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
          <SettingsRow
            icon={faTrash}
            iconColor="#ef4444"
            iconBg="rgba(239, 68, 68, 0.08)"
            title="Permanently Delete My Account"
            destructive
            isLast
            onPress={() => {
              Alert.alert(
                'Are you sure you want to permanently delete your account?',
                'This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
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
        </View>

        {/* Copyright */}
        <Text style={styles.copyright}>{labels.copyright}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    marginTop: -8,
    backgroundColor: '#f0f4f8',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 20,
  },
  sectionHeader: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#1a1a2e',
  },
  rowDetail: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  copyright: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 24,
  },
});
