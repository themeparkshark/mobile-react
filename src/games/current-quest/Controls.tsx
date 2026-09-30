/**
 * Thumb-zone controls (design 7.1, 7.4): Undo, Tread (hold 250 ms), Tide Tip,
 * Restart (2-tap), Arrows toggle; the walk-safe arrow pad; the stall card.
 * Targets grow from 48 to 56 px while walking. No emoji anywhere.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, SlideInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { CQ } from './theme';

const BUBBLE = require('../../assets/games/current-quest/bubble.png');
const MAGNIFIER = require('../../assets/games/current-quest/magnifier.png');
const RING = require('../../assets/games/current-quest/life_ring.png');

export const TREAD_HOLD_MS = 250;

interface BarProps {
  big: boolean;
  trial: boolean;
  rings: number;
  canUndo: boolean;
  undos: number;
  hasTide: boolean;
  tipPulse: boolean;
  tipDisabled: boolean;
  arrows: boolean;
  disabled: boolean;
  onUndo: () => void;
  onTreadArm: () => void;
  onTreadCommit: () => void;
  onTreadCancel: (early: boolean) => void;
  onTip: () => void;
  onRestart: () => void;
  onToggleArrows: () => void;
}

function Conch({ size, label, onPress, disabled, children, badge, confirm, accessibilityLabel }: {
  size: number; label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode;
  badge?: string | null; confirm?: string | null; accessibilityLabel: string;
}) {
  return (
    <View style={styles.conchWrap}>
      {confirm ? (
        <Animated.View entering={FadeIn.duration(120)} style={styles.confirm} pointerEvents="none">
          <Text style={styles.confirmTxt}>{confirm}</Text>
        </Animated.View>
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={4}
        style={({ pressed }) => [styles.conch, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed, disabled && styles.disabled]}
      >
        {children}
        {badge ? <View style={styles.badge}><Text style={styles.badgeTxt}>{badge}</Text></View> : null}
      </Pressable>
      <Text style={[styles.conchLabel, disabled && styles.disabledTxt]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const BottomBar = React.memo(function BottomBar(p: BarProps) {
  const size = p.big ? 56 : 48;
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmTip, setConfirmTip] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Tip pulse (8 s idle): 0.95 to 1.08 at 1.2 Hz.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (p.tipPulse) {
      pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 416 }), withTiming(0.95, { duration: 416 })), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 120 });
    }
  }, [p.tipPulse, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Tread hold ring.
  const fill = useSharedValue(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(false);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value > 0 ? 1 : 0, transform: [{ scale: 0.55 + 0.45 * fill.value }] }));

  const restart = () => {
    if (!confirmRestart) {
      setConfirmRestart(true);
      timers.current.push(setTimeout(() => setConfirmRestart(false), 2600));
      return;
    }
    setConfirmRestart(false);
    p.onRestart();
  };
  const tip = () => {
    if (p.trial && !confirmTip) {
      setConfirmTip(true);
      timers.current.push(setTimeout(() => setConfirmTip(false), 2600));
      return;
    }
    setConfirmTip(false);
    p.onTip();
  };

  return (
    <View style={[styles.bar, p.big && styles.barBig]}>
      <Conch size={size} label={p.undos ? `Undo ${p.undos}` : 'Undo'} onPress={p.onUndo} disabled={p.disabled || !p.canUndo} accessibilityLabel="Undo last stroke">
        <View style={styles.flip}><GameIcon name="retry" size={size * 0.5} /></View>
      </Conch>
      {p.hasTide ? (
        <View style={styles.conchWrap}>
          <Pressable
            disabled={p.disabled}
            accessibilityRole="button"
            accessibilityLabel="Tread water, hold"
            onPressIn={() => {
              committed.current = false;
              p.onTreadArm();
              fill.value = 0;
              fill.value = withTiming(1, { duration: TREAD_HOLD_MS, easing: Easing.linear });
              holdTimer.current = setTimeout(() => {
                committed.current = true;
                fill.value = withTiming(0, { duration: 120 });
                p.onTreadCommit();
              }, TREAD_HOLD_MS);
            }}
            onPressOut={() => {
              if (holdTimer.current) clearTimeout(holdTimer.current);
              holdTimer.current = null;
              if (!committed.current) {
                cancelAnimation(fill);
                fill.value = withTiming(0, { duration: 100 });
                p.onTreadCancel(true);
              }
            }}
            style={({ pressed }) => [styles.conch, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed, p.disabled && styles.disabled]}
          >
            <Animated.View style={[styles.treadRing, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }, fillStyle]} />
            <Image source={BUBBLE} style={{ width: size * 0.56, height: size * 0.56 }} />
          </Pressable>
          <Text style={styles.conchLabel}>Tread</Text>
        </View>
      ) : null}
      <Animated.View style={pulseStyle}>
        <Conch size={size} label="Tip" onPress={tip} disabled={p.disabled || p.tipDisabled} accessibilityLabel={p.trial ? 'Tide tip, uses a life ring' : 'Tide tip, loses the Par shell'}
          badge={p.trial ? String(p.rings) : null} confirm={confirmTip ? 'Tip uses a ring' : null}>
          <Image source={MAGNIFIER} style={{ width: size * 0.5, height: size * 0.54 }} />
        </Conch>
      </Animated.View>
      <Conch size={size} label="Restart" onPress={restart} disabled={p.disabled || (p.trial && p.rings <= 0)} accessibilityLabel="Restart voyage"
        confirm={confirmRestart ? (p.trial ? 'Use a ring?' : 'Restart voyage?') : null}>
        {p.trial ? <Image source={RING} style={{ width: size * 0.5, height: size * 0.5 }} /> : <GameIcon name="retry" size={size * 0.5} />}
      </Conch>
      <Conch size={size} label={p.arrows ? 'Swipe' : 'Arrows'} onPress={p.onToggleArrows} accessibilityLabel={p.arrows ? 'Switch to swipe' : 'Switch to arrow buttons'}>
        <View style={p.arrows ? undefined : styles.rotUp}><GameIcon name="arrow" size={size * 0.46} /></View>
      </Conch>
    </View>
  );
});

// ---------------------------------------------------------------------------

export function ArrowPad({ big, onArm, onCommit, onDisarm, disabled }: {
  big: boolean; disabled: boolean; onArm: (dir: number) => void; onCommit: (dir: number) => void; onDisarm: () => void;
}) {
  const s = big ? 70 : 64;
  const btn = (dir: number, rot: number, style: object) => (
    <Pressable
      key={`a${dir}`}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={['Swim up', 'Swim right', 'Swim down', 'Swim left'][dir]}
      onPressIn={() => onArm(dir)}
      onPressOut={onDisarm}
      onPress={() => onCommit(dir)}
      style={({ pressed }) => [styles.arrow, { width: s, height: s, borderRadius: 18 }, style, pressed && styles.arrowPressed]}
    >
      <View style={{ transform: [{ rotate: `${rot}deg` }] }}><GameIcon name="arrow" size={s * 0.5} /></View>
    </Pressable>
  );
  return (
    <View style={{ width: s * 3 + 8, height: s * 2 + 4 }}>
      {btn(0, -90, { position: 'absolute', left: s + 4, top: 0 })}
      {btn(3, 180, { position: 'absolute', left: 0, top: s + 4 - s / 2 })}
      {btn(2, 90, { position: 'absolute', left: s + 4, top: s + 4 })}
      {btn(1, 0, { position: 'absolute', left: 2 * s + 8, top: s + 4 - s / 2 })}
    </View>
  );
}

// ---------------------------------------------------------------------------

export function StallCard({ trial, rings, nearMiss, hintShown, onUndo, onRestart, onContinue }: {
  trial: boolean; rings: number; nearMiss: string | null; hintShown: boolean;
  onUndo: () => void; onRestart: () => void; onContinue: () => void;
}) {
  return (
    <Animated.View entering={SlideInDown.springify().damping(14)} style={styles.stall}>
      <Text style={styles.stallTitle}>{nearMiss ?? 'Out of strokes'}</Text>
      <Text style={styles.stallBody}>
        {hintShown ? 'The golden footprint shows a first stroke that works. ' : ''}
        {trial ? (rings > 0 ? 'Grab a ring for 2 more strokes, or start the voyage fresh.' : 'No rings left.') : 'Undo a stroke or start the voyage fresh. No penalty.'}
      </Text>
      <View style={styles.stallRow}>
        {trial ? (
          <Pressable onPress={onContinue} disabled={rings <= 0} style={({ pressed }) => [styles.stallBtn, styles.stallPrimary, pressed && styles.pressed, rings <= 0 && styles.disabled]}
            accessibilityRole="button" accessibilityLabel="Use a ring for two more strokes">
            <Image source={RING} style={styles.stallIcon} />
            <Text style={styles.stallPrimaryTxt}>+2 strokes</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onUndo} style={({ pressed }) => [styles.stallBtn, styles.stallPrimary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Undo">
            <View style={styles.flip}><GameIcon name="retry" size={22} /></View>
            <Text style={styles.stallPrimaryTxt}>Undo</Text>
          </Pressable>
        )}
        <Pressable onPress={onRestart} disabled={trial && rings <= 0} style={({ pressed }) => [styles.stallBtn, pressed && styles.pressed, trial && rings <= 0 && styles.disabled]}
          accessibilityRole="button" accessibilityLabel="Restart voyage">
          {trial ? <Image source={RING} style={styles.stallIcon} /> : <GameIcon name="retry" size={22} />}
          <Text style={styles.stallTxt}>Restart</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingTop: 6, paddingHorizontal: 6, paddingBottom: 26 },
  barBig: { paddingTop: 4 },
  conchWrap: { alignItems: 'center', minWidth: 58 },
  conch: {
    backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center',
    shadowColor: CQ.waterDeep, shadowOpacity: 0.35, shadowRadius: 0, shadowOffset: { width: 0, height: 3 },
  },
  pressed: { transform: [{ scale: 0.93 }] },
  disabled: { opacity: 0.45 },
  disabledTxt: { opacity: 0.55 },
  conchLabel: { marginTop: 3, fontFamily: 'Knockout', fontSize: 12, color: '#ffffff', textShadowColor: CQ.waterDeep, textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  badge: { position: 'absolute', right: -4, top: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: CQ.coral, borderWidth: 1.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff' },
  confirm: { position: 'absolute', bottom: '100%', marginBottom: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: CQ.cream, borderWidth: 2, borderColor: CQ.ink, zIndex: 5, minWidth: 110, alignItems: 'center' },
  confirmTxt: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy },
  treadRing: { position: 'absolute', borderWidth: 4, borderColor: CQ.gold },
  flip: { transform: [{ scaleX: -1 }] },
  rotUp: { transform: [{ rotate: '-90deg' }] },
  arrow: { backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center' },
  arrowPressed: { backgroundColor: '#fff3c2', transform: [{ scale: 0.94 }] },
  stall: {
    position: 'absolute', left: 14, right: 14, bottom: 8, borderRadius: 18, padding: 14, backgroundColor: CQ.cream,
    borderWidth: 3, borderColor: CQ.ink, alignItems: 'center',
  },
  stallTitle: { fontFamily: 'Shark', fontSize: 24, color: CQ.navy, textAlign: 'center' },
  stallBody: { fontFamily: 'Knockout', fontSize: 14, color: CQ.navy, textAlign: 'center', marginTop: 4, marginBottom: 10 },
  stallRow: { flexDirection: 'row', gap: 10 },
  stallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2.5, borderColor: CQ.ink, backgroundColor: '#ffffff' },
  stallPrimary: { backgroundColor: CQ.gold },
  stallPrimaryTxt: { fontFamily: 'Shark', fontSize: 18, color: CQ.navy },
  stallTxt: { fontFamily: 'Shark', fontSize: 18, color: CQ.navy },
  stallIcon: { width: 24, height: 24, resizeMode: 'contain' },
});
