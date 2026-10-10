/**
 * One mystery series on the Pins page. Pictures first, few words:
 * - the box, the series name, your count and the real end date,
 * - what can be inside with the chance of each pin under it (shown before any
 *   open, Apple 3.1.1), the gold chaser ("always by box 20") and the series'
 *   Completer pin you win for finishing,
 * - the chaser meter (real progress to the guarantee),
 * - traders: spares fill a bar; 5 points pick any missing pin (dupes always count),
 * - Open 1 and Open 5 side by side (the 5 shows what it saves and needs a
 *   short hold, so a quick tap can't spend 1,100 coins by accident),
 * - short on coins: the money stream's top-up card right here, then the box opens.
 *
 * OddsTable is exported for other screens that offer a box (Trail Boxes).
 */
import { useAmbient } from '../../services/money/useAmbient';
import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';
import CoinTopUpOffer from '../../components/money/CoinTopUpOffer';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SHADOW, SPACE } from '../../ui';
import { BOX_ART, boxTone, PIN_ART, PinTile } from './PinArt';
import {
  bundleSaving, chaserMeter, coinsShort, endsLabel, formatChance, nextFreeBox, nextFreeLabel, pointsView, seriesProgress, splitSeries,
  type MysterySeries, type PinRow,
} from './pinsModel';

const FREE_REASON = { first: 'First box free', weekly: 'Free this week', banked: 'Free box' } as const;
let bankedFromLabel: string | null = null;
/** The page tells cards where the banked box came from ("Free box from VIP"). */
export function setBankedFrom(label: string | null) { bankedFromLabel = label; }
const HOLD_MS = 650;

/**
 * What can be inside a box and the chance of each, in pictures + numbers.
 * Every pin in the series is listed; the chaser is last, in gold.
 */
