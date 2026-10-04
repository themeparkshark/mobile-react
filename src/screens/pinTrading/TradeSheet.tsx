/**
 * The trade sheet: opens when a board pin is held for you. It shows what you
 * get and what you give side by side, the hold timer, your tradeable pins,
 * and the Trade button. Expired and failed trades stay on the sheet with a
 * clear status instead of vanishing.
 *
 * Rendered inside the screen (not a native Modal), so GameDialog prompts and
 * the trade-complete moment layer above it.
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, ZoomIn, ReduceMotion, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ItemType } from '../../models/item-type';
import type { PinSwapType } from '../../models/pin-swap-type';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SharkLoader, SPACE } from '../../ui';
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
  readonly onExpire: () => void;
  readonly onRetryPins: () => void;
  readonly onMorePins: () => void;
  readonly onSlot?: (which: 'get' | 'give', rect: SlotRect) => void;
  /** The trade-complete moment has taken the two pins: hide them here and fade out. */
  readonly handedOff?: boolean;
};

const COLUMNS = 4;

export default function TradeSheet(props: TradeSheetProps) {
  const { swap, phase, deadline, totalMs, pins, pinsLoading, pinsError, selected, still, shine } = props;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetWidth = Math.min(width, 520);
  const inner = sheetWidth - SPACE.lg * 2 - OUTLINE.heavy * 2;
  const cell = Math.floor((inner - SPACE.sm * (COLUMNS - 1)) / COLUMNS);
  // Short phones (SE, 667 pt): smaller slots, one picker row (it scrolls), tighter gaps.
  const [room, setRoom] = useState(0);
  const compact = height < 740;
  const slotSize = Math.min(compact ? 68 : 112, Math.round(inner * 0.3));
  const pickerRows = compact ? 1.25 : 2;
  const ended = phase === 'expired' || phase === 'failed';
  const sending = phase === 'sending';
  const confirming = phase === 'confirming' || sending;

  // Short phones: the second step hides the picker so both choices fit ("Wait, go back" returns to it).
  const showPicker = !ended && !(compact && confirming);
  const noPins = !pinsLoading && !pinsError && pins.length === 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={e => setRoom(e.nativeEvent.layout.height)}>
      <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.Never)} exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.Never)} style={[StyleSheet.absoluteFill, styles.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={sending ? undefined : props.onClose}
          accessibilityRole="button" accessibilityLabel={COPY.notNow} />
      </Animated.View>
      <Animated.View
        entering={still ? FadeIn.duration(180).reduceMotion(ReduceMotion.Never) : SlideInDown.springify().damping(18).stiffness(180).mass(0.9)}
        exiting={still || props.handedOff ? FadeOut.duration(150).reduceMotion(ReduceMotion.Never) : SlideOutDown.duration(200).reduceMotion(ReduceMotion.Never)}
        accessibilityViewIsModal
        style={[styles.sheet, { width: sheetWidth, maxHeight: room ? room - SPACE.md : height * 0.85, paddingBottom: Math.max(insets.bottom, compact ? SPACE.sm : SPACE.lg) }, compact && { gap: SPACE.sm }]}
      >
        <View style={styles.grabber} />
        <View style={styles.topRow}>
          <StatusChipView chip={statusChip(phase)} />
          <Pressable onPress={props.onClose} disabled={sending} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <GameIcon name="close" size={36} />
          </Pressable>
        </View>

        <View style={styles.stage}>
          <TradeSlot caption={COPY.get} item={swap.pin.item} hidden={props.handedOff} measureKey={`${phase}:${selected?.id ?? 0}:${pins.length > 0}`} tilt={pinTilt(swap.id)} size={slotSize} shine={shine} still={still}
            onMeasure={rect => props.onSlot?.('get', rect)} />
          <View style={styles.swapBadge}><GameIcon name="swap" size={40} /></View>
          <TradeSlot caption={COPY.give} item={selected} hidden={props.handedOff} measureKey={`${phase}:${selected?.id ?? 0}:${pins.length > 0}`} tilt={selected ? pinTilt(selected.id, 5) : 0} size={slotSize} still={still}
            placeholder={COPY.pickPrompt} onMeasure={rect => props.onSlot?.('give', rect)} />
        </View>

        {!ended && (
          <TradeTimer deadline={deadline} totalMs={totalMs} frozen={sending} still={still} label={props.timerLabel} onExpire={props.onExpire} />
        )}

        {ended && (
          <Animated.View entering={still ? undefined : FadeIn.duration(200).reduceMotion(ReduceMotion.Never)} style={styles.endCard}>
            <GameIcon name={phase === 'expired' ? 'timer' : 'info'} size={44} />
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.endTitle}>{phase === 'expired' ? COPY.expiredTitle : COPY.failedTitle}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.endBody}>{phase === 'expired' ? COPY.expiredMessage : COPY.failedMessage}</Text>
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
                  <PickPin item={item} size={cell} selected={selected?.id === item.id} still={still} onPress={props.onSelect} />
                )}
              />
            )}
          </View>
        )}

        <View style={styles.actions}>
          {phase === 'failed' ? (
            <GameButton label={COPY.tryAgain} icon="retry" onPress={props.onTrade} />
          ) : phase === 'expired' || noPins ? (
            <GameButton label={COPY.backToBoard} onPress={props.onClose} />
          ) : (
            confirming ? (
              <Animated.View key="confirm" entering={still ? undefined : FadeIn.duration(160).reduceMotion(ReduceMotion.Never)} style={styles.actionSlot}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.confirmLine}>
                  {selected ? COPY.confirmMessage(pinName(selected), pinName(swap.pin.item)) : ''}
                </Text>
                <GameButton label={COPY.confirmLabel} icon="check" onPress={props.onTrade} loading={sending} />
              </Animated.View>
            ) : selected ? (
              <Animated.View key="trade" entering={still ? undefined : ZoomIn.springify().damping(12).stiffness(260)} style={styles.actionSlot}>
                <GameButton label={props.tradeLabel} icon="swap" onPress={props.onTrade} />
              </Animated.View>
            ) : (
              <View key="hint" style={[styles.actionSlot, styles.pickHint, compact && { minHeight: 56 }]} accessible accessibilityLabel={COPY.pickFirst}>
                <GameIcon name="arrow" size={26} style={{ transform: [{ rotate: '-90deg' }] }} />
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.pickHintText}>{COPY.pickFirst}</Text>
              </View>
            )
          )}
          {(phase === 'confirming' || phase === 'sending') && (
            // Stays (invisible) while sending, so the sheet never jumps under the player's finger.
            <View style={{ opacity: sending ? 0 : 1 }} pointerEvents={sending ? 'none' : 'auto'}>
              <GameButton variant="ghost" tone="onBlue" label={COPY.confirmBack} onPress={props.onBack} />
            </View>
          )}
          {(phase === 'picking' || phase === 'loading' || phase === 'failed') && !noPins && (
            <GameButton variant="ghost" tone="onBlue" label={phase === 'failed' ? COPY.backToBoard : COPY.notNow} onPress={props.onClose} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(8,40,96,0.55)' },
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
  actions: { alignItems: 'center', gap: SPACE.xs },
  actionSlot: { width: '100%', maxWidth: 320, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  confirmLine: { fontFamily: FONT.display, fontSize: 19, lineHeight: 24, color: BRAND.white, textAlign: 'center', paddingTop: 2 },
  pickHint: {
    flexDirection: 'row', gap: SPACE.sm, borderRadius: RADIUS.pill, borderWidth: OUTLINE.thick, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)', minHeight: 72, marginVertical: 6,
  },
  pickHintText: { fontFamily: FONT.display, fontSize: 20, letterSpacing: 0.5, color: BRAND.white, textTransform: 'uppercase', paddingTop: 3 },
});
