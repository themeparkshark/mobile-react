/**
 * Pin Trading pieces: the backer card a board pin sits on, status chips, the
 * hold timer, and the you-get / you-give slots. House look: blue panels, cream
 * cards, navy ink, gold accents (src/ui/tokens.ts). No player identity and no
 * free text anywhere.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { queueHaptic } from '../../gamekit/Haptics';
import type { ItemType } from '../../models/item-type';
import { BRAND, FONT, GameIcon, MOTION, OUTLINE, RADIUS, SHADOW, SPACE } from '../../ui';
import EnamelPin from './EnamelPin';
import {
  balanceName, cardTilt, formatClock, HAPTIC_AFTER_AUDIO_MS, HOLD_FINAL_S, HOLD_URGENT_S, pinName, pinTilt, secondsLeft, type StatusChip,
} from './pinTradeModel';

/** Trading surfaces (the shop v2 blue panels). Every ink here is AA on its surface. */
export const TRADE_SURFACE = {
  page: ['#0a6fc2', '#075aa6'] as const,
  panel: '#0a4f96',
  well: '#08427f',
  card: BRAND.cream,
  ink: '#ffffff',
  inkSoft: '#e2f6ff',
  inkGold: '#ffe07a',
  line: 'rgba(255,255,255,0.22)',
} as const;

export const MAX_FONT = 1.3;

const CHIP_TONE: Record<StatusChip['tone'], { bg: string; ink: string; border: string }> = {
  gold: { bg: BRAND.gold, ink: BRAND.navy, border: BRAND.goldLip },
  blue: { bg: BRAND.blueBright, ink: BRAND.white, border: BRAND.white },
  red: { bg: BRAND.red, ink: BRAND.white, border: BRAND.white },
  green: { bg: BRAND.green, ink: BRAND.white, border: BRAND.greenLip },
};

export const StatusChipView = memo(function StatusChipView({ chip }: { chip: StatusChip }) {
  const tone = CHIP_TONE[chip.tone];
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={chip.label}
      style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <GameIcon name={chip.icon} size={18} />
      <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.chipText, { color: tone.ink }]}>{chip.label}</Text>
    </View>
  );
});

/** A small ribbon across a card corner ("Got it", "From you"). */
export function CornerRibbon({ label, tone = 'navy', icon }: { label: string; tone?: 'navy' | 'gold' | 'red'; icon?: 'check' | 'arrow' }) {
  const bg = tone === 'gold' ? BRAND.gold : tone === 'red' ? BRAND.red : BRAND.navy;
  const ink = tone === 'gold' ? BRAND.navy : BRAND.white;
  return (
    <View pointerEvents="none" style={[styles.ribbon, { backgroundColor: bg }]}>
      {icon && <GameIcon name={icon} size={14} style={icon === 'arrow' ? { transform: [{ rotate: '-90deg' }] } : undefined} />}
      <Text maxFontSizeMultiplier={1} style={[styles.ribbonText, { color: ink }]}>{label}</Text>
    </View>
  );
}

export type BoardBadge = 'owned' | 'yours' | undefined;

/**
 * A board pin on its cream backer card, like the pin boards at the parks.
 * Press-in: a light haptic at once, the card dips and leans toward the
 * finger, the pin lifts off the card (deeper shadow). The pin keeps its own
 * tilt; the card tilts the other way.
 */
