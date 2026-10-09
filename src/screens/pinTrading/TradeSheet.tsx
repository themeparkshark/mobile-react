/**
 * The trade sheet: opens when a board pin is held for you. It shows what you
 * get and what you give side by side, the hold timer, your tradeable pins,
 * and a two-step Trade button. Expired, taken and failed trades stay on the
 * sheet with a clear status and a way forward instead of vanishing.
 *
 * Rendered inside the screen (not a native Modal), so GameDialog prompts and
 * the trade-complete moment layer above it. The scrim never closes the sheet:
 * only the X, "Not now" and "Back to board" do, so a stray tap can't drop a hold.
 */
import { useAmbient } from '../../services/money/useAmbient';
import { memo, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, FadeIn, FadeOut, LinearTransition, ReduceMotion, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withRepeat,
  withSequence, withTiming, ZoomIn, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ItemType } from '../../models/item-type';
import type { PinSwapType } from '../../models/pin-swap-type';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SharkLoader, SPACE } from '../../ui';
import EnamelPin from './EnamelPin';
import { PickPin, type SlotRect, StatusChipView, TRADE_SURFACE, TradeSlot, TradeTimer, MAX_FONT } from './PinTradeParts';
import { PIN_TRADE_COPY as COPY, pinName, pinTilt, statusChip, type TradePhase } from './pinTradeModel';

export type TradeSheetProps = {
  readonly swap: PinSwapType;
  readonly phase: TradePhase;
  readonly deadline: number;
  readonly totalMs: number;
  readonly pins: readonly ItemType[];
  readonly pinsLoading: boolean;
  readonly pinsError: boolean;
  readonly selected?: ItemType;
  readonly still: boolean;
  readonly shine?: SharedValue<number>;
  readonly timerLabel: (clock: string, minutes: number, seconds: string) => string;
  /** The CMS label for the trade button (labels.trade_pin). */
  readonly tradeLabel: string;
  readonly onSelect: (item: ItemType) => void;
  readonly onTrade: () => void;
  readonly onClose: () => void;
  /** Confirming: back to picking. */
  readonly onBack: () => void;
  /** Expired: hold the same pin again. */
  readonly onHoldAgain: () => void;
  readonly onExpire: () => void;
  readonly onTick: (secondsLeft: number) => void;
  readonly onRetryPins: () => void;
  readonly onMorePins: () => void;
  readonly onSlot?: (which: 'get' | 'give', rect: SlotRect) => void;
  /** The trade-complete moment has taken the two pins: hide them here and fade out. */
  readonly handedOff?: boolean;
};

const COLUMNS = 4;
const fade = (ms: number) => FadeIn.duration(ms).reduceMotion(ReduceMotion.Never);
const fadeOut = (ms: number) => FadeOut.duration(ms).reduceMotion(ReduceMotion.Never);

/** "Tap one of your pins": plain words with a nudging arrow, not a button shape. */
function PickHint({ still }: { still: boolean }) {
  const nudge = useSharedValue(0);
  const ambient = useAmbient();
  useEffect(() => {
    if (still || !ambient) return;
    nudge.value = withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 380 })), -1, false);
    return () => cancelAnimation(nudge);
  }, [still, ambient, nudge]);
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateY: -nudge.value * 5 }, { rotate: '-90deg' }] }));
  return (
    <View style={styles.pickHint} accessible accessibilityLabel={COPY.pickFirst}>
      <Animated.View style={arrow}><GameIcon name="arrow" size={26} /></Animated.View>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.pickHintText}>{COPY.pickFirst}</Text>
    </View>
  );
}

/** The swap badge between the slots; it spins while the trade is in flight. */
function SwapBadge({ spinning }: { spinning: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(spin);
    if (!spinning) { spin.value = 0; return; }
    spin.value = withRepeat(withTiming(1, { duration: 700 }), -1, false);
    return () => cancelAnimation(spin);
  }, [spinning, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <View style={styles.swapBadge}><Animated.View style={style}><GameIcon name="swap" size={40} /></Animated.View></View>
  );
}

