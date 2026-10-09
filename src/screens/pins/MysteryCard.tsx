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
import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';
import CoinTopUpOffer from '../../components/money/CoinTopUpOffer';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SHADOW, SPACE } from '../../ui';
import { BOX_ART, boxTone, PIN_ART, PinTile } from './PinArt';
import {
  bundleSaving, chaserMeter, coinsShort, endsLabel, formatChance, nextFreeBox, nextFreeLabel, pointsView, seriesProgress, splitSeries,
  type MysterySeries, type PinRow,
} from './pinsModel';

const FREE_REASON = { first: 'First box free', weekly: 'Free this week', banked: 'Free box' } as const;
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
              <Text maxFontSizeMultiplier={1.15} style={styles.pct}>{formatChance(p.chance_bp)}</Text>
            </Animated.View>
          );
        })}
      </View>
      {chaser && (
        <View style={[styles.chaserSlot, compact && { paddingVertical: 4 }]}>
          <PinTile uri={chaser.icon_url} size={size + 10} owned={chaser.owned} kind={chaser.kind} tradable={chaser.tradable} chaser
            badge={false} serial={chaser.serial} shine={chaser.owned ? shine : undefined} lag={0.7} lagSpan={0.8} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.15} style={styles.chaserLabel}>Gold chaser</Text>
            <Text maxFontSizeMultiplier={1.15} style={styles.chaserPct}>
              {formatChance(chaser.chance_bp)}{pity ? `  ·  always by box ${pity}` : ''}
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
      <View style={styles.meterTrack}>
        <Animated.View style={[styles.meterFill, fillStyle]} />
      </View>
      <Image source={PIN_ART.chaser} style={styles.meterStar} contentFit="contain" />
      <Text maxFontSizeMultiplier={1.15} style={styles.meterNum}>{series.chaser_within}</Text>
    </View>
  );
}

/** Traders: spares fill toward a free pick of any missing pin. */
function TradersRow({ series, busy, onPick }: { series: MysterySeries; busy: boolean; onPick: () => void }) {
  const v = pointsView(series);
  if (v.missing === 0 && v.points === 0) return null;
  return (
    <View style={styles.tradersRow} accessible accessibilityLabel={`Traders: ${v.points} of ${v.cost}. ${v.ready ? 'Pick a pin you need' : 'Extra copies fill this up'}`}>
      <Image source={PIN_ART.trade} style={{ width: 28, height: 28 }} contentFit="contain" />
      <View style={styles.tradersTrack}>
        <View style={[styles.tradersFill, { width: `${Math.max(4, v.fill * 100)}%` }]} />
        <Text maxFontSizeMultiplier={1.1} style={styles.tradersNum}>{Math.min(v.points, v.cost)}/{v.cost}</Text>
      </View>
      <Pressable disabled={!v.ready || busy} onPress={onPick} hitSlop={6}
        style={({ pressed }) => [styles.pick, !v.ready && styles.pickOff, pressed && { transform: [{ scale: 0.96 }] }]}
        accessibilityRole="button" accessibilityState={{ disabled: !v.ready }} accessibilityLabel="Pick a pin you need">
        <Text maxFontSizeMultiplier={1.1} style={[styles.pickText, !v.ready && { color: BRAND.navySoft }]}>Pick</Text>
      </Pressable>
    </View>
  );
}

