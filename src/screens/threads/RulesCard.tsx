/**
 * Once, before a kid's first post: three picture rules and a big "I promise".
 * The composer opens only after this sheet has fully closed (two native
 * modals cannot change places at the same moment on iOS).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND, GameButton, GameIcon, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

const SHARK = require('../../../assets/images/screens/pin-collections/shark.png');

export const rulesKey = (playerId?: number) => `social.rules.v1.${playerId ?? 'guest'}`;

export async function hasPromised(playerId?: number): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(rulesKey(playerId))) === 'yes';
  } catch {
    return false;
  }
}

const RULES: readonly { icon: GameIconName; title: string; line: string }[] = [
  { icon: 'heart', title: 'Be kind', line: 'Nice words only.' },
  { icon: 'lock', title: 'Stay secret', line: 'No real names, addresses, schools or phone numbers.' },
  { icon: 'shark', title: 'Never meet up', line: "Don't plan to meet people from the app." },
];

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
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Image source={SHARK} style={styles.shark} contentFit="contain" />
        <Text style={styles.title} accessibilityRole="header">Shark Social rules</Text>
        {RULES.map((rule) => (
          <View key={rule.title} style={styles.rule} accessible accessibilityLabel={`${rule.title}. ${rule.line}`}>
            <View style={styles.badge}><GameIcon name={rule.icon} size={30} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>{rule.title}</Text>
              <Text style={styles.ruleLine}>{rule.line}</Text>
            </View>
          </View>
        ))}
        <GameButton
          label="I promise"
          icon="check"
          onPress={() => {
            promised.current = true;
            AsyncStorage.setItem(rulesKey(playerId), 'yes').catch(() => undefined);
            onCancel();
          }}
        />
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