export const BoardPinCard = memo(function BoardPinCard({ item, swapId, tiltSeed = swapId, width, height, shine, lag, lagSpan, still, busy, badge, onPress, serial }: {
  /** Pins v2: a gold chaser's number (#3) shows on its card, so it never looks like a common. */
  serial?: number | null;
  item: ItemType; swapId: number;
  /** Stable per slot, so a pin changing in place keeps the card's tilt. */
  tiltSeed?: number; width: number; height: number; shine?: SharedValue<number>; lag: number; lagSpan: number;
  still: boolean; busy: boolean; badge?: BoardBadge; onPress: (swapId: number) => void;
}) {
  const press = useSharedValue(0);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (still) { lift.value = busy ? 1 : 0; return; }
    lift.value = withSpring(busy ? 1 : 0, MOTION.popSpring);
  }, [busy, still, lift]);
  // A slot whose pin changes in place (your pin landing on the board) settles with a small bounce.
  const settle = useSharedValue(1);
  const firstItem = useRef(item.id);
  useEffect(() => {
    if (firstItem.current === item.id) return;
    firstItem.current = item.id;
    if (still) return;
    settle.value = 0.86;
    settle.value = withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 });
  }, [item.id, still, settle]);
  const card = cardTilt(tiltSeed);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${card + press.value * 2}deg` }, { scale: (1 - press.value * 0.06) * settle.value }],
  }));
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 6 - press.value * 3 }, { scale: 1 + lift.value * 0.06 + press.value * 0.03 }],
  }));
  const name = pinName(item);
  const pinSize = Math.round(width * 0.72);
  const status = badge === 'owned' ? '. You already have this one' : badge === 'yours' ? '. You put this one up' : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. Up for trade${status}`}
      accessibilityHint="Holds this pin for you so you can trade for it"
      accessibilityState={{ busy }}
      onPressIn={() => {
        queueHaptic('tapLight', 1);
        if (!still) press.value = withTiming(1, { duration: MOTION.pressInMs });
      }}
      onPressOut={() => { press.value = still ? 0 : withTiming(0, { duration: MOTION.pressOutMs }); }}
      onPress={() => onPress(swapId)}
      disabled={busy}
      style={{ width, alignItems: 'center' }}
    >
      <Animated.View style={[styles.backer, { width: width - SPACE.sm, height }, cardStyle]}>
        <View style={styles.hole}><View style={styles.holeShade} /></View>
        <Animated.View style={[pinStyle, badge ? { opacity: 0.7 } : null]}>
          <EnamelPin uri={item.icon_url} size={pinSize} tilt={pinTilt(tiltSeed)} shine={still ? undefined : shine} lag={lag} lagSpan={lagSpan}
            lift={lift} surface="board" recyclingKey={`board-${swapId}`} />
        </Animated.View>
        {!!serial && <View style={styles.boardSerial} pointerEvents="none"><Text maxFontSizeMultiplier={1} style={styles.pickSerialText}>#{serial}</Text></View>}
        <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={styles.backerName}>{balanceName(name)}</Text>
        {badge && <CornerRibbon label={badge === 'owned' ? 'Got it' : 'From you'} tone={badge === 'owned' ? 'navy' : 'gold'} icon={badge === 'owned' ? 'check' : 'arrow'} />}
      </Animated.View>
    </Pressable>
  );
});

/**
 * Hold timer: a Shark-font clock and a draining bar. Calm is white on navy
 * with a gold bar. At 30 s it turns red (no buzz): the
 * clock sits on a white pill in brand red; it pulses on each digit flip in the
 * last 10 s. A soft tick sounds at 30 s and in the last 5 s; only the last 3 s
 * add a light haptic (no warning buzz). The bar drains on the UI
 * thread (scaleX, no layout); the clock re-renders only when the second changes.
 */
