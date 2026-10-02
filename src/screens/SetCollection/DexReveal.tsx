/**
 * The set-complete moment, in beats:
 *   1. the badge medallion slams in (thud, heavy haptic)
 *   2. the gold ribbon with the set name unfurls
 *   3. each prize plaque ticks in, 120 ms apart (coin tick, light haptic)
 *   4. the title plaque stamps in
 *   5. the button rises last, 400 ms later
 * Tapping the button sends each prize flying on an arc to its counter in the
 * HUD strip at the top; the counter bumps and counts up, then it closes.
 * Backdrop taps are ignored for the first 1.2 s. Opaque deep-navy scrim, slow
 * two-tone gold rays, one confetti fall. Reduce Motion shows the finished
 * layout still and closes straight away.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import { playSfx } from '../../gamekit/SFX';
import * as Haptics from '../../helpers/haptics';
import { BRAND, GameButton, GameIcon } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { RIBBON, setBadge, StarBurst } from './DexParts';
import { prizeChips, type DexReward, type DexSet } from './dexModel';

export const REVEAL_TAP_GUARD_MS = 1200;
const RAYS = require('../../../assets/images/reveal/rays.webp');
const SCRIM = require('../../../assets/images/reveal/scrim.webp');
const GLOW = require('../../../assets/images/reveal/glow.webp');
const MEDAL = require('../../../assets/images/alex-ui/round-gold.webp');
const BEAT = { slam: 0, ribbon: 380, prizes: 650, step: 120, plaque: 160, cta: 400 } as const;

type HudKey = 'energy' | 'ticket' | 'xp' | 'coins';
const HUD: readonly HudKey[] = ['energy', 'ticket', 'xp', 'coins'];

export function revealTimeline(prizeCount: number, hasTitle: boolean): { readonly ctaAt: number; readonly plaqueAt: number } {
  const plaqueAt = BEAT.prizes + prizeCount * BEAT.step + BEAT.plaque;
  return { plaqueAt, ctaAt: plaqueAt + (hasTitle ? 200 : 0) + BEAT.cta };
}

export function RewardReveal({ reveal, onClose }: {
  readonly reveal: { readonly set: DexSet; readonly reward: DexReward; readonly key: number } | null;
  readonly onClose: () => void;
}) {
  if (!reveal) return null;
  return <RevealBody key={reveal.key} set={reveal.set} reward={reveal.reward} onClose={onClose} />;
}

function RevealBody({ set, reward, onClose }: { readonly set: DexSet; readonly reward: DexReward; readonly onClose: () => void }) {
  const reduced = useUiReducedMotion();
  const { width, height } = useWindowDimensions();
  const { player } = useContext(AuthContext);
  // Number prizes ride the plaques; the title and a wearable get their own wide plaques (never cut off).
  const prizes = useMemo(() => prizeChips(reward).filter(prize => prize.icon !== 'crown' && prize.icon !== 'shark'), [reward]);
  const { ctaAt, plaqueAt } = revealTimeline(prizes.length, !!reward.title);
  const openedAt = useRef(Date.now());
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const spin = useSharedValue(0);
  const slam = useSharedValue(reduced ? 1 : 0);
  const ribbon = useSharedValue(reduced ? 1 : 0);
  const plaque = useSharedValue(reduced ? 1 : 0);
  const cta = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    slam.value = withSequence(withTiming(1.22, { duration: 200, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 7, stiffness: 180 }));
    timers.push(setTimeout(() => {
      playSfx('fx.hit', 0.9);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    }, 190));
    spin.value = withRepeat(withTiming(1, { duration: 10_000, easing: Easing.linear }), -1, false); // 6 rpm
    ribbon.value = withDelay(BEAT.ribbon, withSpring(1, { damping: 10, stiffness: 160 }));
    prizes.forEach((_, index) => timers.push(setTimeout(() => {
      playSfx('fx.coinTick', 0.9);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }, BEAT.prizes + index * BEAT.step)));
    if (reward.title) {
      plaque.value = withDelay(plaqueAt, withSequence(withTiming(1.25, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 240 })));
      timers.push(setTimeout(() => playSfx('ui.confirm', 0.8), plaqueAt + 60));
    }
    cta.value = withDelay(ctaAt, withSpring(1, { damping: 11, stiffness: 170 }));
    return () => { timers.forEach(clearTimeout); cancelAnimation(spin); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    if (paying) return;
    if (reduced) { onClose(); return; }
    setPaying(true);
    playSfx('fx.coin', 0.8);
    setTimeout(() => setPaid(true), 650);
    setTimeout(closeWithFade, 1450);
  };
  const backdrop = () => {
    if (Date.now() - openedAt.current < REVEAL_TAP_GUARD_MS) return;
    dismiss();
  };

  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const slamStyle = useAnimatedStyle(() => ({ transform: [{ scale: slam.value }], opacity: Math.min(1, slam.value * 2) }));
  const ribbonStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, ribbon.value * 1.5), transform: [{ scaleX: 0.2 + 0.8 * ribbon.value }] }));
  const plaqueStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, plaque.value * 2), transform: [{ scale: plaque.value }, { rotate: '-4deg' }] }));
  const ctaStyle = useAnimatedStyle(() => ({ opacity: cta.value, transform: [{ translateY: (1 - cta.value) * 40 }] }));

  // Totals from before the claim: the player refresh lands while the reveal plays.
  const [counts] = useState<Record<HudKey, number>>(() => ({
    energy: Math.max(0, (player?.energy ?? 0)), ticket: Math.max(0, (player?.tickets ?? 0)),
    xp: Math.max(0, (player?.experience ?? 0)), coins: Math.max(0, (player?.coins ?? 0)),
  }));
  const gain = (key: HudKey) => {
    const n = key === 'energy' ? reward.energy : key === 'ticket' ? reward.tickets : key === 'xp' ? reward.experience : reward.coins;
    return paid ? n : 0;
  };
  const rays = Math.max(width, height) * 1.3;
  const fade = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const glint = useSharedValue(-1);
  useEffect(() => {
    if (reduced) return;
    glint.value = withDelay(BEAT.slam + 400, withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }));
  }, [reduced, glint]);
  const glintStyle = useAnimatedStyle(() => ({ transform: [{ translateX: glint.value * 140 }, { rotate: '20deg' }] }));
  const wearable = reward.wearableName;

  return (
    <Modal visible transparent animationType="none" onRequestClose={backdrop} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrimBase, fadeStyle]}>
        <Image source={SCRIM} style={StyleSheet.absoluteFill} contentFit="fill" />
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={backdrop} style={StyleSheet.absoluteFill} />
        {!reduced && (
          <Animated.View pointerEvents="none" style={[styles.rays, { width: rays, height: rays, left: (width - rays) / 2, top: height * 0.44 - rays / 2 }, raysStyle]}>
            <Image source={RAYS} style={StyleSheet.absoluteFill} contentFit="fill" />
          </Animated.View>
        )}
        {!reduced && <Confetti width={width} height={height} />}

        <View style={styles.hud} pointerEvents="none" accessibilityElementsHidden={!paid}>
          {HUD.map(key => <HudCounter key={key} icon={key} value={counts[key]} gain={gain(key)} />)}
        </View>

        <View style={styles.center} pointerEvents="box-none" accessibilityViewIsModal>
          <Animated.View style={[styles.medalWrap, slamStyle]}>
            <Image source={GLOW} style={styles.glow} contentFit="fill" />
            <View style={styles.medal}>
              <Image source={MEDAL} style={StyleSheet.absoluteFill} contentFit="contain" />
              <View style={styles.medalFace}>
                <Image source={setBadge(set)} style={{ width: 112, height: 112 }} contentFit="contain" />
              </View>
              <View style={styles.glintClip} pointerEvents="none">
                <Animated.View style={[styles.glint, glintStyle]}>
                  <LinearGradient start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
                </Animated.View>
              </View>
            </View>
            <StarBurst size={340} />
          </Animated.View>
          <Animated.View style={[styles.ribbon, ribbonStyle]}>
            <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
            <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
              {reward.id === set.reward.id ? `${set.name} complete!` : 'Reward unlocked!'}
            </Text>
          </Animated.View>
          <View style={styles.prizes} accessible accessibilityLabel={`You get ${reward.prize}`}>
            {prizes.map((prize, index) => (
              <View key={prize.icon} style={styles.socket}>
                {paid && <View style={styles.socketTick}><GameIcon name="check" size={30} /></View>}
                <PrizePlaque icon={prize.icon} value={prize.value} index={index} reduced={reduced}
                  fly={paying && !reduced} slot={HUD.indexOf(prize.icon as HudKey)} total={prizes.length} width={width} />
              </View>
            ))}
          </View>
          {!!wearable && (
            <Animated.View style={plaqueStyle}>
              <View style={[styles.plaque, styles.plaqueBlue]}>
                <GameIcon name="shark" size={30} />
                <Text style={[styles.plaqueText, { color: BRAND.white }]} numberOfLines={2}>{wearable}</Text>
              </View>
            </Animated.View>
          )}
          {!!reward.title && (
            <Animated.View style={plaqueStyle}>
              <View style={styles.plaque}>
                <GameIcon name="crown" size={30} />
                <Text style={styles.plaqueText} numberOfLines={1} adjustsFontSizeToFit>New title: {reward.title}</Text>
              </View>
            </Animated.View>
          )}
          <Animated.View style={[{ marginTop: 22, minWidth: 230 }, ctaStyle, paying && { transform: [{ scale: 0.95 }] }]}>
            <GameButton label="Collect!" icon="gift" onPress={dismiss} fullWidth />
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );

  function closeWithFade() {
    if (reduced) { onClose(); return; }
    fade.value = withTiming(0, { duration: 320 });
    setTimeout(onClose, 330);
  }
}

/** A solid prize plaque (glossy blue, darker lip, gold count) that ticks in, then flies to its HUD counter. */
function PrizePlaque({ icon, value, index, reduced, fly, slot, total, width }: {
  readonly icon: string; readonly value: string; readonly index: number; readonly reduced: boolean; readonly fly: boolean;
  readonly slot: number; readonly total: number; readonly width: number;
}) {
  const t = useSharedValue(reduced ? 1 : 0);
  const f = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withDelay(BEAT.prizes + index * BEAT.step, withSpring(1, { damping: 8, stiffness: 220 }));
  }, [reduced, index, t]);
  useEffect(() => {
    if (fly && slot >= 0) f.value = withDelay(index * 70, withTiming(1, { duration: 560, easing: Easing.in(Easing.quad) }));
  }, [fly, slot, index, f]);
  // Arc from the plaque's spot up to its HUD slot.
  const plaqueX = (index - (total - 1) / 2) * 92;
  const hudX = (slot - 1.5) * (width / 4);
  const style = useAnimatedStyle(() => {
    const k = f.value;
    const dx = (hudX - plaqueX) * k;
    const dy = -(260 * k) - Math.sin(k * Math.PI) * 60;
    return {
      opacity: Math.min(1, t.value * 1.5) * (1 - Math.max(0, k - 0.85) / 0.15),
      transform: [{ translateX: dx }, { translateY: (1 - t.value) * 30 + dy }, { scale: (0.5 + 0.5 * t.value) * (1 - 0.5 * k) }],
    };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <View style={styles.prize}>
        <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.prizeGloss} />
        <GameIcon name={icon as 'energy'} size={42} />
        <Text style={styles.prizeText} numberOfLines={1}>{value}</Text>
      </View>
    </Animated.View>
  );
}