export const OddsTable = memo(function OddsTable({ pins, size = 42, shine, compact = false, pity, fresh }: {
  pins: readonly PinRow[]; size?: number; shine?: SharedValue<number>; compact?: boolean;
  /** The guarantee box, said next to the chaser's odds. */
  pity?: number;
  /** Pins that just arrived: they pop into their slot with a gold ring. */
  fresh?: ReadonlySet<number>;
}) {
  const regular = pins.filter(p => !p.is_chaser);
  const chaser = pins.find(p => p.is_chaser);
  return (
    <View style={styles.odds} accessible accessibilityLabel={`What can be inside. ${pins.map(p => `${p.owned ? p.name : 'a pin you need'} ${formatChance(p.chance_bp)}`).join(', ')}`}>
      <View style={styles.oddsRow}>
        {regular.map((p, i) => {
          const isFresh = !!fresh?.has(p.item_id);
          return (
            <Animated.View key={`${p.item_id}:${isFresh ? 'f' : ''}${p.owned ? 'o' : ''}`} entering={isFresh ? ZoomIn.springify().damping(9).delay(120 + i * 60) : undefined}
              style={[styles.oddsCell, { width: size + 9 }]}>
              {isFresh && <View style={[styles.freshRing, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]} />}
              <PinTile uri={p.icon_url} size={size} owned={p.owned} kind={p.kind} tradable={p.tradable} spares={p.spares}
                badge={false} tilt={((i * 29) % 9) - 4} flat shine={undefined} />
              <View style={styles.pctRow}><View style={styles.pctDot} /><Text maxFontSizeMultiplier={1.3} style={styles.pct}>{formatChance(p.chance_bp)}</Text></View>
            </Animated.View>
          );
        })}
      </View>
      {chaser && (
        <View style={[styles.chaserSlot, compact && { paddingVertical: 4 }]}>
          <PinTile uri={chaser.icon_url} size={size + 10} owned={chaser.owned} kind={chaser.kind} tradable={chaser.tradable} chaser
            badge={false} serial={chaser.serial} shine={chaser.owned ? shine : undefined} lag={0.7} lagSpan={0.8} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.3} style={styles.chaserLabel}>Gold chaser</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.chaserPct}>
              {`${formatChance(chaser.chance_bp)}${pity ? `  \u00b7  always by box ${pity}` : ''}`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

/** The chaser meter: fills toward the guarantee. Real numbers only. */
function ChaserMeter({ series, still }: { series: MysterySeries; still: boolean }) {
  const fill = useSharedValue(chaserMeter(series));
  useEffect(() => { fill.value = still ? chaserMeter(series) : withTiming(chaserMeter(series), { duration: 700, easing: Easing.out(Easing.cubic) }); }, [series.chaser_within, series.pity, still, fill]); // eslint-disable-line react-hooks/exhaustive-deps
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(6, fill.value * 100)}%` }));
  return (
    <View style={styles.meterRow} accessible accessibilityLabel={`Gold chaser in ${series.chaser_within} boxes or less`}>
      <View style={styles.meterLead}>
        <Image source={BOX_ART[boxTone(series.theme_color)].closed} style={{ width: 26, height: 26 }} contentFit="contain" />
        <Text maxFontSizeMultiplier={1.3} style={styles.meterNum}>{series.chaser_within}</Text>
      </View>
      <View style={styles.meterTrack}>
        <Animated.View style={[styles.meterFill, fillStyle]} />
      </View>
      <Image source={PIN_ART.chaser} style={styles.meterStar} contentFit="contain" />
    </View>
  );
}

/** Traders: extra copies fill coin slots; when they're full, Pick any pin you still need. */
function TradersRow({ series, busy, onPick, still }: { series: MysterySeries; busy: boolean; onPick: () => void; still: boolean }) {
  const v = pointsView(series);
  const ready = v.missing === 0 ? v.points >= v.cost : v.ready;
  const pop = useSharedValue(1);
  useEffect(() => {
    if (ready && !still) pop.value = withSequence(withTiming(1.15, { duration: 120 }), withSpring(1, { damping: 6 }));
  }, [ready, still, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  // Series complete: the same 5 extras become a free box instead of a pick.
  const boxMode = v.missing === 0;
  if (boxMode && v.points === 0) return null;
  const filled = Math.min(v.points, v.cost);
  return (
    <View style={styles.tradersRow} accessible accessibilityLabel={`Extras: ${filled} of ${v.cost}. ${v.ready ? 'Pick a pin you need' : 'Extra copies fill these'}`}>
      <Image source={PIN_ART.trade} style={{ width: 28, height: 28 }} contentFit="contain" />
      <View style={styles.slots}>
        {Array.from({ length: v.cost }, (_, i) => (
          <Animated.View key={`${i}:${i < filled ? 1 : 0}`} entering={i < filled && !still ? ZoomIn.springify().damping(9) : undefined}
            style={[styles.slot, i < filled && styles.slotOn]} />
        ))}
      </View>
      <Animated.View style={popStyle}>
        <Pressable disabled={!ready || busy} onPress={onPick} hitSlop={6}
          style={({ pressed }) => [styles.pick, !ready && styles.pickOff, pressed && { transform: [{ scale: 0.96 }] }]}
          accessibilityRole="button" accessibilityState={{ disabled: !ready }} accessibilityLabel={boxMode ? 'Turn 5 extras into a free box' : 'Pick a pin you need'}>
          {boxMode ? <Image source={BOX_ART.blue.closed} style={{ width: 28, height: 28, opacity: ready ? 1 : 0.4 }} contentFit="contain" />
            : <Text maxFontSizeMultiplier={1.1} style={[styles.pickText, !ready && { color: '#9fb3cb' }]}>Pick</Text>}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function BobbingBox({ tone, active, still, free }: { tone: 'blue' | 'coral'; active: boolean; still: boolean; free: boolean }) {
  const t = useSharedValue(0);
  const ambient = useAmbient();
  useEffect(() => {
    if (!active || still || !ambient) { cancelAnimation(t); t.value = 0; return; }
    t.value = withRepeat(withSequence(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      withDelay(free ? 200 : 900, withTiming(0, { duration: 10 })),
    ), -1, false);
    return () => cancelAnimation(t);
  }, [ambient, active, still, free, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -t.value * 6 }, { rotate: `${free ? Math.sin(t.value * Math.PI * 4) * 4 : 0}deg` }],
  }));
  return (
    <Animated.View style={[{ width: 104, height: 104 }, style]}>
      <Image source={BOX_ART[tone].closed} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

/**
 * Open 5: a short hold (a gold bar fills along the bottom with rising ticks),
 * then it opens. A quick tap wiggles it and says "Hold!", so nobody thinks it's
 * broken, and VoiceOver/Switch users get a plain activate action.
 */
function HoldToOpen({ label, saving, disabled, tone, onOpen }: { label: string; saving: number; disabled: boolean; tone: 'blue' | 'coral'; onOpen: () => void }) {
  const p = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const fired = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [hint, setHint] = useState(false);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const wiggleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value}deg` }] }));
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const start = () => {
    if (disabled) return;
    fired.current = false;
    setHint(false);
    clear();
    queueHaptic('tapLight', 1);
    p.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
    [0.25, 0.5, 0.75].forEach((f, k) => timers.current.push(setTimeout(() => {
      try { GameAudio.play('fx.coinTick', { pitch: 1 + k * 0.15, volume: 0.6 }); } catch { /* audio is decoration */ }
      queueHaptic('tickSelection', 1);
    }, HOLD_MS * f)));
    timers.current.push(setTimeout(() => {
      if (p.value >= 0.98 && !fired.current) { fired.current = true; queueHaptic('hitMedium', 1); onOpen(); p.value = withTiming(0, { duration: 250 }); }
    }, HOLD_MS + 30));
  };
  const end = () => {
    if (fired.current) return;
    clear();
    const quick = p.value < 0.5;
    cancelAnimation(p); p.value = withTiming(0, { duration: 150 });
    if (quick && !disabled) {
      wiggle.value = withSequence(withTiming(-4, { duration: 50 }), withTiming(4, { duration: 60 }), withTiming(-3, { duration: 60 }), withTiming(0, { duration: 50 }));
      setHint(true);
      timers.current.push(setTimeout(() => setHint(false), 1400));
    }
  };
  return (
    <Animated.View style={[{ flex: 1 }, wiggleStyle]}>
      {hint && (
        <Animated.View entering={FadeIn.duration(120)} style={styles.holdHint} pointerEvents="none">
          <Text maxFontSizeMultiplier={1.35} style={styles.holdHintText}>Hold!</Text>
        </Animated.View>
      )}
      <Pressable onPressIn={start} onPressOut={end} disabled={disabled} hitSlop={4}
        style={[styles.openBtn, styles.openFive, disabled && { opacity: 0.5 }]}
        accessibilityRole="button" accessibilityLabel={`${label}. Hold to open five boxes`} accessibilityHint="Press and hold"
        accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'activate' && !disabled) onOpen(); }}>
        <Animated.View style={[styles.holdFill, fillStyle]} />
        <Image source={BOX_ART[tone].closed} style={{ width: 30, height: 30 }} contentFit="contain" />
        <Text maxFontSizeMultiplier={1.1} style={styles.openFiveText}>x5</Text>
        <View style={styles.price}><GameIcon name="coin" size={16} /><Text maxFontSizeMultiplier={1.1} style={styles.priceText}>{label}</Text></View>
        {saving > 0 && <View style={styles.save}><Text maxFontSizeMultiplier={1} style={styles.saveText}>Save {saving}</Text></View>}
      </Pressable>
    </Animated.View>
  );
}

