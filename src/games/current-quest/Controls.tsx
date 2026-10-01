/**
 * Thumb-zone controls (design v5 7.1, 7.4): Undo (tap = one, hold = scrub
 * back one stroke every 250 ms), Tread (hold 250 ms), Tide Tip (Trial: costs
 * 2 strokes, 2-tap confirm), Restart (free in both profiles, 2-tap confirm),
 * Arrows toggle; the walk-safe arrow pad; the stall card with the near-miss
 * line and the wrong-turn marker. Targets grow from 48 to 56 px while walking.
 * No emoji anywhere.
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
export const SCRUB_HOLD_MS = 300;
export const SCRUB_STEP_MS = 250;

interface BarProps {
  big: boolean;
  trial: boolean;
  rings: number;
  canUndo: boolean;
  undos: number;
  hasTide: boolean;
  tipPulse: boolean;
  tipDisabled: boolean;
  /** Budget strokes a tip costs (Trial 2, Puzzle 0). */
  tipCost: number;
  arrows: boolean;
  disabled: boolean;
  onUndo: () => void;
  /** Hold-to-scrub started / ended (tint and tape-rewind pitch). */
  onScrub?: (on: boolean) => void;
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
    if (p.tipCost > 0 && !confirmTip) {
      setConfirmTip(true);
      timers.current.push(setTimeout(() => setConfirmTip(false), 2600));
      return;
    }
    setConfirmTip(false);
    p.onTip();
  };

  // Undo: tap = one undo; hold 300 ms = scrub (Braid / Hitman GO), one stroke every 250 ms.
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbed = useRef(false);
  const stopScrub = () => {
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = null;
  };
  useEffect(() => () => stopScrub(), []);
  const undoIn = () => {
    scrubbed.current = false;
    stopScrub();
    const step = () => {
      scrubbed.current = true;
      if (!scrubTimer.current) p.onScrub?.(true);
      p.onUndo();
      scrubTimer.current = setTimeout(step, SCRUB_STEP_MS);
    };
    scrubTimer.current = setTimeout(step, SCRUB_HOLD_MS);
  };
  const undoOut = () => {
    const was = scrubbed.current;
    stopScrub();
    if (was) p.onScrub?.(false);
    else p.onUndo();
  };

  return (
    <View style={[styles.bar, p.big && styles.barBig]}>
      <View style={styles.conchWrap}>
        <Pressable
          disabled={p.disabled || !p.canUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo last stroke. Hold to rewind several."
          onPressIn={undoIn}
          onPressOut={undoOut}
          hitSlop={4}
          style={({ pressed }) => [styles.conch, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed, (p.disabled || !p.canUndo) && styles.disabled]}
        >
          <View style={styles.flip}><GameIcon name="retry" size={size * 0.5} /></View>
        </Pressable>
        <Text style={[styles.conchLabel, (p.disabled || !p.canUndo) && styles.disabledTxt]} numberOfLines={1}>{p.undos ? `Undo ${p.undos}` : 'Undo'}</Text>
      </View>
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
        <Conch size={size} label="Tip" onPress={tip} disabled={p.disabled || p.tipDisabled}
          accessibilityLabel={p.tipCost > 0 ? `Tide tip, costs ${p.tipCost} strokes and the Par shell` : 'Tide tip, loses the Par shell'}
          badge={p.tipCost > 0 ? `-${p.tipCost}` : null} confirm={confirmTip ? `Tip: costs ${p.tipCost} strokes` : null}>
          <Image source={MAGNIFIER} style={{ width: size * 0.5, height: size * 0.54 }} />
        </Conch>
      </Animated.View>
      <Conch size={size} label="Restart" onPress={restart} disabled={p.disabled || !p.canUndo} accessibilityLabel="Restart voyage"
        confirm={confirmRestart ? 'Tap again to restart' : null}>
        <GameIcon name="retry" size={size * 0.5} />
      </Conch>
      <Conch size={size} label={p.arrows ? 'Swipe' : 'Arrows'} onPress={p.onToggleArrows} accessibilityLabel={p.arrows ? 'Switch to swipe' : 'Switch to arrow buttons'}>
        <View style={p.arrows ? undefined : styles.rotUp}><GameIcon name="arrow" size={size * 0.46} /></View>
      </Conch>
    </View>
  );
});

// ---------------------------------------------------------------------------

/**
 * Walk-safe arrow pad: four big buttons in one thumb row (left, up, down,
 * right) so a tall 5x7 board keeps its 60 pt cells. Press previews, release
 * on the same button commits; sliding off cancels.
 */