function HudCounter({ icon, value, gain }: { readonly icon: HudKey; readonly value: number; readonly gain: number }) {
  const bump = useSharedValue(1);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!gain) { setShown(value); return; }
    bump.value = withSequence(withTiming(1.3, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 240 }));
    const steps = 10;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(Math.round(value + (gain * i) / steps));
      if (i >= steps) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [gain, value, bump]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <Animated.View style={[styles.hudItem, style]}>
      <GameIcon name={icon} size={26} />
      <Text style={styles.hudText} numberOfLines={1}>{shown.toLocaleString('en-US')}</Text>
    </Animated.View>
  );
}

const CONFETTI = ['#ffcf3b', '#ef4a3c', '#2fb35d', '#2f7fe8', '#9b4dff', '#ffffff'];

/** One fall of confetti, about 2.4 s, then gone. */
function Confetti({ width, height }: { readonly width: number; readonly height: number }) {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, index) => ({
    x: ((index * 37) % 100) / 100 * width, delay: (index % 7) * 90, drift: ((index % 5) - 2) * 18,
    color: CONFETTI[index % CONFETTI.length], spin: (index % 2 ? 1 : -1) * (360 + index * 20),
  })), [width]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, index) => <ConfettiPiece key={index} {...piece} height={height} />)}
    </View>
  );
}

