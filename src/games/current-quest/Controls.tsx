/**
 * Thumb-zone controls (design v7.1 7.4, 0.A.3, J2, J12):
 *
 *   - the bottom bar holds at most 3 conches: Undo (tap = one, hold = scrub
 *     one stroke every 250 ms), Tread (tide boards, hold 250 ms with a filling
 *     ring) and Menu (a radial with Restart, Tip, Arrows, and in a Trial the
 *     life ring). Conches use a Royal Match deep press: a 2-frame squash
 *     (0.92 / 1.04) and a 3 px drop shadow that collapses on press;
 *   - the walk-safe arrow pad, hidden until 2 misfires or the radial toggle;
 *   - the dead sheet: a bottom sheet docked under the board (over the bar, at
 *     most 30% of the screen) that rises the moment the state cannot clear,
 *     or at a stall. Puzzle: Undo / Restart. Trial: Undo / Ring +2.
 * Targets are 56 pt and grow to 64 pt while walking. No emoji anywhere.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring,
  withTiming, ZoomIn,
} from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { CQ } from './theme';

const BUBBLE = require('../../assets/games/current-quest/bubble.png');
const MAGNIFIER = require('../../assets/games/current-quest/magnifier.png');
const RING = require('../../assets/games/current-quest/life_ring_v2.png');
const CONCH = require('../../assets/games/current-quest/conch.png');

export const TREAD_HOLD_MS = 250;
export const SCRUB_HOLD_MS = 300;
export const SCRUB_STEP_MS = 250;

/** Royal Match deep press: squash 0.92 on press, overshoot 1.04 on release; the drop shadow collapses. */
function useDeepPress() {
  const s = useSharedValue(1);
  const d = useSharedValue(3);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: 3 - d.value }, { scale: s.value }], shadowOffset: { width: 0, height: d.value } }));
  return {
    style: st,
    in: () => { s.value = withTiming(0.92, { duration: 33 }); d.value = withTiming(0, { duration: 33 }); },
    out: () => { s.value = withSequence(withTiming(1.04, { duration: 33 }), withSpring(1, { damping: 10, stiffness: 400 })); d.value = withTiming(3, { duration: 90 }); },
  };
}

