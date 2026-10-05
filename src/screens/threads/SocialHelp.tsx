/**
 * The "?" on Shark Social: three picture rules, one line each. It replaces a
 * generic game help sheet that talked about Shark Park and never mentioned
 * posting, kindness or safety.
 */
import { openExternal } from '../../services/external';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import { SUPPORT_EMAIL } from '../Settings/accountDeletion';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND, GameButton, GameIcon, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { COMPOSE_ART, PressScale } from './socialLook';

const SHARK = require('../../../assets/images/screens/pin-collections/shark.png');

const RULES: readonly { icon?: GameIconName; art?: number; title: string; line: string }[] = [
  { art: COMPOSE_ART, title: 'Share your park day', line: 'Rides, snacks, outfits and collections.' },
  { icon: 'heart', title: 'Be kind', line: 'Nice words only. Mean posts get removed.' },
  { icon: 'lock', title: 'Stay secret', line: 'Never share your real name, address, school or phone.' },
  { icon: 'info', title: 'See something bad?', line: 'Tap the dots, then Report. A grown-up will check it.' },
];

export default function SocialHelp() {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const reduced = useUiReducedMotion();

  return (
    <>
      <PressScale onPress={() => setOpen(true)} accessibilityLabel="How Shark Social works" hitSlop={8}>
        <GameIcon name="info" size={40} />
      </PressScale>
      <Modal
        isVisible={open}
        onBackdropPress={() => setOpen(false)}
        onSwipeComplete={() => setOpen(false)}
        swipeDirection="down"
        style={{ margin: 0, justifyContent: 'flex-end' }}
        backdropColor={BRAND.navy}
        backdropOpacity={0.35}
        animationIn={reduced ? 'fadeIn' : 'slideInUp'}
        animationOut={reduced ? 'fadeOut' : 'slideOutDown'}
        useNativeDriverForBackdrop
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Image source={SHARK} style={styles.shark} contentFit="contain" />
          <Text style={styles.title} accessibilityRole="header">Shark Social</Text>
          {RULES.map((rule) => (
            <View key={rule.title} style={styles.rule} accessible accessibilityLabel={`${rule.title}. ${rule.line}`}>
              <View style={styles.badge}>
                {rule.art ? <Image source={rule.art} style={{ width: 40, height: 40 }} contentFit="contain" /> : <GameIcon name={rule.icon as GameIconName} size={30} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ruleTitle}>{rule.title}</Text>
                <Text style={styles.ruleLine}>{rule.line}</Text>
              </View>
            </View>
          ))}
          <View style={styles.links}>
            <PressScale
              onPress={() => { setOpen(false); setTimeout(() => RootNavigation.navigate('BlockedPlayers'), 350); }}
              style={styles.link}
              accessibilityLabel="Blocked players"
            >
              <GameIcon name="lock" size={22} />
              <Text style={styles.linkText}>Blocked players</Text>
            </PressScale>
            <PressScale
              onPress={() => void openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Shark Social (parent)')}`, 'system')}
              style={styles.link}
              accessibilityLabel={`Parents: email ${SUPPORT_EMAIL}`}
            >
              <GameIcon name="info" size={22} />
              <Text style={styles.linkText}>Parents: email us</Text>
            </PressScale>
          </View>
          <GameButton label="Got it" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: BRAND.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 3,
    borderBottomWidth: 0,
    borderColor: BRAND.navy,
    paddingHorizontal: 18,
    paddingTop: 54,
    gap: 10,
    alignItems: 'stretch',
  },
  shark: { position: 'absolute', top: -70, alignSelf: 'center', width: 130, height: 115 },
  title: { fontFamily: 'Shark', fontSize: 28, color: BRAND.navy, textAlign: 'center' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 3, borderColor: '#0a4f9c', padding: 10 },
  badge: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e8f4ff', alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy, marginTop: 2 },
  ruleLine: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.navySoft },
  links: { flexDirection: 'row', gap: 10 },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 999, backgroundColor: '#e8f4ff', borderWidth: 2, borderColor: '#bcd8f5' },
  linkText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 3 },
});