function ConfettiPiece({ x, delay, drift, color, spin, height }: {
  readonly x: number; readonly delay: number; readonly drift: number; readonly color: string; readonly spin: number; readonly height: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(300 + delay, withTiming(1, { duration: 2200, easing: Easing.in(Easing.quad) })); }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 : 0,
    transform: [{ translateX: x + drift * Math.sin(t.value * 6) }, { translateY: -20 + t.value * (height + 40) }, { rotate: `${t.value * spin}deg` }],
  }));
  return <Animated.View style={[styles.confetti, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  scrimBase: { backgroundColor: '#031C3F' },
  rays: { position: 'absolute' },
  hud: {
    position: 'absolute', top: 54, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 6, borderRadius: 18, backgroundColor: 'rgba(3,28,63,0.75)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
  },
  hudItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hudText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 120 },
  medalWrap: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 300, height: 300 },
  medal: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  medalFace: {
    width: 136, height: 136, borderRadius: 68, backgroundColor: '#fff6d6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#b77f00', marginTop: -6,
  },
  glintClip: { position: 'absolute', width: 170, height: 170, borderRadius: 85, overflow: 'hidden', top: 4 },
  glint: { position: 'absolute', top: -20, left: -70, width: 40, height: 220 },
  socket: {
    width: 82, height: 92, borderRadius: 16, backgroundColor: '#072f63', borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  socketTick: { position: 'absolute' },
  plaqueBlue: { backgroundColor: '#1a8fe3', borderBottomColor: '#0b5aa0', maxWidth: 320 },
  ribbon: { width: 300, height: 66, marginTop: 12, justifyContent: 'center', paddingHorizontal: 38 },
  ribbonText: { fontFamily: 'Shark', fontSize: 24, color: '#7a3d00', textAlign: 'center', marginTop: -6 },
  prizes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16 },
  prize: {
    position: 'absolute', left: -3, top: -3, width: 82, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#1a8fe3',
    borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 7, borderBottomColor: '#0b5aa0', overflow: 'hidden',
  },
  prizeGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  prizeText: {
    fontFamily: 'Shark', fontSize: 20, color: BRAND.gold, marginTop: 2,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  plaque: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 18, height: 50, borderRadius: 14,
    backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6, borderBottomColor: BRAND.goldLip,
  },
  plaqueText: { fontFamily: 'Shark', fontSize: 18, color: '#7a3d00' },
  confetti: { position: 'absolute', width: 10, height: 16, borderRadius: 2 },
});