type Props = {
  readonly series: MysterySeries;
  readonly coins: number;
  readonly busy: boolean;
  readonly active: boolean;
  readonly still: boolean;
  readonly shine?: SharedValue<number>;
  readonly fresh?: ReadonlySet<number>;
  readonly onOpen: (series: MysterySeries, count: number, pay: 'coins' | 'free') => void;
  readonly onPick: (series: MysterySeries) => void;
  /** The server said coins were short (a stale balance): show the top-up right here. */
  readonly serverShort?: number | null;
  /** The live or upcoming series the meter moves to when this one ends. */
  readonly nextSeriesName?: string | null;
};

function MysteryCardBase({ series, coins, busy, active, still, shine, fresh, onOpen, onPick, serverShort, nextSeriesName }: Props) {
  const tone = boxTone(series.theme_color);
  const free = nextFreeBox(series);
  const progress = seriesProgress(series);
  // Every pin and the chaser owned: boxes only give extras now, so they step back (no bundle push).
  const allDone = progress.have >= progress.total && progress.chaser;
  const ends = endsLabel(series.ends_at);
  const { regular } = splitSeries(series);
  const accent = series.theme_color ?? BRAND.blueBright;
  const done = progress.have === progress.total;
  const paid = series.paid_allowed !== false;
  const shortOne = coinsShort(series, 1, coins);
  const shortFive = coinsShort(series, series.bundle.count, coins);
  const [topUp, setTopUp] = useState<number | null>(null);
  useEffect(() => { if (serverShort && serverShort > 0) setTopUp(serverShort); }, [serverShort]);
  const bump = useSharedValue(1);
  const callBack = useSharedValue(1);
  const callBackStyle = useAnimatedStyle(() => ({ transform: [{ scale: callBack.value }] }));
  useEffect(() => {
    if (fresh && fresh.size > 0 && !still) bump.value = withSequence(withTiming(1.25, { duration: 140 }), withSpring(1, { damping: 8 }));
  }, [fresh, still, bump]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const nextFree = !free ? nextFreeLabel(series.free.weekly_resets_at) : null;
  // Honest heads-up in the last 2 weeks: chaser progress belongs to this series.
  const meterEnds = (() => {
    if (!series.ends_at || series.chaser_within >= series.pity) return null;
    const end = new Date(series.ends_at);
    const days = (end.getTime() - Date.now()) / 86400000;
    if (days > 14 || days < 0) return null;
    return nextSeriesName ? `Your chaser meter moves to ${nextSeriesName}` : 'Your chaser meter waits for the next series';
  })();

  const tryOpen = (count: number) => {
    const short = count === 1 ? shortOne : shortFive;
    if (short > 0) { queueHaptic('tapLight', 1); setTopUp(short); return; }
    setTopUp(null);
    onOpen(series, count, 'coins');
  };

  return (
    <View style={[styles.card, SHADOW.card]}>
      <View style={[styles.head, { backgroundColor: accent }]}>
        <BobbingBox tone={tone} active={active && series.open} still={still} free={!!free} />
        <View style={styles.headText}>
          <Text maxFontSizeMultiplier={1.3} style={styles.name} numberOfLines={1}>{series.name}</Text>
          <View style={styles.chips}>
            <Animated.View style={[styles.countChip, bumpStyle]} accessible accessibilityLabel={`You have ${progress.have} of ${progress.total}`}>
              <Text maxFontSizeMultiplier={1.1} style={styles.countText}>{progress.have}/{regular.length}</Text>
              {progress.chaser && <Image source={PIN_ART.chaser} style={{ width: 18, height: 18 }} contentFit="contain" />}
            </Animated.View>
            {ends && <View style={styles.endChip}><Text maxFontSizeMultiplier={1.1} style={styles.endText}>{ends}</Text></View>}
          </View>
        </View>
        {series.completer && (
          <View style={styles.prize} accessible accessibilityLabel={done ? 'Series finished. Completer pin won' : 'Finish the series to win its Completer pin'}>
            <PinTile uri={series.completer.icon_url} size={50} owned={series.completer.owned} kind="park" tradable={false} badge={false} flat />
            {!series.completer.owned && <View style={styles.prizeLock}><GameIcon name="trophy" size={18} /></View>}
          </View>
        )}
      </View>

      <View style={styles.body}>
        <OddsTable pins={series.pins} shine={shine} pity={series.pity} fresh={fresh} />
        {series.open && <ChaserMeter series={series} still={still} />}
        {series.open && meterEnds && <Text maxFontSizeMultiplier={1.3} style={styles.meterEnds}>{meterEnds}</Text>}
        {series.open && <TradersRow series={series} busy={busy} still={still} onPick={() => onPick(series)} />}
        {series.open ? (
          <View style={{ gap: SPACE.sm }}>
            {free && (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={styles.freeChip}><Text maxFontSizeMultiplier={1.1} style={styles.freeText}>{free === 'banked' && bankedFromLabel ? bankedFromLabel : FREE_REASON[free]}</Text></View>
                <GameButton label="Open free" icon="gift" loading={busy} disabled={busy} onPress={() => onOpen(series, 1, 'free')}
                  accessibilityHint="Opens one mystery box for free" />
              </View>
            )}
            {paid ? (
              <View style={styles.actions}>
                <Animated.View style={[{ flex: 1 }, callBackStyle]}>
                <Pressable disabled={busy} onPress={() => tryOpen(1)} hitSlop={4}
                  style={({ pressed }) => [styles.openBtn, styles.openOne, pressed && { transform: [{ scale: 0.96 }] }, busy && { opacity: 0.5 }]}
                  accessibilityRole="button" accessibilityLabel={shortOne > 0 ? `Need ${shortOne} more coins` : `Open one box for ${series.price} coins`}>
                  <Image source={BOX_ART[tone].closed} style={{ width: 30, height: 30 }} contentFit="contain" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.openOneText}>{allDone ? 'Extras for trading' : 'x1'}</Text>
                  <View style={[styles.price, shortOne > 0 && styles.priceShort]}><GameIcon name="coin" size={16} /><Text maxFontSizeMultiplier={1.1} style={styles.priceText}>{shortOne > 0 ? `${shortOne} more` : series.price}</Text></View>
                </Pressable>
                </Animated.View>
                {allDone ? null : shortFive > 0 ? (
                  // Short for the bundle: a plain tap shows the top-up (nothing to hold, nothing spent).
                  <Pressable onPress={() => tryOpen(series.bundle.count)} disabled={busy} hitSlop={4}
                    style={({ pressed }) => [styles.openBtn, styles.openFive, pressed && { transform: [{ scale: 0.96 }] }]}
                    accessibilityRole="button" accessibilityLabel={`Need ${shortFive} more coins for five boxes`}>
                    <Image source={BOX_ART[tone].closed} style={{ width: 30, height: 30 }} contentFit="contain" />
                    <Text maxFontSizeMultiplier={1.1} style={styles.openFiveText}>x5</Text>
                    <View style={[styles.price, styles.priceShort]}><GameIcon name="coin" size={16} /><Text maxFontSizeMultiplier={1.1} style={styles.priceText}>{shortFive.toLocaleString('en-US')} more</Text></View>
                  </Pressable>
                ) : (
                  <HoldToOpen label={series.bundle.price.toLocaleString('en-US')} saving={bundleSaving(series)} disabled={busy} tone={tone}
                    onOpen={() => tryOpen(series.bundle.count)} />
                )}
              </View>
            ) : (
              <Text maxFontSizeMultiplier={1.3} style={styles.closed}>Free boxes only here</Text>
            )}
            {/* The bundle floor holds only while a regular pin is missing (same rule as the server). */}
            {paid && <Text maxFontSizeMultiplier={1.3} style={styles.floorNote}>{progress.have < progress.total ? 'x5 = at least 1 new pin' : allDone ? 'You have every pin and the gold! Boxes now give extras to trade.' : 'You have them all: boxes give extras'}</Text>}
            {nextFree && !free && <Text maxFontSizeMultiplier={1.3} style={styles.nextFree}>{nextFree}</Text>}
            {topUp !== null && topUp > 0 && (
              <Animated.View entering={FadeIn.duration(160)}>
                <CoinTopUpOffer need={topUp} reason="mystery-box" onDone={() => {
                  // Coins landed: the offer folds and the Open button calls you back (never auto-spends).
                  setTopUp(null);
                  if (!still) callBack.value = withSequence(withTiming(1.08, { duration: 140 }), withSpring(1, { damping: 5 }), withTiming(1.06, { duration: 140 }), withSpring(1, { damping: 6 }));
                }} />
              </Animated.View>
            )}
          </View>
        ) : (
          <Text maxFontSizeMultiplier={1.3} style={styles.closed}>All done. Trade for these on the board.</Text>
        )}
      </View>
    </View>
  );
}

