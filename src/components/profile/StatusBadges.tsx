/**
 * VIP and Verified on a profile: two solid chunky badges (Alex's pill style,
 * white edge and a darker lip, like the title pill), each with a one-line
 * meaning under the name so they read as badges, not as odd or disabled
 * buttons.
 *
 * - VIP opens the membership page (your perks, or how to join).
 * - Verified opens a short card that explains it.
 * Full opacity always; no pulsing.
 */
import { Image } from 'expo-image';
import { useContext, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import { SoundEffectContext, SoundEffectContextType } from '../../context/SoundEffectProvider';
import HapticPatterns from '../../helpers/hapticPatterns';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

type ChipProps = {
  icon: number;
  title: string;
  caption: string;
  fill: string;
  lip: string;
  ink: string;
  sub: string;
  label: string;
  hint: string;
  onPress: () => void;
};

function Chip({ icon, title, caption, fill, lip, ink, sub, label, hint, onPress }: ChipProps) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const reduced = useReducedGameMotion();
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPressIn={() => {
        if (!reduced) Animated.spring(scale, { toValue: 0.94, speed: 60, bounciness: 0, useNativeDriver: true }).start();
      }}
      onPressOut={() => {
        if (!reduced) Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: true }).start();
      }}
      onPress={() => {
        HapticPatterns.buttonTap();
        playSound(require('../../../assets/sounds/button_press.mp3'));
        onPress();
      }}
    >
      <Animated.View style={[styles.chip, { backgroundColor: fill, borderBottomColor: lip, transform: [{ scale }] }]}>
        <View style={styles.gloss} />
        <View style={styles.iconDisc}>
          <Image source={icon} style={styles.icon} contentFit="contain" />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.title, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {title}
          </Text>
          <Text style={[styles.caption, { color: sub }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {caption}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function StatusBadges({ isVip, isVerified, own }: {
  readonly isVip: boolean;
  readonly isVerified: boolean;
  /** The signed-in player's own profile. */
  readonly own: boolean;
}) {
  const [verifiedOpen, setVerifiedOpen] = useState(false);
  if (!isVip && !isVerified) return null;
  return (
    <View style={styles.row}>
      {isVip && (
        <Chip
          icon={require('../../../assets/images/screens/profile/subscribed.png')}
          title="VIP Member"
          caption={own ? 'See your perks' : 'Has VIP perks'}
          fill="#ffcf3b"
          lip="#d99a00"
          ink="#05346e"
          sub="#7a4f00"
          label={own ? 'VIP member' : 'This player is a VIP member'}
          hint={own ? 'Opens your VIP perks' : 'Opens VIP membership'}
          onPress={() => RootNavigation.navigate('Membership')}
        />
      )}
      {isVerified && (
        <Chip
          icon={require('../../../assets/images/screens/profile/verified.png')}
          title="Verified"
          caption="Official shark"
          fill="#1aa3f0"
          lip="#0b6db3"
          ink="#ffffff"
          sub="#e3f5ff"
          label="Verified account"
          hint="Explains what verified means"
          onPress={() => setVerifiedOpen(true)}
        />
      )}
      <Modal visible={verifiedOpen} transparent animationType="fade" onRequestClose={() => setVerifiedOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setVerifiedOpen(false)}
          accessibilityRole="button" accessibilityLabel="Close">
          <View style={styles.card} accessibilityViewIsModal>
            <Image source={require('../../../assets/images/screens/profile/verified.png')}
              style={{ width: 64, height: 64, marginBottom: 12 }} contentFit="contain" />
            <Text style={styles.cardTitle}>Verified shark</Text>
            <Text style={styles.cardBody}>
              The Theme Park Shark team checked this account. It really is who it says it is.
            </Text>
            <Pressable onPress={() => setVerifiedOpen(false)} accessibilityRole="button" accessibilityLabel="Got it"
              style={styles.cardButton}>
              <Text style={styles.cardButtonText}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderBottomWidth: 5,
    overflow: 'hidden',
    shadowColor: '#05346e',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
    elevation: 3,
  },
  gloss: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 3,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  iconDisc: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', alignItems: 'center',
    justifyContent: 'center' },
  icon: { width: 32, height: 32 },
  title: { fontFamily: 'Shark', fontSize: 17, textTransform: 'uppercase' },
  caption: { fontFamily: 'Knockout', fontSize: 14, marginTop: 1 },
  scrim: { flex: 1, backgroundColor: 'rgba(5,20,40,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#dff4ff',
    padding: 24,
    alignItems: 'center',
    maxWidth: 340,
  },
  cardTitle: { fontFamily: 'Shark', fontSize: 22, color: '#05346e', textTransform: 'uppercase', marginBottom: 6 },
  cardBody: { fontFamily: 'Knockout', fontSize: 18, color: '#3d5f8c', textAlign: 'center', lineHeight: 23 },
  cardButton: {
    marginTop: 18,
    minHeight: 48,
    minWidth: 150,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#1aa3f0',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderBottomWidth: 5,
    borderBottomColor: '#0b6db3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtonText: { fontFamily: 'Shark', fontSize: 18, color: '#ffffff', textTransform: 'uppercase' },
});
