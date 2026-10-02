/**
 * The big stamp card. An earned stamp SLAMS onto the page: it drops in large
 * and tilted, hits with an ink ring, a rigid haptic and a thunk, then settles.
 * Rare and up add a foil sweep and the reveal chime. Claiming the rewards
 * replays the slam with the reward stinger. A locked stamp shows its
 * silhouette, the one-line how-to and progress.
 * Reduce Motion: no drop or ring, a plain fade; sound and haptic stay.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { rarityToneByName } from '../../constants/coinTiers';
import GameIcon from '../../ui/GameIcon';
import { stampArt } from './art';
import { INK } from './StampTile';
import { earnedDate, hasRewards, hasShine, progressLabel, rewardChips, type BookStamp } from './model';

const ART = 210;
const SPLATS = [0, 45, 90, 135, 180, 225, 270, 315];

interface Props {
  readonly stamp: BookStamp | null;
  readonly accent: string;
  readonly reducedMotion: boolean;
  readonly claiming: boolean;
  readonly equipping: boolean;
  readonly message: string | null;
  readonly wearingTitle: boolean;
  readonly onClaim: () => void;
  readonly onToggleTitle: () => void;
  readonly onClose: () => void;
  /** Bumped by the screen after a successful claim to replay the slam. */
  readonly slamKey: number;
}

export default function StampCard(props: Props) {
  const { stamp } = props;
  return (
    <Modal visible={!!stamp} transparent animationType="fade" onRequestClose={props.onClose} statusBarTranslucent>
      {stamp && <CardBody {...props} stamp={stamp} />}
    </Modal>
  );
}

