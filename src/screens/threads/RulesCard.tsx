/**
 * Once, before a kid's first post: three picture rules and a big "I promise".
 * The composer opens only after this sheet has fully closed (two native
 * modals cannot change places at the same moment on iOS).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { acceptSocialRules, fetchSocialRules } from '../../api/endpoints/social';
import { BRAND, GameButton, GameIcon, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { SPRING } from '../../ui/motion';

const SHARK = require('../../../assets/images/screens/pin-collections/shark.png');

export const rulesKey = (playerId?: number) => `social.rules.v1.${playerId ?? 'guest'}`;

/** Promised on this phone, or on the server (a new phone does not ask again). */
export async function hasPromised(playerId?: number): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(rulesKey(playerId))) === 'yes') return true;
  } catch {
    // fall through to the server
  }
  try {
    const at = await fetchSocialRules();
    if (at) AsyncStorage.setItem(rulesKey(playerId), 'yes').catch(() => undefined);
    return Boolean(at);
  } catch {
    return false;
  }
}

const RULES: readonly { icon: GameIconName; title: string; line: string }[] = [
  { icon: 'heart', title: 'Be kind', line: 'Nice words only.' },
  { icon: 'lock', title: 'Stay secret', line: 'No real names, addresses, schools or phone numbers.' },
  { icon: 'shark', title: 'Never meet up', line: "Don't plan to meet people from the app." },
];

/**
 * T173: the three rules come in one at a time (a beat to look at each picture), and I promise wakes up
 * only once all three have shown. The promise sits above a small Not now, never right over the tab bar,
 * so a stray tap meant for the Map tab can never accept the rules.
 */
export const RULE_STEP_MS = 450;
export const PROMISE_READY_MS = RULE_STEP_MS * RULES.length + 450;

function RuleRow({ rule, progress }: { readonly rule: (typeof RULES)[number]; readonly progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
  return (
    <Animated.View style={style} accessible accessibilityLabel={`${rule.title}. ${rule.line}`}>
      <View style={styles.rule}>
        <View style={styles.badge}><GameIcon name={rule.icon} size={30} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ruleTitle}>{rule.title}</Text>
          <Text style={styles.ruleLine}>{rule.line}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function RulesCard({
  visible,
  playerId,
  onPromise,
  onCancel,
}: {
  readonly visible: boolean;
  readonly playerId?: number;
  /** Runs after the sheet has fully closed. */
  readonly onPromise: () => void;
  readonly onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useUiReducedMotion();
  const promised = useRef(false);
  const r0 = useSharedValue(0), r1 = useSharedValue(0), r2 = useSharedValue(0);
  const rows = [r0, r1, r2];
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!visible) { rows.forEach(v => { v.value = 0; }); setReady(false); return undefined; }
    const timers = rows.map((v, i) => setTimeout(() => {
      v.value = reduced ? withTiming(1, { duration: 120 }) : withSpring(1, SPRING.settle);
    }, i * RULE_STEP_MS));
    timers.push(setTimeout(() => setReady(true), PROMISE_READY_MS));
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced]);

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onCancel}
      onBackButtonPress={onCancel}
      onModalHide={() => {
        if (promised.current) {
          promised.current = false;
          setTimeout(onPromise, 60);
        }
      }}
      style={{ margin: 0, justifyContent: 'flex-end' }}
      backdropColor={BRAND.navy}
      backdropOpacity={0.45}
      animationIn={reduced ? 'fadeIn' : 'slideInUp'}
      animationOut={reduced ? 'fadeOut' : 'slideOutDown'}
      useNativeDriverForBackdrop
    >
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Image source={SHARK} style={styles.shark} contentFit="contain" />
        <Text style={styles.title} accessibilityRole="header">Shark Social rules</Text>
        {RULES.map((rule, i) => <RuleRow key={rule.title} rule={rule} progress={rows[i]} />)}
        <GameButton
          label="I promise"
          icon="check"
          disabled={!ready}
          onPress={() => {
            if (!ready) return;
            promised.current = true;
            AsyncStorage.setItem(rulesKey(playerId), 'yes').catch(() => undefined);
            acceptSocialRules().catch(() => undefined);
            onCancel();
          }}
        />
        {/* The lowest thing on the sheet: a stray tap toward the tab bar only closes it. */}
        <GameButton label="Not now" variant="ghost" size="compact" onPress={onCancel} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: BRAND.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 3, borderBottomWidth: 0,
    borderColor: BRAND.navy, paddingHorizontal: 18, paddingTop: 54, gap: 10,
  },
  shark: { position: 'absolute', top: -70, alignSelf: 'center', width: 130, height: 115 },
  title: { fontFamily: 'Shark', fontSize: 28, color: BRAND.navy, textAlign: 'center' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 3, borderColor: '#0a4f9c', padding: 10 },
  badge: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e8f4ff', alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, marginTop: 2 },
  ruleLine: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.navySoft },
});
