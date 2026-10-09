import { openAppSettings, openExternal, openLegal } from '../services/external';
import dayjs from 'dayjs';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Application from 'expo-application';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import deletePlayer from '../api/endpoints/me/delete';
import deleteAccountNow from '../api/endpoints/me/delete-account';
import { showToast } from '../utils/toast';
import updatePlayer from '../api/endpoints/me/update-player';
import FindOriginalAccount from '../components/FindOriginalAccount';
import { openFeedbackReport } from '../components/Feedback/FeedbackHost';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { LocationStatusContext } from '../context/LocationProvider';
import useCrumbs from '../hooks/useCrumbs';
import { useHelp } from '../components/help/HelpProvider';
import { RECOVERY_COPY } from '../services/accountRecovery/model';
import { FEEDBACK_COPY } from '../services/feedback/model';
import { syncBackgroundRideDetection } from '../services/RideDetectionService';
import { BRAND, confirmGame, GameIcon, gameAlert, RADIUS, SHADOW, SharkLoader, showGameDialog, textPreset, type GameIconName } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import {
  appleReconfirmFromError, DELETION_COPY, deletionDoneMessage, runAccountDeletion, SUPPORT_EMAIL, supportMailto,
  type AppleReconfirm,
} from './Settings/accountDeletion';
import { copyrightLine } from '../api/platform';
import { setBatterySaver, useBatterySaver } from '../power';

/** Settings-only art (GPT Image 2.5 from Alex's references, see tps-prime-time-audit/art-ws8). */
const SETTINGS_ART = {
  music: require('../../assets/images/screens/settings/music.png'),
  sound: require('../../assets/images/screens/settings/sound.png'),
  mail: require('../../assets/images/screens/settings/mail.png'),
  trash: require('../../assets/images/screens/settings/trash.png'),
} as const;

type RowArt = GameIconName | keyof typeof SETTINGS_ART;

function RowIcon({ art }: { readonly art: RowArt }) {
  if (art in SETTINGS_ART) {
    return <Image source={SETTINGS_ART[art as keyof typeof SETTINGS_ART]} style={styles.rowArt} contentFit="contain" />;
  }
  return <GameIcon name={art as GameIconName} size={30} />;
}

// --- Reusable row components ---

function Section({ title, index, children }: { readonly title: string; readonly index: number; readonly children: React.ReactNode }) {
  const reduced = useUiReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(60 + index * 55).springify().damping(16).stiffness(180)}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </Animated.View>
  );
}

function SettingsRow({
  art,
  title,
  detail,
  onPress,
  accessory,
  isLast = false,
  destructive = false,
}: {
  art: RowArt;
  title: string;
  detail?: string;
  onPress?: () => void;
  accessory?: React.ReactNode;
  isLast?: boolean;
  destructive?: boolean;
}) {
  const content = (pressed = false) => (
    <View style={[styles.row, !isLast && styles.rowBorder, pressed && styles.rowPressed]}>
      <View style={styles.iconWell}><RowIcon art={art} /></View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, destructive && { color: BRAND.redLip }]}>{title}</Text>
        {!!detail && <Text style={styles.rowDetail} numberOfLines={2}>{detail}</Text>}
      </View>
      {accessory ?? (onPress ? <GameIcon name="arrow" size={22} /> : null)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        onPress={() => { void Haptics.selectionAsync().catch(() => undefined); onPress(); }}
      >
        {({ pressed }) => content(pressed)}
      </Pressable>
    );
  }

  return content();
}

function BrandSwitch({ value, onValueChange, label }: { readonly value?: boolean; readonly onValueChange: () => void; readonly label: string }) {
  return (
    <Switch
      accessibilityLabel={label}
      trackColor={{ false: BRAND.sky, true: BRAND.blueBright }}
      ios_backgroundColor={BRAND.sky}
      thumbColor={BRAND.white}
      onValueChange={() => { void Haptics.selectionAsync().catch(() => undefined); onValueChange(); }}
      value={value}
    />
  );
}