export function ArrowPad({ big, onArm, onCommit, onDisarm, disabled }: {
  big: boolean; disabled: boolean; onArm: (dir: number) => void; onCommit: (dir: number) => void; onDisarm: () => void;
}) {
  const h = big ? 60 : 56;
  const btn = (dir: number, rot: number) => (
    <Pressable
      key={`a${dir}`}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={['Swim up', 'Swim right', 'Swim down', 'Swim left'][dir]}
      onPressIn={() => onArm(dir)}
      onPressOut={onDisarm}
      onPress={() => onCommit(dir)}
      hitSlop={4}
      style={({ pressed }) => [styles.arrow, { height: h, borderRadius: 16, flex: 1 }, pressed && styles.arrowPressed]}
    >
      <View style={{ transform: [{ rotate: `${rot}deg` }] }}><GameIcon name="arrow" size={h * 0.5} /></View>
    </Pressable>
  );
  return (
    <View style={styles.arrowRow}>
      {btn(3, 180)}
      {btn(0, -90)}
      {btn(2, 90)}
      {btn(1, 0)}
    </View>
  );
}

// ---------------------------------------------------------------------------

export function StallCard({ trial, rings, nearMiss, hintShown, wrongTurn, onUndo, onRestart, onContinue }: {
  trial: boolean; rings: number; nearMiss: string | null; hintShown: boolean; wrongTurn: boolean;
  onUndo: () => void; onRestart: () => void; onContinue: () => void;
}) {
  const lines: string[] = [];
  if (wrongTurn) lines.push('The red X marks where the route went wrong.');
  if (hintShown) lines.push('The gold footprint shows a first stroke that works.');
  return (
    <Animated.View entering={SlideInDown.springify().damping(14)} style={styles.stall}>
      <Text style={styles.stallTitle}>{nearMiss ?? 'Out of strokes'}</Text>
      {lines.length ? <Text style={styles.stallBody}>{lines.join(' ')}</Text> : <View style={{ height: 8 }} />}
      <View style={styles.stallRow}>
        {trial ? (
          <Pressable onPress={onContinue} disabled={rings <= 0} style={({ pressed }) => [styles.stallBtn, styles.stallPrimary, pressed && styles.pressed, rings <= 0 && styles.disabled]}
            accessibilityRole="button" accessibilityLabel="Use a ring for two more strokes">
            <Image source={RING} style={styles.stallIcon} />
            <Text style={styles.stallPrimaryTxt}>Use a ring: +2 strokes</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={onUndo} style={({ pressed }) => [styles.stallBtn, styles.stallPrimary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Undo">
              <View style={styles.flip}><GameIcon name="retry" size={22} /></View>
              <Text style={styles.stallPrimaryTxt}>Undo</Text>
            </Pressable>
            <Pressable onPress={onRestart} style={({ pressed }) => [styles.stallBtn, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel="Restart voyage">
              <GameIcon name="retry" size={22} />
              <Text style={styles.stallTxt}>Restart</Text>
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

/** The stroke budget as a row of bubbles (E11): spent ones pop empty, par is ticked in gold. */
export const StrokeBar = React.memo(function StrokeBar({ limit, spent, par, hot, width }: {
  limit: number; spent: number; par: number; hot: boolean; width: number;
}) {
  const n = Math.max(1, limit);
  const gap = 3;
  const size = Math.max(9, Math.min(17, (width - 92 - gap * n) / n));
  return (
    <View style={[styles.strokeBar, hot && styles.strokeBarHot]} accessibilityLabel={`${spent} of ${limit} strokes used, par ${par}`}>
      <View style={styles.bubbleRow}>
        {Array.from({ length: n }, (_, k) => {
          const used = k < spent;
          return (
            <View key={`b${k}`} style={{ width: size, alignItems: 'center' }}>
              <View style={[styles.bub, { width: size, height: size, borderRadius: size / 2 }, used ? styles.bubUsed : hot ? styles.bubHot : null]} />
              {k === par - 1 ? <View style={styles.parTick} /> : null}
            </View>
          );
        })}
      </View>
      <Text style={[styles.strokeTxt, hot && styles.strokeTxtHot]}>{`${spent} / ${limit}`}</Text>
    </View>
  );
});

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
  arrowRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, alignSelf: 'stretch' },
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
  strokeBar: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 2, borderColor: CQ.ink,
  },
  strokeBarHot: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  bubbleRow: { flexDirection: 'row', gap: 3, alignItems: 'flex-start' },
  bub: { backgroundColor: '#bfeefe', borderWidth: 1.5, borderColor: CQ.ink },
  bubUsed: { backgroundColor: 'rgba(255,255,255,0.3)', borderColor: 'rgba(47,47,58,0.35)' },
  bubHot: { backgroundColor: '#ffc2ba' },
  parTick: { width: 4, height: 6, borderRadius: 2, backgroundColor: CQ.gold, borderWidth: 1, borderColor: CQ.ink, marginTop: 1 },
  strokeTxt: { fontFamily: 'Shark', fontSize: 17, color: CQ.navy },
  strokeTxtHot: { color: CQ.coral },
});