export const TradeTimer = memo(function TradeTimer({ deadline, totalMs, frozen, still, label, onExpire, onTick, onUrgent }: {
  deadline: number; totalMs: number; frozen: boolean; still: boolean;
  /** Fills the CMS line ("Your trade will expire in %s:%s"). */
  label: (clock: string, minutes: number, seconds: string) => string;
  onExpire: () => void;
  /** The last few seconds: a soft audible tick. */
  onTick?: (secondsLeft: number) => void;
  /** Crossing into the last 30 seconds (once per hold). */
  onUrgent?: () => void;
}) {
  const [left, setLeft] = useState(() => secondsLeft(deadline, Date.now()));
  const fired = useRef(false);
  const warned = useRef(false);
  const later = useRef<ReturnType<typeof setTimeout>[]>([]);
  const said30 = useRef(false);
  const said10 = useRef(false);
  useEffect(() => () => later.current.forEach(clearTimeout), []);
  const fill = useSharedValue(Math.max(0, Math.min(1, (deadline - Date.now()) / totalMs)));
  const pulse = useSharedValue(1);
  const urgent = !frozen && left <= HOLD_URGENT_S;

  useEffect(() => {
    fired.current = false;
    warned.current = secondsLeft(deadline, Date.now()) <= HOLD_URGENT_S;
    said30.current = false;
    said10.current = false;
    setLeft(secondsLeft(deadline, Date.now()));
    if (frozen) { cancelAnimation(fill); return; }
    fill.value = Math.max(0, Math.min(1, (deadline - Date.now()) / totalMs));
    // A progress bar, not decoration: it drains under Reduce Motion too.
    fill.value = withTiming(0, { duration: Math.max(0, deadline - Date.now()), easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    const id = setInterval(() => {
      const next = secondsLeft(deadline, Date.now());
      setLeft(prev => (prev === next ? prev : next));
    }, 200);
    return () => { clearInterval(id); cancelAnimation(fill); };
  }, [deadline, totalMs, frozen, fill]);

  useEffect(() => {
    if (frozen) return;
    if (left <= 0) {
      if (!fired.current) { fired.current = true; onExpire(); }
      return;
    }
    // The chip follows the clock on every render path (a hold that opens under 30 s is red at once);
    // the 30 s soft tick is one-shot.
    if (left <= HOLD_URGENT_S) onUrgent?.();
    if (left <= HOLD_URGENT_S && !warned.current) {
      warned.current = true;
      onTick?.(HOLD_URGENT_S);
    }
    // Announce when the clock crosses 30 s and 10 s (not only on an exact tick).
    if (left <= 10 && !said10.current) { said10.current = true; said30.current = true; AccessibilityInfo.announceForAccessibility(`${left} seconds left`); }
    else if (left <= HOLD_URGENT_S && !said30.current) { said30.current = true; AccessibilityInfo.announceForAccessibility(`${left} seconds left`); }
    if (left <= HOLD_FINAL_S) {
      onTick?.(left);
      if (left <= 3) later.current.push(setTimeout(() => queueHaptic('tickSelection', 1), HAPTIC_AFTER_AUDIO_MS));
    }
    // Calm red until the last 10 s; then the pulse lands on each digit flip.
    if (left <= 10 && !still) {
      pulse.value = withSequence(withTiming(1.12, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 260 }));
    }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.0001, fill.value) }] }));
  const clockStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, '0');
  const clock = formatClock(left);
  const line = label(clock, minutes, seconds);

  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={line} style={styles.timer}>
      <View style={styles.timerRow}>
        <GameIcon name="timer" size={30} />
        <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={2} style={styles.timerLine}>{line.replace(/\s*\d+:\d{2}\s*$/, '')}</Text>
        <Animated.View style={[styles.clockPill, urgent && styles.clockPillUrgent, clockStyle]}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.timerClock, urgent && { color: BRAND.red }, frozen && { color: TRADE_SURFACE.inkGold }]}>{clock}</Text>
        </Animated.View>
      </View>
      <View style={styles.track}>
        {/* Anchored left: the bar is full width and scales from its left edge. */}
        <Animated.View style={[styles.barAnchor, barStyle]}>
          <View style={[styles.bar, { backgroundColor: urgent ? BRAND.red : BRAND.gold }]} />
        </Animated.View>
      </View>
    </View>
  );
});

export type SlotRect = { x: number; y: number; size: number };

/**
 * "You get" / "You give" slot on the trade sheet. An empty give slot is a
 * dashed outline. `stamp` greys the pin under a TIME'S UP or TAKEN stamp;
 * `charging` makes it rise and wiggle while the trade is in flight.
 */
