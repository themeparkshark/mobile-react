/**
 * Pin Trading pieces: the backer card a board pin sits on, status chips, the
 * hold timer, and the you-get / you-give slots. House look: blue panels, cream
 * cards, navy ink, gold accents (src/ui/tokens.ts). No player identity and no
 * free text anywhere.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { queueHaptic } from '../../gamekit/Haptics';
import type { ItemType } from '../../models/item-type';
import { BRAND, FONT, GameIcon, MOTION, OUTLINE, RADIUS, SHADOW, SPACE } from '../../ui';
import EnamelPin from './EnamelPin';
import {
  cardTilt, formatClock, HOLD_FINAL_S, pinName, pinTilt, secondsLeft, timerTone, type StatusChip,
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
  red: { bg: BRAND.red, ink: BRAND.white, border: BRAND.redLip },
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

/**
 * A board pin on its cream backer card, like the pin boards at the parks.
 * Press: the card dips, the pin lifts off the card (deeper shadow) and a light
 * haptic fires. The pin keeps its own tilt; the card tilts the other way.
 */
export const BoardPinCard = memo(function BoardPinCard({ item, swapId, width, shine, lag, still, busy, onPress }: {
  item: ItemType; swapId: number; width: number; shine?: SharedValue<number>; lag: number;
  still: boolean; busy: boolean; onPress: (swapId: number) => void;
}) {
  const press = useSharedValue(0);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (still) { lift.value = busy ? 1 : 0; return; }
    lift.value = withSpring(busy ? 1 : 0, MOTION.popSpring);
  }, [busy, still, lift]);
  const card = `${cardTilt(swapId)}deg`;
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: card }, { scale: 1 - press.value * 0.04 }],
  }));
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 6 - press.value * 3 }, { scale: 1 + lift.value * 0.06 + press.value * 0.03 }],
  }));
  const name = pinName(item);
  const pinSize = Math.round(width * 0.74);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. Up for trade`}
      accessibilityHint="Holds this pin for you so you can trade for it"
      accessibilityState={{ busy }}
      onPressIn={() => { if (!still) press.value = withTiming(1, { duration: MOTION.pressInMs }); }}
      onPressOut={() => { press.value = still ? 0 : withTiming(0, { duration: MOTION.pressOutMs }); }}
      onPress={() => { queueHaptic('tapLight', 1); onPress(swapId); }}
      disabled={busy}
      style={{ width, alignItems: 'center' }}
    >
      <Animated.View style={[styles.backer, { width: width - SPACE.sm, paddingTop: SPACE.lg }, cardStyle]}>
        <View style={styles.hole} />
        <Animated.View style={pinStyle}>
          <EnamelPin uri={item.icon_url} size={pinSize} tilt={pinTilt(swapId)} shine={still ? undefined : shine} lag={lag} lift={lift}
            recyclingKey={`board-${swapId}`} />
        </Animated.View>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={styles.backerName}>{name}</Text>
      </Animated.View>
    </Pressable>
  );
});

/**
 * Hold timer: big Shark-font clock plus a draining bar. Calm is gold; under
 * 30 s the bar and clock turn red and the clock pulses; the last 5 s tick with
 * a light haptic. The bar drains on the UI thread; the clock re-renders once a
 * second inside this component only.
 */
export function TradeTimer({ deadline, totalMs, frozen, still, label, onExpire }: {
  deadline: number; totalMs: number; frozen: boolean; still: boolean;
  /** The CMS line ("Your trade will expire in %s:%s") already filled in by the caller's formatter. */
  label: (clock: string, minutes: number, seconds: string) => string;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const lastTick = useRef(-1);
  const fill = useSharedValue(Math.max(0, Math.min(1, (deadline - Date.now()) / totalMs)));
  const pulse = useSharedValue(1);
  // Frozen (trade sending): hold the last shown second instead of jumping anywhere.
  const left = secondsLeft(deadline, now);
  const tone = frozen ? 'calm' : timerTone(left);

  useEffect(() => {
    fired.current = false;
    if (frozen) return;
    const start = Math.max(0, Math.min(1, (deadline - Date.now()) / totalMs));
    fill.value = start;
    fill.value = withTiming(0, { duration: Math.max(0, deadline - Date.now()), easing: Easing.linear });
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(id); cancelAnimation(fill); };
  }, [deadline, totalMs, frozen, fill]);

  useEffect(() => {
    if (frozen) return;
    if (left <= 0 && !fired.current) { fired.current = true; onExpire(); return; }
    if (left > 0 && left <= HOLD_FINAL_S && lastTick.current !== left) {
      lastTick.current = left;
      queueHaptic('tickSelection', 1);
    }
  }, [left, frozen, onExpire]);

  useEffect(() => {
    cancelAnimation(pulse);
    if (tone === 'urgent' && !still) {
      pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 260 }), withTiming(1, { duration: 740 })), -1, false);
    } else pulse.value = 1;
    return () => cancelAnimation(pulse);
  }, [tone, still, pulse]);

  const barStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const clockStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, '0');
  const clock = formatClock(left);
  const urgent = tone !== 'calm';
  const line = label(clock, minutes, seconds);

  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={line} accessibilityLiveRegion={left <= 10 ? 'assertive' : 'none'}
      style={styles.timer}>
      <View style={styles.timerRow}>
        <GameIcon name="timer" size={30} />
        <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={2} style={styles.timerLine}>{line.replace(/\s*\d+:\d{2}\s*$/, '')}</Text>
        <Animated.Text maxFontSizeMultiplier={1.2} style={[styles.timerClock, urgent && { color: '#ffd2cc' }, clockStyle]}>{clock}</Animated.Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.bar, { backgroundColor: urgent ? BRAND.red : BRAND.gold }, barStyle]} />
      </View>
    </View>
  );
}

/** "You get" / "You give" slot on the trade sheet. An empty give slot is a dashed outline with a quiet pin hint. */
export type SlotRect = { x: number; y: number; size: number };

export const TradeSlot = memo(function TradeSlot({ caption, item, tilt, size, shine, still, placeholder, onMeasure, hidden = false, measureKey }: {
  caption: string; item?: ItemType; hidden?: boolean;
  /** Re-measure when this changes (the sheet grows or shrinks between phases). */
  measureKey?: string; tilt: number; size: number; shine?: SharedValue<number>; still: boolean; placeholder?: string;
  /** Window-space centre of the pin, so the trade-complete moment starts exactly where the pin sits. */
  onMeasure?: (rect: SlotRect) => void;
}) {
  const box = useRef<View>(null);
  const measure = () => {
    box.current?.measureInWindow((x, y, w, h) => onMeasure?.({ x: x + w / 2, y: y + h / 2, size: Math.round(size * 0.88) }));
  };
  useEffect(() => {
    if (!onMeasure) return;
    const id = setTimeout(measure, 450);
    return () => clearTimeout(id);
  }, [measureKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pop = useSharedValue(item ? 1 : 0);
  const id = item?.id;
  useEffect(() => {
    if (!id) { pop.value = 0; return; }
    if (still) { pop.value = 1; return; }
    pop.value = 0.6;
    pop.value = withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 });
  }, [id, still, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: Math.min(1, pop.value * 1.4) }));
  return (
    <View style={styles.slotWrap} accessible accessibilityLabel={item ? `${caption}: ${pinName(item)}` : `${caption}: ${placeholder ?? 'nothing yet'}`}>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.slotCaption}>{caption}</Text>
      <View ref={box}
        style={[styles.slot, { width: size + SPACE.xl, height: size + SPACE.xl }, !item && styles.slotEmpty]}>
        {item ? (
          <Animated.View style={[style, hidden && { opacity: 0 }]}>
            <EnamelPin uri={item.icon_url} size={Math.round(size * 0.88)} tilt={tilt} shine={still ? undefined : shine} recyclingKey={`slot-${item.id}`} />
          </Animated.View>
        ) : (
          <Text maxFontSizeMultiplier={1.2} style={styles.slotQuestion}>?</Text>
        )}
      </View>
      <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={styles.slotName}>{item ? pinName(item) : placeholder ?? ''}</Text>
    </View>
  );
});

/** One of your pins in the picker: a sky well, gold ring and check when picked. */
export const PickPin = memo(function PickPin({ item, size, selected, still, onPress }: {
  item: ItemType; size: number; selected: boolean; still: boolean; onPress: (item: ItemType) => void;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = still ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { damping: 12, stiffness: 300, mass: 0.7 });
  }, [selected, still, on]);
  const pinStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -on.value * 4 }, { scale: 1 + on.value * 0.08 }] }));
  const badge = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.4 + on.value * 0.6 }] }));
  const name = pinName(item);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected }} hitSlop={2}
      onPress={() => onPress(item)} style={[styles.pick, { width: size, height: size }, selected && styles.pickOn]}>
      <Animated.View style={pinStyle}>
        <EnamelPin uri={item.icon_url} size={Math.round(size * 0.74)} tilt={pinTilt(item.id, 5)} recyclingKey={`mine-${item.id}`} />
      </Animated.View>
      <Animated.View style={[styles.pickBadge, badge]} pointerEvents="none"><GameIcon name="check" size={24} /></Animated.View>
    </Pressable>
  );
});

/** Soft top-to-bottom page wash behind the board (no flat fills). */
export function PageWash() {
  return <LinearGradient colors={TRADE_SURFACE.page} style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: SPACE.md, paddingVertical: 5, borderRadius: RADIUS.pill, borderWidth: OUTLINE.thin,
  },
  chipText: { fontFamily: FONT.display, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 2 },
  backer: {
    alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.md, borderWidth: OUTLINE.thin, borderColor: BRAND.creamDeep,
    paddingBottom: SPACE.sm, paddingHorizontal: SPACE.xs, ...SHADOW.card,
  },
  hole: {
    position: 'absolute', top: 6, width: 14, height: 6, borderRadius: 3, backgroundColor: '#e7d4a0', borderWidth: 1, borderColor: '#d2bb7f',
  },
  backerName: {
    marginTop: SPACE.xs, fontFamily: FONT.body, fontSize: 14, lineHeight: 16, color: BRAND.navy, textAlign: 'center', minHeight: 32,
  },
  timer: { backgroundColor: TRADE_SURFACE.well, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm + 2, gap: SPACE.sm },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  timerClock: { fontFamily: FONT.display, fontSize: 34, lineHeight: 40, color: BRAND.white, fontVariant: ['tabular-nums'], minWidth: 78, textAlign: 'right', paddingTop: 4 },
  timerLine: { flex: 1, fontFamily: FONT.body, fontSize: 16, lineHeight: 19, color: TRADE_SURFACE.inkSoft },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  slotWrap: { alignItems: 'center', flex: 1 },
  slotCaption: { fontFamily: FONT.body, fontSize: 14, letterSpacing: 0.9, textTransform: 'uppercase', color: TRADE_SURFACE.inkGold, marginBottom: SPACE.xs },
  slot: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.lg,
    borderWidth: OUTLINE.thick, borderColor: BRAND.white, ...SHADOW.card,
  },
  slotEmpty: { backgroundColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.7)', shadowOpacity: 0, elevation: 0 },
  slotQuestion: { fontFamily: FONT.display, fontSize: 44, color: 'rgba(255,255,255,0.8)', paddingTop: 6 },
  slotName: { marginTop: SPACE.xs, fontFamily: FONT.body, fontSize: 15, lineHeight: 18, color: BRAND.white, textAlign: 'center', minHeight: 36, paddingHorizontal: 2 },
  pick: {
    alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: BRAND.sky,
    borderWidth: OUTLINE.thick, borderColor: BRAND.white,
  },
  pickOn: { borderColor: BRAND.gold, backgroundColor: '#fff3c4', borderWidth: OUTLINE.heavy },
  pickBadge: { position: 'absolute', top: -8, right: -8 },
});