function BobbingBox({ tone, active, still, free }: { tone: 'blue' | 'coral'; active: boolean; still: boolean; free: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active || still) { cancelAnimation(t); t.value = 0; return; }
    t.value = withRepeat(withSequence(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      withDelay(free ? 200 : 900, withTiming(0, { duration: 10 })),
    ), -1, false);
    return () => cancelAnimation(t);
  }, [active, still, free, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -t.value * 6 }, { rotate: `${free ? Math.sin(t.value * Math.PI * 4) * 4 : 0}deg` }],
  }));
  return (
    <Animated.View style={[{ width: 104, height: 104 }, style]}>
      <Image source={BOX_ART[tone].closed} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

/** Open 5: a short hold fills a ring, then it opens (no accidental 1,100-coin tap). */
function HoldToOpen({ label, saving, disabled, tone, onOpen }: { label: string; saving: number; disabled: boolean; tone: 'blue' | 'coral'; onOpen: () => void }) {
  const p = useSharedValue(0);
  const fired = useRef(false);
  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const start = () => {
    if (disabled) return;
    fired.current = false;
    queueHaptic('tapLight', 1);
    p.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, done => { if (done) p.value = 1; });
    setTimeout(() => { if (p.value >= 0.98 && !fired.current) { fired.current = true; queueHaptic('hitMedium', 1); onOpen(); } }, HOLD_MS + 30);
  };
  const end = () => { if (!fired.current) { cancelAnimation(p); p.value = withTiming(0, { duration: 150 }); } };
  return (
    <Pressable onPressIn={start} onPressOut={end} disabled={disabled} hitSlop={4}
      style={[styles.openBtn, styles.openFive, disabled && { opacity: 0.5 }]}
      accessibilityRole="button" accessibilityLabel={`${label}. Hold to open five boxes`} accessibilityHint="Press and hold">
      <Animated.View style={[styles.holdFill, fillStyle]} />
      <Image source={BOX_ART[tone].closed} style={{ width: 30, height: 30 }} contentFit="contain" />
      <Text maxFontSizeMultiplier={1.1} style={styles.openFiveText}>x5</Text>
      <View style={styles.price}><GameIcon name="coin" size={16} /><Text maxFontSizeMultiplier={1.1} style={styles.priceText}>{label}</Text></View>
      {saving > 0 && <View style={styles.save}><Text maxFontSizeMultiplier={1} style={styles.saveText}>Save {saving}</Text></View>}
    </Pressable>
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
};

function MysteryCardBase({ series, coins, busy, active, still, shine, fresh, onOpen, onPick }: Props) {
  const tone = boxTone(series.theme_color);
  const free = nextFreeBox(series);
  const progress = seriesProgress(series);
  const ends = endsLabel(series.ends_at);
  const { regular } = splitSeries(series);
  const accent = series.theme_color ?? BRAND.blueBright;
  const done = progress.have === progress.total;
  const paid = series.paid_allowed !== false;
  const shortOne = coinsShort(series, 1, coins);
  const shortFive = coinsShort(series, series.bundle.count, coins);
  const [topUp, setTopUp] = useState<number | null>(null);
  const bump = useSharedValue(1);
  useEffect(() => {
    if (fresh && fresh.size > 0 && !still) bump.value = withSequence(withTiming(1.25, { duration: 140 }), withSpring(1, { damping: 8 }));
  }, [fresh, still, bump]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const nextFree = !free ? nextFreeLabel(series.free.weekly_resets_at) : null;

  const tryOpen = (count: number) => {
    const short = count === 1 ? shortOne : shortFive;
    if (short > 0) { queueHaptic('failBuzz', 1); setTopUp(short); return; }
    setTopUp(null);
    onOpen(series, count, 'coins');
  };

  return (
    <View style={[styles.card, SHADOW.card]}>
      <View style={[styles.head, { backgroundColor: accent }]}>
        <BobbingBox tone={tone} active={active && series.open} still={still} free={!!free} />
        <View style={styles.headText}>
          <Text maxFontSizeMultiplier={1.15} style={styles.name} numberOfLines={1}>{series.name}</Text>
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
        {series.open && <TradersRow series={series} busy={busy} onPick={() => onPick(series)} />}
        {series.open ? (
          <View style={{ gap: SPACE.sm }}>
            {free && (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={styles.freeChip}><Text maxFontSizeMultiplier={1.1} style={styles.freeText}>{FREE_REASON[free]}</Text></View>
                <GameButton label="Open free" icon="gift" loading={busy} disabled={busy} onPress={() => onOpen(series, 1, 'free')}
                  accessibilityHint="Opens one mystery box for free" />
              </View>
            )}
            {paid ? (
              <View style={styles.actions}>
                <Pressable disabled={busy} onPress={() => tryOpen(1)} hitSlop={4}
                  style={({ pressed }) => [styles.openBtn, styles.openOne, pressed && { transform: [{ scale: 0.96 }] }, busy && { opacity: 0.5 }]}
                  accessibilityRole="button" accessibilityLabel={shortOne > 0 ? `Need ${shortOne} more coins` : `Open one box for ${series.price} coins`}>
                  <Image source={BOX_ART[tone].closed} style={{ width: 30, height: 30 }} contentFit="contain" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.openOneText}>x1</Text>
                  <View style={styles.price}><GameIcon name="coin" size={16} /><Text maxFontSizeMultiplier={1.1} style={styles.priceText}>{series.price}</Text></View>
                </Pressable>
                <HoldToOpen label={series.bundle.price.toLocaleString('en-US')} saving={bundleSaving(series)} disabled={busy} tone={tone}
                  onOpen={() => tryOpen(series.bundle.count)} />
              </View>
            ) : (
              <Text maxFontSizeMultiplier={1.15} style={styles.closed}>Free boxes only here</Text>
            )}
            {nextFree && !free && <Text maxFontSizeMultiplier={1.15} style={styles.nextFree}>{nextFree}</Text>}
            {topUp !== null && topUp > 0 && (
              <Animated.View entering={FadeIn.duration(160)}>
                <CoinTopUpOffer need={topUp} reason="mystery-box" onDone={() => setTopUp(null)} />
              </Animated.View>
            )}
          </View>
        ) : (
          <Text maxFontSizeMultiplier={1.15} style={styles.closed}>All done. Trade for these on the board.</Text>
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
  meterNum: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, minWidth: 28, paddingTop: 3 },
  tradersRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tradersTrack: { flex: 1, height: 22, borderRadius: 11, backgroundColor: '#dbeefe', borderWidth: 2, borderColor: BRAND.navy, overflow: 'hidden', justifyContent: 'center' },
  tradersFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.blueBright },
  tradersNum: { alignSelf: 'center', fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, paddingTop: 2 },
  pick: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: 999, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center' },
  pickOff: { backgroundColor: '#eef3f9', borderColor: '#b8c9dd' },
  pickText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy, paddingTop: 3 },
  actions: { flexDirection: 'row', gap: SPACE.md, justifyContent: 'center' },
  openBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 58, borderRadius: RADIUS.md,
    borderWidth: 3, borderColor: BRAND.navy, overflow: 'hidden', shadowColor: BRAND.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 0,
  },
  openOne: { backgroundColor: BRAND.gold },
  openFive: { backgroundColor: BRAND.blueBright },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,207,59,0.55)' },
  openOneText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, paddingTop: 3 },
  openFiveText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.white, paddingTop: 3 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.cream, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.navy },
  priceText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, paddingTop: 2 },
  save: { position: 'absolute', top: -2, right: -2, backgroundColor: BRAND.red, borderBottomLeftRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: BRAND.white },
  saveText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, paddingTop: 2 },
  freeChip: { backgroundColor: BRAND.green, borderRadius: 999, borderWidth: 2, borderColor: BRAND.white, paddingHorizontal: 10, paddingVertical: 2 },
  freeText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white, paddingTop: 2 },
  nextFree: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft, textAlign: 'center', paddingTop: 2 },
  closed: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft, textAlign: 'center' },
});