export const TradeSlot = memo(function TradeSlot({ caption, item, tilt, size, shine, still, placeholder, onMeasure, hidden = false, measureKey, stamp, charging = false }: {
  caption: string; item?: ItemType; hidden?: boolean;
  /** Re-measure when this changes (the sheet grows or shrinks between phases). */
  measureKey?: string; tilt: number; size: number; shine?: SharedValue<number>; still: boolean; placeholder?: string;
  /** Window-space centre and drawn size of the pin, so the trade-complete moment starts exactly where the pin sits. */
  onMeasure?: (rect: SlotRect) => void;
  stamp?: string;
  charging?: boolean;
}) {
  const box = useRef<View>(null);
  const pinSize = Math.round(size * 0.88);
  const measure = () => {
    box.current?.measureInWindow((x, y, w, h) => onMeasure?.({ x: x + w / 2, y: y + h / 2, size: pinSize }));
  };
  useEffect(() => {
    if (!onMeasure) return;
    const frame = requestAnimationFrame(measure);
    const late = setTimeout(measure, 450);
    return () => { cancelAnimationFrame(frame); clearTimeout(late); };
  }, [measureKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pop = useSharedValue(item ? 1 : 0);
  const wiggle = useSharedValue(0);
  const id = item?.id;
  useEffect(() => {
    if (!id) { pop.value = 0; return; }
    if (still) { pop.value = 1; return; }
    pop.value = 0.6;
    pop.value = withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 });
  }, [id, still, pop]);
  useEffect(() => {
    cancelAnimation(wiggle);
    if (!charging || still) { wiggle.value = withTiming(0, { duration: 120 }); return; }
    wiggle.value = withRepeat(withSequence(withTiming(1, { duration: 110 }), withTiming(-1, { duration: 220 }), withTiming(0, { duration: 110 })), -1, false);
    return () => cancelAnimation(wiggle);
  }, [charging, still, wiggle]);
  const hand = useSharedValue(0);
  useEffect(() => { hand.value = hidden ? withTiming(1, { duration: 160 }) : 0; }, [hidden, hand]);
  // The pin lifts out of its card; the card itself settles back and fades.
  const handStyle = useAnimatedStyle(() => ({ opacity: 1 - hand.value * 0.7, transform: [{ scale: 1 - hand.value * 0.1 }] }));
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.4),
    transform: [{ translateY: -Math.abs(wiggle.value) * 4 }, { rotate: `${wiggle.value * 4}deg` }, { scale: pop.value }],
  }));
  const label = item ? `${caption}: ${pinName(item)}${stamp ? `, ${stamp}` : ''}` : `${caption}: ${placeholder ?? 'nothing yet'}`;
  return (
    <View style={styles.slotWrap} accessible accessibilityLabel={label}>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.slotCaption}>{caption}</Text>
      <Animated.View ref={box as never} collapsable={false}
        style={[styles.slot, handStyle, { width: size + SPACE.xl, height: size + SPACE.xl }, !item && styles.slotEmpty, !!stamp && styles.slotDim]}>
        {item ? (
          <View style={{ opacity: hidden ? 0 : stamp ? 0.75 : 1 }}>
            <Animated.View style={style}>
              <EnamelPin uri={item.icon_url} size={pinSize} tilt={tilt} shine={still || stamp ? undefined : shine} surface="board"
                transition={0} recyclingKey={`slot-${item.id}`} />
            </Animated.View>
          </View>
        ) : (
          <Text maxFontSizeMultiplier={1.2} style={styles.slotQuestion}>?</Text>
        )}
        {!!stamp && !!item && (
          <View pointerEvents="none" style={[styles.stamp, { maxWidth: (size + SPACE.xl) * 0.7, bottom: SPACE.sm }]}><Text maxFontSizeMultiplier={1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.stampText}>{stamp}</Text></View>
        )}
      </Animated.View>
      <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={styles.slotName}>{item ? balanceName(pinName(item), 16) : placeholder ?? ''}</Text>
    </View>
  );
});

/** One of your pins in the picker: a cream tile like the board cards, a gold ring and check when picked. */
export const PickPin = memo(function PickPin({ item, size, selected, still, onPress }: {
  item: ItemType; size: number; selected: boolean; still: boolean; onPress: (item: ItemType) => void;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(0);
  useEffect(() => {
    on.value = still ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { damping: 12, stiffness: 300, mass: 0.7 });
  }, [selected, still, on]);
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.08 }] }));
  const pinStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -on.value * 4 }, { scale: 1 + on.value * 0.08 }] }));
  const badge = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.4 + on.value * 0.6 }] }));
  const name = pinName(item);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected }} hitSlop={2}
      onPressIn={() => { if (!still) press.value = withTiming(1, { duration: MOTION.pressInMs }); }}
      onPressOut={() => { press.value = still ? 0 : withTiming(0, { duration: MOTION.pressOutMs }); }}
      onPress={() => onPress(item)}>
      <Animated.View style={[styles.pick, { width: size, height: size }, selected && styles.pickOn, tileStyle]}>
        <Animated.View style={pinStyle}>
          <EnamelPin uri={item.icon_url} size={Math.round(size * 0.74)} tilt={pinTilt(item.id, 5)} surface="none" flat recyclingKey={`mine-${item.id}`} />
        </Animated.View>
        <Animated.View style={[styles.pickBadge, badge]} pointerEvents="none"><GameIcon name="check" size={24} /></Animated.View>
        {/* Pins v2: spares show as x2 (give one, keep yours); a gold serial shows its number. */}
        {(item.spares ?? 0) > 0 && <View style={styles.pickSpares} pointerEvents="none"><Text maxFontSizeMultiplier={1} style={styles.pickSparesText}>x{(item.spares ?? 0) + 1}</Text></View>}
        {!!item.serial && <View style={styles.pickSerial} pointerEvents="none"><Text maxFontSizeMultiplier={1} style={styles.pickSerialText}>#{item.serial}</Text></View>}
      </Animated.View>
    </Pressable>
  );
});