function Conch({ size, label, onPress, onPressIn, onPressOut, disabled, children, badge, accessibilityLabel, pulse }: {
  size: number; label: string; onPress?: () => void; onPressIn?: () => void; onPressOut?: () => void; disabled?: boolean;
  children: React.ReactNode; badge?: string | null; accessibilityLabel: string; pulse?: boolean;
}) {
  const press = useDeepPress();
  const p = useSharedValue(1);
  useEffect(() => {
    if (pulse) p.value = withRepeat(withSequence(withTiming(1.08, { duration: 416 }), withTiming(0.95, { duration: 416 })), -1, true);
    else { cancelAnimation(p); p.value = withTiming(1, { duration: 120 }); }
  }, [pulse, p]);
  const ps = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return (
    <View style={styles.conchWrap}>
      <Animated.View style={ps}>
        <Pressable
          onPress={onPress}
          onPressIn={() => { press.in(); onPressIn?.(); }}
          onPressOut={() => { press.out(); onPressOut?.(); }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          hitSlop={6}
        >
          <Animated.View style={[styles.conch, { width: size, height: size, borderRadius: size / 2 }, press.style, disabled && styles.disabled]}>
            {children}
            {badge ? <View style={styles.badge}><Text style={styles.badgeTxt}>{badge}</Text></View> : null}
          </Animated.View>
        </Pressable>
      </Animated.View>
      <Text style={[styles.conchLabel, disabled && styles.disabledTxt]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

interface BarProps {
  big: boolean;
  trial: boolean;
  rings: number;
  canUndo: boolean;
  undos: number;
  hasTide: boolean;
  tipPulse: boolean;
  tipDisabled: boolean;
  ringDisabled: boolean;
  canRestart: boolean;
  arrows: boolean;
  disabled: boolean;
  onUndo: () => void;
  onScrub?: (on: boolean) => void;
  onTreadArm: () => void;
  onTreadCommit: () => void;
  onTreadCancel: (early: boolean) => void;
  onTip: () => void;
  onRing: () => void;
  onRestart: () => void;
  onToggleArrows: () => void;
  onMenu?: (open: boolean) => void;
}

export const BottomBar = React.memo(function BottomBar(p: BarProps) {
  const size = p.big ? 64 : 56;
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'restart' | 'tip' | 'ring' | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { if (p.disabled) setMenu(false); }, [p.disabled]);
  const openMenu = (open: boolean) => { setMenu(open); setConfirm(null); p.onMenu?.(open); };

  // Tread hold ring.
  const fill = useSharedValue(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(false);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value > 0 ? 1 : 0, transform: [{ scale: 0.55 + 0.45 * fill.value }] }));

  // Undo: tap = one undo; hold 300 ms = scrub (Braid / Hitman GO), one stroke every 250 ms.
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbed = useRef(false);
  const stopScrub = () => { if (scrubTimer.current) clearTimeout(scrubTimer.current); scrubTimer.current = null; };
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
    else if (p.canUndo && !p.disabled) p.onUndo();
  };

  // Two-tap confirm in the same spot for anything that costs (Restart in Puzzle is free but wipes the board).
  const confirmThen = (key: 'restart' | 'tip' | 'ring', fn: () => void) => {
    if (confirm !== key) {
      setConfirm(key);
      timers.current.push(setTimeout(() => setConfirm((c) => (c === key ? null : c)), 2000));
      return;
    }
    setConfirm(null);
    openMenu(false);
    fn();
  };

  const items: { key: string; label: string; sub: string; icon: React.ReactNode; disabled: boolean; on: () => void }[] = [
    {
      key: 'restart', label: confirm === 'restart' ? 'Tap again' : 'Restart', sub: p.trial ? 'strokes stay spent' : 'free',
      icon: <GameIcon name="retry" size={24} />, disabled: !p.canRestart, on: () => confirmThen('restart', p.onRestart),
    },
    {
      key: 'tip', label: confirm === 'tip' ? 'Tap again' : 'Tip', sub: p.trial ? 'uses a ring' : 'lose Par shell',
      icon: <Image source={MAGNIFIER} style={{ width: 24, height: 26 }} />, disabled: p.tipDisabled, on: () => confirmThen('tip', p.onTip),
    },
    ...(p.trial ? [{
      key: 'ring', label: confirm === 'ring' ? 'Tap again' : 'Ring', sub: '+2 strokes',
      icon: <Image source={RING} style={{ width: 26, height: 26 }} />, disabled: p.ringDisabled, on: () => confirmThen('ring', p.onRing),
    }] : []),
    {
      key: 'arrows', label: p.arrows ? 'Swipe' : 'Arrows', sub: p.arrows ? 'hide pad' : 'show pad',
      icon: <View style={p.arrows ? undefined : styles.rotUp}><GameIcon name="arrow" size={22} /></View>, disabled: false,
      on: () => { openMenu(false); p.onToggleArrows(); },
    },
  ];

  return (
    <View style={[styles.bar, p.big && styles.barBig]}>
      {menu ? (
        <>
          <Pressable style={styles.menuScrim} onPress={() => openMenu(false)} accessibilityLabel="Close menu" />
          <Animated.View entering={ZoomIn.springify().damping(13)} exiting={FadeOut.duration(120)} style={styles.radial}>
            {items.map((it, i) => (
              <Animated.View key={it.key} entering={FadeIn.delay(i * 40).duration(120)}>
                <Pressable
                  onPress={it.on}
                  disabled={it.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.label}, ${it.sub}`}
                  style={({ pressed }) => [styles.radialItem, pressed && styles.radialPressed, it.disabled && styles.disabled, confirm === it.key && styles.radialConfirm]}
                >
                  {it.icon}
                  <Text style={styles.radialLabel}>{it.label}</Text>
                  <Text style={styles.radialSub}>{it.sub}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </Animated.View>
        </>
      ) : null}
      <Conch size={size} label={p.undos ? `Undo ${p.undos}` : 'Undo'} disabled={p.disabled || !p.canUndo}
        onPressIn={undoIn} onPressOut={undoOut} accessibilityLabel="Undo last stroke. Hold to rewind several.">
        <View style={styles.flip}><GameIcon name="retry" size={size * 0.48} /></View>
      </Conch>
      {p.hasTide ? (
        <Conch
          size={size}
          label="Tread"
          disabled={p.disabled}
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
        >
          <Animated.View style={[styles.treadRing, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }, fillStyle]} />
          <Image source={BUBBLE} style={{ width: size * 0.56, height: size * 0.56 }} />
        </Conch>
      ) : null}
      <Conch size={size} label="Menu" disabled={p.disabled} onPress={() => openMenu(!menu)} pulse={p.tipPulse && !menu}
        badge={p.tipPulse ? 'Tip' : null} accessibilityLabel="Menu: restart, tip, arrows">
        <Image source={CONCH} style={{ width: size * 0.66, height: size * 0.66, resizeMode: 'contain' }} />
      </Conch>
    </View>
  );
});

// ---------------------------------------------------------------------------

/**
 * Walk-safe arrow pad: four big buttons in one thumb row (left, up, down,
 * right) so a tall 5x7 board keeps its cells. Press previews, release on the
 * same button commits; sliding off cancels.
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

export interface DeadSheetInfo {
  /** 'dead': the current state cannot clear; 'stall': strokes are out. */
  kind: 'dead' | 'stall';
  title: string;
  body: string | null;
}

/** The dead sheet (0.A.3, J12): docked under the board, never over it. */
export function DeadSheet({ info, trial, rings, canUndo, onUndo, onRestart, onRing }: {
  info: DeadSheetInfo; trial: boolean; rings: number; canUndo: boolean;
  onUndo: () => void; onRestart: () => void; onRing: () => void;
}) {
  const stalledTrial = trial && info.kind === 'stall';
  return (
    <Animated.View entering={SlideInDown.springify().damping(15)} exiting={SlideOutDown.duration(160)} style={styles.sheet}>
      <View style={styles.grip} />
      <Text style={styles.sheetTitle}>{info.title}</Text>
      {info.body ? <Text style={styles.sheetBody}>{info.body}</Text> : null}
      <View style={styles.sheetRow}>
        {!stalledTrial ? (
          <Pressable onPress={onUndo} disabled={!canUndo} style={({ pressed }) => [styles.sheetBtn, styles.sheetPrimary, pressed && styles.pressed, !canUndo && styles.disabled]}
            accessibilityRole="button" accessibilityLabel="Undo">
            <View style={styles.flip}><GameIcon name="retry" size={22} /></View>
            <Text style={styles.sheetPrimaryTxt}>Undo</Text>
          </Pressable>
        ) : null}
        {trial ? (
          <Pressable onPress={onRing} disabled={rings <= 0} style={({ pressed }) => [styles.sheetBtn, stalledTrial && styles.sheetPrimary, pressed && styles.pressed, rings <= 0 && styles.disabled]}
            accessibilityRole="button" accessibilityLabel="Use a ring for two more strokes">
            <Image source={RING} style={styles.sheetIcon} />
            <Text style={stalledTrial ? styles.sheetPrimaryTxt : styles.sheetTxt}>{`Ring: +2 strokes (${rings} left)`}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onRestart} style={({ pressed }) => [styles.sheetBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Restart voyage">
            <GameIcon name="retry" size={22} />
            <Text style={styles.sheetTxt}>Restart</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingTop: 6, paddingHorizontal: 14, paddingBottom: 22, zIndex: 5 },
  barBig: { paddingTop: 2 },
  conchWrap: { alignItems: 'center', minWidth: 66 },
  conch: {
    backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center',
    shadowColor: CQ.waterDeep, shadowOpacity: 0.55, shadowRadius: 0, shadowOffset: { width: 0, height: 3 },
  },
  pressed: { transform: [{ scale: 0.93 }] },
  disabled: { opacity: 0.45 },
  disabledTxt: { opacity: 0.55 },
  conchLabel: { marginTop: 3, fontFamily: 'Knockout', fontSize: 12, color: '#ffffff', textShadowColor: CQ.waterDeep, textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  badge: { position: 'absolute', right: -6, top: -6, minWidth: 26, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: CQ.gold, borderWidth: 1.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontFamily: 'Knockout', fontSize: 11, color: CQ.navy },
  treadRing: { position: 'absolute', borderWidth: 4, borderColor: CQ.gold },
  flip: { transform: [{ scaleX: -1 }] },
  rotUp: { transform: [{ rotate: '-90deg' }] },
  menuScrim: { position: 'absolute', left: -400, right: -400, top: -900, bottom: -50 },
  radial: {
    position: 'absolute', right: 10, bottom: '100%', marginBottom: -2, flexDirection: 'row', gap: 6, padding: 8, borderRadius: 20,
    backgroundColor: CQ.cream, borderWidth: 2.5, borderColor: CQ.ink,
  },
  radialItem: { width: 70, minHeight: 74, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 2, borderColor: CQ.ink, paddingVertical: 6 },
  radialPressed: { transform: [{ scale: 0.94 }] },
  radialConfirm: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep },
  radialLabel: { marginTop: 3, fontFamily: 'Shark', fontSize: 14, color: CQ.navy },
  radialSub: { fontFamily: 'Knockout', fontSize: 10, color: CQ.navy, opacity: 0.8, textAlign: 'center' },
  arrow: { backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center' },
  arrowRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, alignSelf: 'stretch' },
  arrowPressed: { backgroundColor: '#fff3c2', transform: [{ scale: 0.94 }] },
  sheet: {
    position: 'absolute', left: 10, right: 10, bottom: 8, borderRadius: 20, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12,
    backgroundColor: CQ.cream, borderWidth: 3, borderColor: CQ.ink, alignItems: 'center', zIndex: 20,
  },
  grip: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(47,47,58,0.25)', marginBottom: 4 },
  sheetTitle: { fontFamily: 'Shark', fontSize: 20, color: CQ.navy, textAlign: 'center' },
  sheetBody: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, textAlign: 'center', marginTop: 1 },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2.5, borderColor: CQ.ink, backgroundColor: '#ffffff' },
  sheetPrimary: { backgroundColor: CQ.gold },
  sheetPrimaryTxt: { fontFamily: 'Shark', fontSize: 18, color: CQ.navy },
  sheetTxt: { fontFamily: 'Shark', fontSize: 18, color: CQ.navy },
  sheetIcon: { width: 26, height: 26, resizeMode: 'contain' },
});