/** Apple re-confirm before deletion, so the server can revoke this app's Sign in with Apple grant. */
async function reconfirmWithApple(): Promise<AppleReconfirm> {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync().catch(() => false))) {
    return { kind: 'unavailable' };
  }
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return credential.authorizationCode ? { kind: 'code', code: credential.authorizationCode } : { kind: 'unavailable' };
  } catch (error) {
    return appleReconfirmFromError(error);
  }
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { player, logout, refreshPlayer } = useContext(AuthContext);
  const [enabledMusic, setEnabledMusic] = useState<boolean>();
  const batterySaver = useBatterySaver();
  const [enabledSoundEffects, setEnabledSoundEffects] = useState<boolean>();
  const [backgroundLocationEnabled, setBackgroundLocationEnabled] = useState(false);
  const [backgroundLocationBusy, setBackgroundLocationBusy] = useState(false);
  const [findingOriginal, setFindingOriginal] = useState(false);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [wishlistAlerts, setWishlistAlerts] = useState<boolean>(!!player?.wishlist_alerts);
  const accountAction = useRef(false);
  const { urls, labels } = useCrumbs();
  const { reset, devMode, setDevMode } = useContext(LocationStatusContext);
  const { replayAllTutorials, openHowToPlay } = useHelp();

  useEffect(() => {
    setEnabledMusic(player?.enabled_music);
    setEnabledSoundEffects(player?.enabled_sound_effects);
    setWishlistAlerts(!!player?.wishlist_alerts);
  }, [player]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      Location.getBackgroundPermissionsAsync()
        .then(permission => { if (mounted) setBackgroundLocationEnabled(permission.granted); })
        .catch(() => { if (mounted) setBackgroundLocationEnabled(false); });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const enableBackgroundLocation = async () => {
    if (backgroundLocationBusy) return;
    setBackgroundLocationBusy(true);
    try {
      let permission = await Location.getBackgroundPermissionsAsync();
      if (permission.granted) {
        await syncBackgroundRideDetection();
        gameAlert('Ride Finder is on',
          'Your phone can find rides even when it is locked. You can turn this off in iPhone Settings.', undefined, { icon: 'pin' });
        return;
      }
      if (!permission.granted && !permission.canAskAgain) {
        gameAlert('Turn on Ride Finder',
          'Ride Finder needs location set to Always. Tap Open Settings, then Location, then Always.',
          [{ text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { openAppSettings(); } }], { icon: 'pin' });
        return;
      }
      if (!permission.granted) {
        // Say why in kid words before iPhone asks, and give a clear way out.
        const ok = await confirmGame({
          title: 'Find rides with your phone locked?',
          message: 'At the park, your phone can tell which ride you are near, even in your pocket. LinePlay keeps counting too. Say no and you can still play with the app open.',
          confirmLabel: 'Turn it on',
          cancelLabel: 'Not now',
          icon: 'pin',
        });
        if (!ok) return;
        permission = await Location.requestBackgroundPermissionsAsync();
      }
      setBackgroundLocationEnabled(permission.granted);
      if (permission.granted) await syncBackgroundRideDetection();
    } catch {
      gameAlert('Ride Finder is off', 'Ride Finder didn’t turn on. You can still play with the app open.');
    } finally {
      setBackgroundLocationBusy(false);
    }
  };

  const signOut = async () => {
    reset();
    await logout();
  };

  const openSupport = async (kind: 'help' | 'bug') => {
    const url = supportMailto(kind, {
      appVersion: Application.nativeApplicationVersion,
      osVersion: Platform.Version,
      playerId: player?.id,
    });
    try {
      if (await openExternal(url, 'system')) return;
    } catch { /* fall through to the address */ }
    gameAlert(kind === 'bug' ? 'Report a bug' : 'Need help?', `Email us at ${SUPPORT_EMAIL}. We will write back.`,
      undefined, { icon: 'info' });
  };

  const deleteAccount = async () => {
    if (accountAction.current) return;
    accountAction.current = true;
    try {
      const result = await runAccountDeletion({
        confirm: () => confirmGame({
          title: DELETION_COPY.confirmTitle,
          message: DELETION_COPY.confirmMessage,
          confirmLabel: DELETION_COPY.confirmLabel,
          cancelLabel: DELETION_COPY.keepLabel,
          destructive: true,
        }),
        reconfirmWithApple,
        deleteNow: deleteAccountNow,
        setBusy: busy => setAccountBusy(busy ? DELETION_COPY.busy : null),
      });
      if (result.outcome === 'deleted') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        // The session is gone on the server; sign out once the player has read the notice.
        await showGameDialog({ title: DELETION_COPY.doneTitle, message: deletionDoneMessage(result.result), icon: 'check',
          buttons: [{ text: 'OK' }], dismissible: false, haptic: 'none' });
        await signOut();
      } else if (result.outcome === 'emailSent') {
        // Server without immediate delete: the emailed link finishes it, so the player stays signed in.
        gameAlert(DELETION_COPY.emailTitle, DELETION_COPY.emailMessage, undefined, { icon: 'bell' });
      } else if (result.outcome === 'failed') {
        gameAlert(DELETION_COPY.failTitle, DELETION_COPY.failMessage, [
          { text: 'Cancel', style: 'cancel' },
          { text: DELETION_COPY.retryLabel, onPress: () => { void deleteAccount(); } },
        ], { haptic: 'warning' });
      }
    } finally {
      accountAction.current = false;
    }
  };

  const deactivateAccount = async () => {
    if (accountAction.current) return;
    accountAction.current = true;
    try {
      const confirmed = await confirmGame({
        title: DELETION_COPY.deactivateTitle,
        message: DELETION_COPY.deactivateMessage,
        confirmLabel: DELETION_COPY.deactivateLabel,
        destructive: true,
      });
      if (!confirmed) return;
      setAccountBusy('Pausing your account');
      try {
        await deletePlayer();
      } catch {
        setAccountBusy(null);
        gameAlert(DELETION_COPY.deactivateFailTitle, DELETION_COPY.deactivateFailMessage);
        return;
      }
      setAccountBusy(null);
      await signOut();
    } finally {
      accountAction.current = false;
    }
  };

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
        <Section title="General" index={0}>
          <SettingsRow art="shark" title="Username" detail={player.screen_name} />
          <SettingsRow art="fin" title="Theme Park Shark ID" detail={player.email} />
          <SettingsRow art="star" title="Member Since" detail={dayjs(player.created_at).format('MMMM D, YYYY')} isLast />
        </Section>

        <Section title="Audio" index={1}>
          <SettingsRow
            art="music"
            title="Music"
            accessory={
              <BrandSwitch
                label="Music"
                value={enabledMusic}
                onValueChange={async () => {
                  setEnabledMusic(!enabledMusic);
                  await updatePlayer({ enabled_music: !player.enabled_music }).catch(() => undefined);
                  await refreshPlayer().catch(() => undefined);
                }}
              />
            }
          />
          <SettingsRow
            art="sound"
            title="Sound Effects"
            accessory={
              <BrandSwitch
                label="Sound effects"
                value={enabledSoundEffects}
                onValueChange={async () => {
                  setEnabledSoundEffects(!enabledSoundEffects);
                  await updatePlayer({ enabled_sound_effects: !player?.enabled_sound_effects }).catch(() => undefined);
                  await refreshPlayer().catch(() => undefined);
                }}
              />
            }
          />
          {/* Shark Shop wishlist: one note when a hearted item is back (promotional, so opt-in and off any time). */}
          <SettingsRow
            art="heart"
            title="Favorites Alerts"
            isLast
            accessory={
              <BrandSwitch
                label="Favorites alerts"
                value={!!wishlistAlerts}
                onValueChange={async () => {
                  const next = !wishlistAlerts;
                  setWishlistAlerts(next);
                  try {
                    await updatePlayer({ wishlist_alerts: next });
                    await refreshPlayer().catch(() => undefined);
                  } catch {
                    // Say so and put the switch back: never a silent save failure.
                    setWishlistAlerts(!next);
                    showToast('Couldn’t save Favorites Alerts. Try again.', 'warning');
                  }
                }}
              />
            }
          />
        </Section>

        <Section title="Park Play" index={2}>
          <SettingsRow
            art="pin"
            title="Ride Finder"
            detail={backgroundLocationBusy ? 'Checking...'
              : backgroundLocationEnabled ? 'On: finds rides while your phone is locked'
                : 'Off: tap to turn on for park days'}
            onPress={enableBackgroundLocation}
          />
          {/* Battery Saver (src/power): every feature stays; the game rests its
              extra motion and checks for news less often. */}
          <SettingsRow
            art="star"
            title="Battery Saver"
            detail={batterySaver ? 'On: calmer map, longer park days' : 'Off: full sparkle'}
            isLast
            accessory={
              <BrandSwitch label="Battery saver" value={batterySaver} onValueChange={() => setBatterySaver(!batterySaver)} />
            }
          />
        </Section>

        {/* Internal QA controls never appear in the guest-facing build. */}
        {__DEV__ && (
          <Section title="Developer" index={3}>
            <SettingsRow
              art="map"
              title="GPS Joystick"
              detail="Simulate movement with on-screen joystick"
              accessory={<BrandSwitch label="GPS joystick" onValueChange={() => setDevMode(!devMode)} value={devMode} />}
            />
            <SettingsRow
              art="play"
              title="Mini-Game Tester"
              detail="Play and test all mini-games"
              isLast
              onPress={() => (navigation as any).navigate('MiniGameTester')}
            />
          </Section>
        )}

        <Section title="Help" index={4}>
          <SettingsRow
            art="info"
            title="How to Play"
            detail="Every feature and word, explained"
            onPress={() => openHowToPlay()}
          />
          <SettingsRow
            art="retry"
            title="Replay Tutorials"
            detail="See every tip again"
            onPress={() => {
              void replayAllTutorials().then(() => {
                gameAlert('Tutorials ready', 'Finn will show every tip again as you play.', undefined, { icon: 'retry' });
              });
            }}
          />
          <SettingsRow art="edit" title="Terms of Service" onPress={() => openLegal(urls.terms)} />
          <SettingsRow art="lock" title="Privacy Policy" onPress={() => openLegal(urls.privacy_policy)} />
          <SettingsRow art="mail" title="Need Help?" detail={SUPPORT_EMAIL} onPress={() => { void openSupport('help'); }} />
          <SettingsRow art="wrench" title={FEEDBACK_COPY.settingsTitle} detail={FEEDBACK_COPY.settingsDetail} isLast
            onPress={() => openFeedbackReport('settings')} />
        </Section>

        <Section title="Account" index={5}>
          <SettingsRow art="search" title={RECOVERY_COPY.entryDetail} detail="Played the old Theme Park Shark app? Get that account back"
            onPress={() => setFindingOriginal(true)} />
          <SettingsRow art="back" title="Sign Out" onPress={() => { void signOut(); }} />
          <SettingsRow art="pause" title="Pause My Account" detail="Take a break. Sign in again any time" destructive
            onPress={() => { void deactivateAccount(); }} />
          <SettingsRow art="trash" title="Delete My Account Forever" detail="Deletes your account and progress now" destructive
            isLast onPress={() => { void deleteAccount(); }} />
        </Section>

        <Text style={styles.copyright}>{copyrightLine()}</Text>
        <Text style={styles.disclaimer}>
          Theme Park Shark is an independent fan app. It is not affiliated with, endorsed by, or sponsored by
          any theme park or its owners. Park and attraction names are used only to identify real places.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
      <FindOriginalAccount visible={findingOriginal} onClose={() => setFindingOriginal(false)} />
      {accountBusy && (
        <Animated.View entering={FadeIn.duration(160)} style={styles.busyScrim} accessibilityViewIsModal>
          <View style={styles.busyCard}>
            <SharkLoader compact title={accountBusy} />
          </View>
        </Animated.View>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  disclaimer: {
    ...textPreset('caption'), color: BRAND.navySoft, textAlign: 'center', marginHorizontal: 28, marginTop: 6, marginBottom: 12, lineHeight: 15,
  },
  scroll: {
    flex: 1,
    marginTop: -8,
    backgroundColor: '#e3f3ff',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 12,
  },
  sectionHeader: {
    fontFamily: 'Shark',
    fontSize: 17,
    color: BRAND.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 18,
    marginLeft: 6,
  },
  card: {
    backgroundColor: BRAND.white,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: '#cfe8fb',
    ...SHADOW.card,
    shadowOpacity: 0.12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
  },
  rowPressed: {
    backgroundColor: BRAND.cream,
    transform: [{ scale: 0.985 }],
  },
  rowBorder: {
    borderBottomWidth: 2,
    borderBottomColor: '#eef6fd',
  },
  iconWell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: BRAND.cream,
    borderWidth: 2,
    borderColor: BRAND.creamDeep,
  },
  rowArt: {
    width: 30,
    height: 30,
  },
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    ...textPreset('label'),
    fontSize: 17,
  },
  rowDetail: {
    ...textPreset('bodySmall'),
    color: BRAND.navySoft,
    marginTop: 1,
  },
  copyright: {
    ...textPreset('caption'),
    color: BRAND.navySoft,
    textAlign: 'center',
    marginTop: 24,
  },
  busyScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyCard: {
    minWidth: 240,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: RADIUS.xl,
    backgroundColor: BRAND.cream,
    borderWidth: 4,
    borderColor: BRAND.white,
    ...SHADOW.lifted,
  },
});