/** Soft top-to-bottom page wash behind the board (no flat fills). */
export function PageWash() {
  return <LinearGradient colors={TRADE_SURFACE.page} style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  pickSpares: { position: 'absolute', left: 2, bottom: 2, minWidth: 24, height: 20, borderRadius: 10, backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pickSparesText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.navy, paddingTop: 2 },
  pickSerial: { position: 'absolute', right: 2, top: 2, height: 18, borderRadius: 5, backgroundColor: '#3b2a05', borderWidth: 2, borderColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  boardSerial: { position: 'absolute', top: 10, left: 8, height: 22, borderRadius: 6, backgroundColor: '#3b2a05', borderWidth: 2, borderColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, transform: [{ rotate: '6deg' }] },
  pickSerialText: { fontFamily: FONT.display, fontSize: 11, color: BRAND.gold, paddingTop: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: SPACE.md, paddingVertical: 5, borderRadius: RADIUS.pill, borderWidth: OUTLINE.thin,
  },
  chipText: { fontFamily: FONT.display, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 2 },
  ribbon: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    position: 'absolute', top: 10, right: -6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    transform: [{ rotate: '8deg' }], borderWidth: 2, borderColor: BRAND.white,
  },
  ribbonText: { fontFamily: FONT.display, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 1 },
  backer: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.md, borderWidth: OUTLINE.thin,
    borderColor: BRAND.creamDeep, paddingTop: SPACE.md, paddingBottom: SPACE.xs, paddingHorizontal: SPACE.xs, ...SHADOW.card,
  },
  hole: {
    position: 'absolute', top: 6, width: 18, height: 8, borderRadius: 4, backgroundColor: '#b58a4e', overflow: 'hidden',
    borderWidth: 1, borderColor: '#d9c08a',
  },
  holeShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: '#6e4a1c' },
  backerName: {
    marginTop: SPACE.xs, fontFamily: FONT.body, fontSize: 14, lineHeight: 16, color: BRAND.navy, textAlign: 'center',
  },
  timer: { backgroundColor: TRADE_SURFACE.well, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm + 2, gap: SPACE.sm },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  clockPill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.sm, minWidth: 88, alignItems: 'flex-end' },
  clockPillUrgent: { backgroundColor: BRAND.white, alignItems: 'center' },
  timerClock: { fontFamily: FONT.display, fontSize: 34, lineHeight: 40, color: BRAND.white, fontVariant: ['tabular-nums'], letterSpacing: 1.5, paddingTop: 4 },
  timerLine: { flex: 1, fontFamily: FONT.body, fontSize: 16, lineHeight: 19, color: TRADE_SURFACE.inkSoft },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barAnchor: { ...StyleSheet.absoluteFillObject, transformOrigin: 'left' },
  bar: { flex: 1, borderRadius: 5 },
  slotWrap: { alignItems: 'center', flex: 1 },
  slotCaption: { fontFamily: FONT.body, fontSize: 14, letterSpacing: 0.9, textTransform: 'uppercase', color: TRADE_SURFACE.inkGold, marginBottom: SPACE.xs },
  slot: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.lg,
    borderWidth: OUTLINE.thick, borderColor: BRAND.white, ...SHADOW.card,
  },
  slotEmpty: { backgroundColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.7)', shadowOpacity: 0, elevation: 0 },
  slotDim: { backgroundColor: '#e6e0cf' },
  slotQuestion: { fontFamily: FONT.display, fontSize: 44, color: 'rgba(255,255,255,0.8)', paddingTop: 6 },
  slotName: { marginTop: SPACE.xs, fontFamily: FONT.body, fontSize: 15, lineHeight: 18, color: BRAND.white, textAlign: 'center', minHeight: 36, paddingHorizontal: 2 },
  stamp: {
    position: 'absolute', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 3, borderColor: BRAND.red,
    transform: [{ rotate: '-10deg' }],
  },
  stampText: { fontFamily: FONT.display, fontSize: 15, letterSpacing: 0.8, color: BRAND.red, textTransform: 'uppercase', paddingTop: 2, textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  pick: {
    alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: BRAND.cream,
    borderWidth: OUTLINE.thick, borderColor: BRAND.creamDeep,
  },
  pickOn: { borderColor: BRAND.gold, backgroundColor: '#fff3c4', borderWidth: OUTLINE.heavy },
  pickBadge: { position: 'absolute', top: -8, right: -8 },
});