export const MysteryCard = memo(MysteryCardBase);

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.cream, borderRadius: RADIUS.lg, borderWidth: OUTLINE.thick, borderColor: BRAND.navy, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.sm, borderBottomWidth: OUTLINE.thick, borderBottomColor: BRAND.navy },
  headText: { flex: 1, gap: 6 },
  name: { fontFamily: FONT.display, fontSize: 28, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0, paddingTop: 4 },
  chips: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.white, borderRadius: 999, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, paddingTop: 2 },
  endChip: { backgroundColor: 'rgba(5,52,110,0.35)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  endText: { fontFamily: FONT.body, fontSize: 15, color: BRAND.white },
  prize: { alignItems: 'center', justifyContent: 'center' },
  prizeLock: { position: 'absolute', bottom: -4, right: -4 },
  body: { padding: SPACE.md, gap: SPACE.md },
  odds: { gap: SPACE.sm },
  oddsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 6 },
  oddsCell: { alignItems: 'center', gap: 2 },
  freshRing: { position: 'absolute', top: -4, borderWidth: 3, borderColor: BRAND.gold, backgroundColor: 'rgba(255,207,59,0.25)' },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pctDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND.skyDeep, borderWidth: 1, borderColor: BRAND.navy },
  pct: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navySoft, paddingTop: 2 },
  chaserSlot: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: '#fff1c2', borderColor: BRAND.goldLip,
    borderWidth: 2, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 6,
  },
  chaserLabel: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, paddingTop: 2 },
  chaserPct: { fontFamily: FONT.body, fontSize: 16, color: BRAND.navySoft },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meterTrack: { flex: 1, height: 18, borderRadius: 9, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy, overflow: 'hidden' },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.gold },
  meterStar: { width: 30, height: 30 },
  meterLead: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff1c2', borderRadius: 999, borderWidth: 2, borderColor: BRAND.goldLip, paddingHorizontal: 6, paddingVertical: 1 },
  meterNum: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, minWidth: 22, textAlign: 'center', paddingTop: 3 },
  tradersRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slots: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  slot: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: '#9fb3cb', borderStyle: 'dashed', backgroundColor: '#eef6ff' },
  slotOn: { borderStyle: 'solid', borderColor: BRAND.navy, backgroundColor: BRAND.blueBright },
  tradersTrack: { flex: 1, height: 22, borderRadius: 11, backgroundColor: '#dbeefe', borderWidth: 2, borderColor: BRAND.navy, overflow: 'hidden', justifyContent: 'center' },
  tradersFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.blueBright },
  tradersNum: { alignSelf: 'center', fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, paddingTop: 2 },
  pick: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: 999, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center' },
  pickOff: { backgroundColor: 'transparent', borderColor: '#c9d6e6', borderStyle: 'dashed' },
  pickText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy, paddingTop: 3 },
  actions: { flexDirection: 'row', gap: SPACE.md, justifyContent: 'center' },
  openBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 58, borderRadius: RADIUS.md,
    borderWidth: 3, borderColor: BRAND.navy, overflow: 'hidden', shadowColor: BRAND.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 0,
  },
  openOne: { backgroundColor: BRAND.gold },
  openFive: { backgroundColor: BRAND.blueBright },
  holdFill: { position: 'absolute', left: 0, bottom: 0, height: 7, backgroundColor: BRAND.gold },
  holdHint: { position: 'absolute', top: -34, alignSelf: 'center', zIndex: 2, backgroundColor: BRAND.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 3 },
  holdHintText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white, paddingTop: 3 },
  openOneText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, paddingTop: 3 },
  openFiveText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.white, paddingTop: 3 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.cream, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.navy },
  priceText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, paddingTop: 2 },
  save: { position: 'absolute', top: -2, right: -2, backgroundColor: BRAND.gold, borderBottomLeftRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: BRAND.white },
  saveText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.navy, paddingTop: 2 },
  freeChip: { backgroundColor: BRAND.green, borderRadius: 999, borderWidth: 2, borderColor: BRAND.white, paddingHorizontal: 10, paddingVertical: 2 },
  freeText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white, paddingTop: 2 },
  nextFree: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft, textAlign: 'center', paddingTop: 2 },
  priceShort: { backgroundColor: BRAND.sky, borderColor: BRAND.navy },
  meterEnds: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, textAlign: 'center', marginTop: -6, paddingTop: 2 },
  floorNote: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, textAlign: 'center', paddingTop: 2 },
  closed: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft, textAlign: 'center' },
});