function TradeSheet(props: TradeSheetProps) {
  const { swap, phase, deadline, totalMs, pins, pinsLoading, pinsError, selected, still, shine } = props;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(0);
  const [hurry, setHurry] = useState(false);
  const sheetWidth = Math.min(width, 520);
  const inner = sheetWidth - SPACE.lg * 2 - OUTLINE.heavy * 2;
  const cell = Math.floor((inner - SPACE.sm * (COLUMNS - 1)) / COLUMNS);
  // Short phones (SE, 667 pt): smaller slots, one picker row (it scrolls), tighter gaps.
  const compact = height < 740;
  const slotSize = Math.min(compact ? 68 : 112, Math.round(inner * 0.3));
  const pickerRows = compact ? 1.25 : 2;
  const ended = phase === 'expired' || phase === 'failed' || phase === 'taken';
  const sending = phase === 'sending';
  const confirming = phase === 'confirming' || sending;
  useEffect(() => { setHurry(false); }, [deadline]);

  // Short phones: the second step hides the picker so both choices fit ("Wait, go back" returns to it).
  const showPicker = !ended && !(compact && confirming);
  const noPins = !pinsLoading && !pinsError && pins.length === 0;
  const stamp = phase === 'expired' ? "Time's up" : phase === 'taken' ? 'Taken' : undefined;
  const measureKey = `${phase}:${selected?.id ?? 0}:${pins.length > 0}:${room}`;
  const endTitle = phase === 'expired' ? COPY.expiredTitle : phase === 'taken' ? COPY.takenTitle : COPY.failedTitle;
  const endBody = phase === 'expired' ? COPY.expiredMessage : phase === 'taken' ? COPY.takenMessage : COPY.failedMessage;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={e => setRoom(e.nativeEvent.layout.height)}
      accessibilityViewIsModal>
      <Animated.View entering={fade(180)} exiting={fadeOut(150)} style={[StyleSheet.absoluteFill, styles.scrim]}>
        {/* Swallows taps on the dimmed board; it never closes the sheet. */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no" />
      </Animated.View>
      <Animated.View
        entering={still ? fade(180) : SlideInDown.springify().damping(18).stiffness(180).mass(0.9)}
        exiting={still || props.handedOff ? fadeOut(150) : SlideOutDown.duration(200).reduceMotion(ReduceMotion.Never)}
        // The top edge glides between phases instead of jumping.
        layout={still ? undefined : LinearTransition.springify().damping(20).stiffness(220)}
        style={[styles.sheet, { width: sheetWidth, maxHeight: room ? room - SPACE.md : height * 0.85, paddingBottom: Math.max(insets.bottom, compact ? SPACE.sm : SPACE.lg) }, compact && { gap: SPACE.sm }]}
      >
        <View style={styles.grabber} />
        <View style={styles.topRow}>
          <StatusChipView chip={statusChip(phase, hurry && (phase === 'picking' || phase === 'confirming'))} />
          <Pressable onPress={props.onClose} disabled={sending} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <GameIcon name="close" size={36} />
          </Pressable>
        </View>

        <View style={styles.stage}>
          <TradeSlot caption={COPY.get} item={swap.pin.item} hidden={props.handedOff} measureKey={measureKey} stamp={stamp} charging={sending && !props.handedOff}
            tilt={pinTilt(swap.id)} size={slotSize} shine={shine} still={still} onMeasure={rect => props.onSlot?.('get', rect)} />
          <SwapBadge spinning={sending && !still && !props.handedOff} />
          <TradeSlot caption={COPY.give} item={phase === 'expired' || phase === 'taken' ? undefined : selected} hidden={props.handedOff}
            measureKey={measureKey} charging={sending && !props.handedOff} tilt={selected ? pinTilt(selected.id, 5) : 0} size={slotSize} still={still}
            placeholder={COPY.yourPin} onMeasure={rect => props.onSlot?.('give', rect)} />
        </View>

        {(!ended || phase === 'failed') && (
          <TradeTimer deadline={deadline} totalMs={totalMs} frozen={sending} still={still} label={props.timerLabel}
            onExpire={props.onExpire} onTick={props.onTick} onUrgent={() => setHurry(true)} />
        )}

        {ended && (
          <Animated.View entering={still ? undefined : fade(200)} style={styles.endCard} accessible accessibilityLiveRegion="polite"
            accessibilityLabel={`${endTitle}. ${endBody}`}>
            <GameIcon name={phase === 'expired' ? 'timer' : phase === 'taken' ? 'search' : 'retry'} size={44} />
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.endTitle}>{endTitle}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.endBody}>{endBody}</Text>
            </View>
          </Animated.View>
        )}

        {showPicker && (
          <View style={styles.picker}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.pickerLabel}>{COPY.pickPrompt}</Text>
            {pinsLoading && pins.length === 0 && <SharkLoader compact tone="onBlue" />}
            {pinsError && pins.length === 0 && <SharkLoader compact tone="onBlue" state="error" onRetry={props.onRetryPins} />}
            {noPins && (
              <View style={styles.noPins}>
                <GameIcon name="chest" size={56} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.endTitle}>{COPY.noPinsTitle}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.endBody}>{COPY.noPinsMessage}</Text>
                </View>
              </View>
            )}
            {pins.length > 0 && (
              <FlatList
                data={pins as ItemType[]}
                keyExtractor={item => String(item.id)}
                numColumns={COLUMNS}
                style={{ maxHeight: cell * pickerRows + SPACE.sm * 2 + SPACE.md }}
                contentContainerStyle={{ gap: SPACE.sm, paddingTop: SPACE.sm, paddingBottom: SPACE.xs }}
                columnWrapperStyle={{ gap: SPACE.sm }}
                showsVerticalScrollIndicator={pins.length > COLUMNS * 2}
                onEndReachedThreshold={0.5}
                onEndReached={props.onMorePins}
                renderItem={({ item }) => (
                  <PickPin item={item} size={cell} selected={selected?.id === item.id} still={still} onPress={props.onSelect}
                    locked={!!swap.serial && !item.serial} />
                )}
              />
            )}
          </View>
        )}

        <View style={styles.actions}>
          {phase === 'failed' ? (
            <GameButton label={COPY.tryAgain} icon="retry" onPress={props.onTrade} />
          ) : phase === 'expired' ? (
            <GameButton label={COPY.holdAgain} icon="retry" onPress={props.onHoldAgain} />
          ) : phase === 'taken' || noPins ? (
            <GameButton label={COPY.backToBoard} icon="back" onPress={props.onClose} />
          ) : confirming ? (
            <Animated.View key="confirm" entering={still ? undefined : fade(140)} style={styles.actionSlot}>
              {/* The second step looks different without words: give -> get, in a gold-edged well. */}
              {selected && (
                <View style={styles.confirmWell} accessible accessibilityLabel={COPY.confirmMessage(pinName(selected), pinName(swap.pin.item))}>
                  <EnamelPin uri={selected.icon_url} size={compact ? 34 : 42} surface="none" recyclingKey={`mine-${selected.id}`} />
                  <GameIcon name="arrow" size={26} />
                  <EnamelPin uri={swap.pin.item.icon_url} size={compact ? 34 : 42} surface="none" recyclingKey={`board-${swap.id}`} />
                  <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.confirmLine, { flex: 0 }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {COPY.confirmMessage(pinName(selected), pinName(swap.pin.item))}
                  </Text>
                  {/* Pins v2, in pictures: x2 -> x1 (you keep one) or LAST ONE; a gold number goes with its pin. */}
                  {selected.spares !== undefined && (
                    <View style={styles.confirmChips} accessible accessibilityLabel={(selected.spares ?? 0) > 0 ? COPY.confirmSpare : COPY.confirmKeeper(pinName(selected))}>
                      {(selected.spares ?? 0) > 0
                        ? <View style={[styles.confirmChip, { backgroundColor: BRAND.gold }]}><Text maxFontSizeMultiplier={1} style={styles.confirmChipText}>x{(selected.spares ?? 0) + 1} {'\u2192'} x{selected.spares}</Text></View>
                        : <View style={[styles.confirmChip, { backgroundColor: BRAND.red }]}><Text maxFontSizeMultiplier={1} style={[styles.confirmChipText, { color: BRAND.white }]}>LAST ONE</Text></View>}
                      {!!swap.serial && (
                        <View style={[styles.confirmChip, { backgroundColor: '#3b2a05', borderColor: BRAND.gold }]}><Text maxFontSizeMultiplier={1} style={[styles.confirmChipText, { color: BRAND.gold }]}>get #{swap.serial}</Text></View>
                      )}
                      {!!selected.serial && !(selected.spares ?? 0) && (
                        <View style={[styles.confirmChip, { backgroundColor: '#3b2a05', borderColor: BRAND.gold }]}><Text maxFontSizeMultiplier={1} style={[styles.confirmChipText, { color: BRAND.gold }]}>#{selected.serial}</Text></View>
                      )}
                    </View>
                  )}
                  </View>
                </View>
              )}
              <Animated.View entering={still ? undefined : ZoomIn.springify().damping(11).stiffness(240)} style={{ width: '100%', alignItems: 'center' }}>
                <GameButton label={sending ? COPY.sendingLabel : COPY.confirmLabel} icon={sending ? 'swap' : 'check'} onPress={props.onTrade} haptics={false} />
              </Animated.View>
            </Animated.View>
          ) : selected ? (
            <Animated.View key="trade" entering={still ? undefined : ZoomIn.springify().damping(12).stiffness(260)} style={styles.actionSlot}>
              <GameButton label={props.tradeLabel} icon="swap" onPress={props.onTrade} />
            </Animated.View>
          ) : (
            <View key="hint" style={[styles.actionSlot, compact && { minHeight: 56 }]}><PickHint still={still} /></View>
          )}
          {(phase === 'confirming' || phase === 'sending') && (
            // Stays (invisible) while sending, so the sheet never jumps under the player's finger.
            <View style={{ opacity: sending ? 0 : 1 }} pointerEvents={sending ? 'none' : 'auto'}>
              <GameButton variant="ghost" tone="onBlue" label={COPY.confirmBack} onPress={props.onBack} />
            </View>
          )}
          {(phase === 'picking' || phase === 'loading' || phase === 'failed' || phase === 'expired') && !noPins && (
            <GameButton variant="ghost" tone="onBlue" label={phase === 'picking' || phase === 'loading' ? COPY.notNow : COPY.backToBoard} onPress={props.onClose} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export default memo(TradeSheet);

const styles = StyleSheet.create({
  confirmChips: { flexDirection: 'row', gap: 6, marginTop: 4 },
  confirmChip: { borderRadius: 8, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 7, paddingVertical: 1 },
  confirmChipText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, paddingTop: 2 },
  scrim: { backgroundColor: 'rgba(6,30,74,0.86)' },
  sheet: {
    position: 'absolute', bottom: 0, alignSelf: 'center', backgroundColor: TRADE_SURFACE.panel,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: OUTLINE.heavy, borderBottomWidth: 0, borderColor: BRAND.white,
    paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, gap: SPACE.md,
    shadowColor: '#021c40', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 20,
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  swapBadge: {
    width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginTop: 4,
    backgroundColor: TRADE_SURFACE.well, borderWidth: OUTLINE.thick, borderColor: BRAND.white,
  },
  picker: { gap: SPACE.xs },
  pickerLabel: { fontFamily: FONT.body, fontSize: 14, letterSpacing: 0.9, textTransform: 'uppercase', color: TRADE_SURFACE.inkGold },
  noPins: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: TRADE_SURFACE.well, borderRadius: RADIUS.lg, padding: SPACE.md },
  endCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: TRADE_SURFACE.well, borderRadius: RADIUS.lg, padding: SPACE.md },
  endTitle: { fontFamily: FONT.display, fontSize: 20, lineHeight: 25, color: BRAND.white, paddingTop: 2 },
  endBody: { fontFamily: FONT.body, fontSize: 16, lineHeight: 20, color: TRADE_SURFACE.inkSoft },
  actions: { alignItems: 'center', gap: SPACE.xs, minHeight: 150, justifyContent: 'flex-start' },
  actionSlot: { width: '100%', maxWidth: 320, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  confirmWell: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, alignSelf: 'stretch', backgroundColor: TRADE_SURFACE.well,
    borderRadius: RADIUS.lg, borderWidth: OUTLINE.thin, borderColor: BRAND.gold, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  confirmLine: { flex: 1, fontFamily: FONT.display, fontSize: 16, lineHeight: 20, color: BRAND.white, paddingTop: 2 },
  pickHint: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  pickHintText: { fontFamily: FONT.display, fontSize: 20, letterSpacing: 0.5, color: TRADE_SURFACE.inkGold, paddingTop: 3 },
});