function CardBody({ stamp, accent, reducedMotion, claiming, equipping, message, wearingTitle,
  onClaim, onToggleTitle, onClose, slamKey }: Props & { stamp: BookStamp }) {
  const tone = rarityToneByName(stamp.rarity);
  const shiny = hasShine(stamp);
  const scale = useSharedValue(stamp.earned && !reducedMotion ? 2.1 : 0.96);
  const tilt = useSharedValue(stamp.earned && !reducedMotion ? -16 : 0);
  const fade = useSharedValue(0);
  const ring = useSharedValue(0);
  const foil = useSharedValue(-1.2);
  const card = useSharedValue(reducedMotion ? 1 : 0.9);
  const [landed, setLanded] = useState(!stamp.earned);

  const impact = useCallback((celebrate: boolean) => {
    setLanded(true);
    haptic('hitRigid');
    playSfx('fx.hit');
    playSfx('ui.confirm', 0.8);
    if (celebrate) {
      setTimeout(() => { haptic('success'); playSfx('fx.reward'); }, 140);
    } else if (shiny) {
      setTimeout(() => playSfx('fx.reveal', 0.85), 220);
    }
  }, [shiny]);

  const slam = useCallback((celebrate: boolean) => {
    if (reducedMotion) {
      fade.value = withTiming(1, { duration: 180 });
      impact(celebrate);
      return;
    }
    scale.value = 2.1;
    tilt.value = -16;
    fade.value = 0;
    ring.value = 0;
    fade.value = withTiming(1, { duration: 120 });
    tilt.value = withTiming(-4, { duration: 230, easing: Easing.in(Easing.cubic) }, () => {
      tilt.value = withSpring(-3, { damping: 7, stiffness: 260 });
    });
    scale.value = withSequence(
      withTiming(0.88, { duration: 230, easing: Easing.in(Easing.cubic) }, finished => {
        if (finished) runOnJS(impact)(celebrate);
      }),
      withSpring(1, { damping: 6, stiffness: 300, mass: 0.7 }),
    );
    ring.value = withDelay(230, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
    if (shiny) {
      foil.value = -1.2;
      foil.value = withDelay(520, withTiming(1.4, { duration: 900, easing: Easing.inOut(Easing.quad) }));
    }
  }, [reducedMotion, fade, scale, tilt, ring, foil, shiny, impact]);

  useEffect(() => {
    card.value = withSpring(1, { damping: 13, stiffness: 240 });
    playSfx('ui.modalOpen', 0.6);
    if (stamp.earned) {
      playSfx('fx.whoosh', 0.7);
      slam(false);
    } else {
      fade.value = withTiming(1, { duration: 200 });
      haptic('tapLight');
    }
    // Re-run only when a different stamp opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp.id]);

  useEffect(() => {
    if (slamKey > 0) slam(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slamKey]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: card.value }] }));
  const artStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.55 * (1 - ring.value),
    transform: [{ scale: 0.7 + ring.value * 0.75 }],
  }));
  const splatStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 1 - ring.value,
    transform: [{ scale: 0.6 + ring.value * 0.9 }],
  }));
  const foilStyle = useAnimatedStyle(() => ({ transform: [{ translateX: foil.value * ART }, { rotate: '20deg' }] }));

  const chips = rewardChips(stamp.rewards);
  const claimable = stamp.earned && !stamp.rewardClaimed && hasRewards(stamp.rewards);

  return (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close stamp">
      <Animated.View style={[styles.card, cardStyle]}>
        <Pressable onPress={() => undefined} style={styles.inner}>
          <LinearGradient colors={[`${accent}33`, 'rgba(255,255,255,0)']} style={styles.glow} />
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel="Close">
            <GameIcon name="close" size={22} />
          </Pressable>

          <View style={styles.stage}>
            {stamp.earned && !reducedMotion && (
              <>
                <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: accent }, ringStyle]} />
                <Animated.View pointerEvents="none" style={[styles.splats, splatStyle]}>
                  {SPLATS.map(angle => (
                    <View key={angle} style={[styles.splat, { backgroundColor: accent,
                      transform: [{ rotate: `${angle}deg` }, { translateY: -ART * 0.55 }] }]} />
                  ))}
                </Animated.View>
              </>
            )}
            <Animated.View style={[styles.artBox, artStyle]}>
              {stamp.secret ? (
                <View style={[styles.secret, { borderColor: accent }]}><Text style={[styles.secretMark, { color: accent }]}>?</Text></View>
              ) : (
                <Image source={stampArt(stamp)} style={[styles.art, !stamp.earned && styles.silhouette]}
                  tintColor={stamp.earned ? undefined : '#7F97C4'} contentFit="contain" transition={120} />
              )}
              {shiny && !reducedMotion && (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.foilClip]}>
                  <Animated.View style={[styles.foil, foilStyle]}>
                    <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
                      start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
                  </Animated.View>
                </View>
              )}
            </Animated.View>
          </View>

          <View style={[styles.rarity, { backgroundColor: tone.color }]}>
            <Text style={styles.rarityText}>{tone.label.toUpperCase()}</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>{stamp.name}</Text>
          {stamp.earned ? (
            <Text style={styles.earned}>{landed ? `Earned ${earnedDate(stamp.earnedAt) ?? ''}`.trim() : ' '}</Text>
          ) : (
            <Text style={styles.locked}>Not yet</Text>
          )}

          <View style={styles.howBox}>
            <Text style={styles.howLabel}>{stamp.earned ? 'YOU DID IT' : 'HOW TO EARN'}</Text>
            <Text style={styles.howText}>{stamp.howTo}</Text>
            {!stamp.earned && !stamp.secret && (
              <View style={styles.progress}>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${stamp.percent}%`, backgroundColor: accent }]} /></View>
                <Text style={styles.barText}>{progressLabel(stamp)}</Text>
              </View>
            )}
          </View>

          {chips.length > 0 && (
            <View style={styles.chips}>
              {chips.map(chip => (
                <View key={chip.kind} style={[styles.chip, stamp.rewardClaimed && styles.chipDone]}>
                  {chip.kind !== 'title' && <GameIcon name={chip.kind === 'tickets' ? 'ticket' : chip.kind === 'coins' ? 'coin' : chip.kind} size={16} />}
                  <Text style={styles.chipText}>{chip.label}</Text>
                </View>
              ))}
            </View>
          )}

          {claimable && (
            <Pressable onPress={onClaim} disabled={claiming} style={[styles.button, claiming && styles.buttonBusy]}
              accessibilityRole="button">
              <Text style={styles.buttonText}>{claiming ? 'Stamping...' : 'Claim rewards'}</Text>
            </Pressable>
          )}
          {stamp.earned && stamp.rewardClaimed && !!stamp.rewards.title && (
            <Pressable onPress={onToggleTitle} disabled={equipping} style={[styles.button, styles.buttonAlt, equipping && styles.buttonBusy]}
              accessibilityRole="button">
              <Text style={styles.buttonText}>{equipping ? 'Saving...' : wearingTitle ? 'Remove profile title' : 'Wear profile title'}</Text>
            </Pressable>
          )}
          {!!message && <Text style={styles.message}>{message}</Text>}
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,52,110,0.82)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 360 },
  inner: {
    backgroundColor: '#FFF8E4', borderRadius: 28, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20,
    paddingTop: 12, overflow: 'hidden', borderWidth: 3, borderColor: INK,
  },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 3 },
  stage: { width: ART + 40, height: ART + 20, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ring: { position: 'absolute', width: ART, height: ART, borderRadius: ART / 2, borderWidth: 10 },
  splats: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  splat: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  artBox: { width: ART, height: ART, alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', height: '100%' },
  silhouette: { opacity: 0.45 },
  foilClip: { overflow: 'hidden', borderRadius: ART / 2 },
  foil: { position: 'absolute', top: -ART * 0.3, left: 0, width: 54, height: ART * 1.6 },
  secret: {
    width: ART * 0.82, height: ART * 0.82, borderRadius: ART, borderWidth: 5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,201,60,0.12)',
  },
  secretMark: { fontFamily: 'Shark', fontSize: 96 },
  rarity: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3, marginTop: 2 },
  rarityText: { fontFamily: 'Knockout', fontSize: 12, color: '#FFFFFF', letterSpacing: 1.2 },
  name: { fontFamily: 'Shark', fontSize: 28, color: INK, textAlign: 'center', textTransform: 'uppercase', marginTop: 6 },
  earned: { fontFamily: 'Knockout', fontSize: 15, color: '#2E8B57', marginTop: 2 },
  locked: { fontFamily: 'Knockout', fontSize: 15, color: '#7A869E', marginTop: 2 },
  howBox: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginTop: 12 },
  howLabel: { fontFamily: 'Knockout', fontSize: 11, color: '#7A869E', letterSpacing: 1.4, marginBottom: 4 },
  howText: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 22, color: INK },
  progress: { marginTop: 10 },
  bar: { height: 9, borderRadius: 5, backgroundColor: '#DCE3F0', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barText: { fontFamily: 'Knockout', fontSize: 13, color: '#5B6B8C', marginTop: 4, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF4D6', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1.5, borderColor: '#F2C94C',
  },
  chipDone: { opacity: 0.5 },
  chipText: { fontFamily: 'Knockout', fontSize: 13, color: INK },
  button: {
    marginTop: 14, alignSelf: 'stretch', backgroundColor: '#FFC93C', borderRadius: 16, paddingVertical: 13,
    borderWidth: 3, borderColor: INK, alignItems: 'center',
  },
  buttonAlt: { backgroundColor: '#E8EEFF' },
  buttonBusy: { opacity: 0.6 },
  buttonText: { fontFamily: 'Knockout', fontSize: 18, color: INK },
  message: { fontFamily: 'Knockout', fontSize: 13, color: '#2F4A7A', textAlign: 'center', marginTop: 10 },
});
