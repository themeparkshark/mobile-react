/**
 * One mystery series on the Pins page: the box, what can be inside with the
 * chance of each pin under it (shown before any open, Apple 3.1.1), the gold
 * chaser slot, the chaser meter (real progress to the guarantee), the real
 * end date, and one big Open button (free when a free box waits).
 *
 * OddsTable is exported for other screens that offer a box (Trail Boxes).
 */
import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { BRAND, FONT, GameButton, GameIcon, OUTLINE, RADIUS, SHADOW, SPACE } from '../../ui';
import { BOX_ART, boxTone, PIN_ART, PinTile } from './PinArt';
import {
  chaserMeter, endsLabel, formatChance, nextFreeBox, oneIn, seriesProgress, splitSeries, type MysterySeries, type PinRow,
} from './pinsModel';

const FREE_REASON = { first: 'First box free', weekly: 'Free this week', banked: 'Free box' } as const;

/**
 * What can be inside a box and the chance of each, in pictures + numbers.
 * Every pin in the series is listed; the chaser is last, in gold.
 */
export const OddsTable = memo(function OddsTable({ pins, size = 42, shine, compact = false }: {
  pins: readonly PinRow[]; size?: number; shine?: SharedValue<number>; compact?: boolean;
}) {
  const regular = pins.filter(p => !p.is_chaser);
  const chaser = pins.find(p => p.is_chaser);
  return (
    <View style={styles.odds} accessible accessibilityLabel={`What can be inside. ${pins.map(p => `${p.name} ${formatChance(p.chance_bp)}`).join(', ')}`}>
      <View style={styles.oddsRow}>
        {regular.map((p, i) => (
          <View key={p.item_id} style={[styles.oddsCell, { width: size + 9 }]}>
            <PinTile uri={p.icon_url} size={size} owned={p.owned} kind={p.kind} tradable={p.tradable} spares={p.spares}
              badge={false} tilt={((i * 29) % 9) - 4} shine={p.owned ? shine : undefined} lag={i * 0.1} lagSpan={0.8} />
            <Text maxFontSizeMultiplier={1.15} style={styles.pct}>{formatChance(p.chance_bp)}</Text>
          </View>
        ))}
      </View>
      {chaser && (
        <View style={[styles.chaserSlot, compact && { paddingVertical: 4 }]}>
          <PinTile uri={chaser.icon_url} size={size + 8} owned={chaser.owned} kind={chaser.kind} tradable={chaser.tradable} chaser
            badge={false} shine={chaser.owned ? shine : undefined} lag={0.7} lagSpan={0.8} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.15} style={styles.chaserLabel}>Gold chaser</Text>
            <Text maxFontSizeMultiplier={1.15} style={styles.chaserPct}>{formatChance(chaser.chance_bp)}  ·  {oneIn(chaser.chance_bp)}</Text>
          </View>
        </View>
      )}
    </View>
  );
});

/** The chaser meter: fills toward the guarantee. Real numbers only. */
function ChaserMeter({ series }: { series: MysterySeries }) {
  const fill = chaserMeter(series);
  return (
    <View style={styles.meterWrap} accessible accessibilityLabel={`Gold chaser in ${series.chaser_within} boxes or less`}>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.max(6, fill * 100)}%` }]} />
        <Image source={PIN_ART.chaser} style={styles.meterStar} contentFit="contain" />
      </View>
      <Text maxFontSizeMultiplier={1.15} style={styles.meterText}>
        Chaser in <Text style={styles.meterNum}>{series.chaser_within}</Text> {series.chaser_within === 1 ? 'box' : 'boxes'} or less
      </Text>
    </View>
  );
}

function BobbingBox({ tone, active, still, free }: { tone: 'blue' | 'coral'; active: boolean; still: boolean; free: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active || still) { cancelAnimation(t); t.value = 0; return; }
    // A slow bob, and a little "something's inside" wiggle every few seconds when a free box waits.
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
    <Animated.View style={[{ width: 116, height: 116 }, style]}>
      <Image source={BOX_ART[tone].closed} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
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
  readonly onOpen: (series: MysterySeries, count: number, pay: 'coins' | 'free') => void;
};

function MysteryCardBase({ series, coins, busy, active, still, shine, onOpen }: Props) {
  const tone = boxTone(series.theme_color);
  const free = nextFreeBox(series);
  const progress = seriesProgress(series);
  const ends = endsLabel(series.ends_at);
  const { regular } = splitSeries(series);
  const accent = series.theme_color ?? BRAND.blueBright;
  const done = progress.have === progress.total && progress.chaser;

  return (
    <View style={[styles.card, SHADOW.card]}>
      <View style={[styles.head, { backgroundColor: accent }]}>
        <BobbingBox tone={tone} active={active && series.open} still={still} free={!!free} />
        <View style={styles.headText}>
          <Text maxFontSizeMultiplier={1.15} style={styles.name} numberOfLines={1}>{series.name}</Text>
          <View style={styles.chips}>
            <View style={styles.countChip} accessible accessibilityLabel={`You have ${progress.have} of ${progress.total}`}>
              <Text maxFontSizeMultiplier={1.1} style={styles.countText}>{progress.have}/{regular.length}</Text>
              {progress.chaser && <Image source={PIN_ART.chaser} style={{ width: 18, height: 18 }} contentFit="contain" />}
            </View>
            {ends && (
              <View style={styles.endChip}>
                <Text maxFontSizeMultiplier={1.1} style={styles.endText}>{ends}</Text>
              </View>
            )}
          </View>
          {series.tagline ? <Text maxFontSizeMultiplier={1.15} style={styles.tagline} numberOfLines={1}>{series.tagline}</Text> : null}
        </View>
        {done && (
          <View style={styles.doneRibbon}><Text maxFontSizeMultiplier={1} style={styles.doneText}>ALL!</Text></View>
        )}
      </View>

      <View style={styles.body}>
        <OddsTable pins={series.pins} shine={shine} />
        {series.open && <ChaserMeter series={series} />}
        {series.open ? (
          <View style={styles.actions}>
            {free ? (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={styles.freeChip}><Text maxFontSizeMultiplier={1.1} style={styles.freeText}>{FREE_REASON[free]}</Text></View>
                <GameButton label="Open free" icon="gift" loading={busy} disabled={busy} onPress={() => onOpen(series, 1, 'free')}
                  accessibilityHint="Opens one mystery box for free" />
              </View>
            ) : (
              <GameButton label={`Open ${series.price}`} icon="coins" loading={busy} disabled={busy}
                onPress={() => onOpen(series, 1, 'coins')} accessibilityHint={`Opens one mystery box for ${series.price} coins. You have ${coins}`} />
            )}
            <Pressable disabled={busy} onPress={() => onOpen(series, series.bundle.count, 'coins')} hitSlop={6}
              style={({ pressed }) => [styles.bundle, pressed && { transform: [{ scale: 0.96 }] }, busy && { opacity: 0.5 }]}
              accessibilityRole="button" accessibilityLabel={`Open ${series.bundle.count} boxes for ${series.bundle.price} coins`}>
              <Image source={BOX_ART[tone].closed} style={{ width: 30, height: 30 }} contentFit="contain" />
              <Text maxFontSizeMultiplier={1.1} style={styles.bundleText}>x{series.bundle.count}</Text>
              <View style={styles.bundlePrice}>
                <GameIcon name="coin" size={18} />
                <Text maxFontSizeMultiplier={1.1} style={styles.bundlePriceText}>{series.bundle.price.toLocaleString('en-US')}</Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <Text maxFontSizeMultiplier={1.15} style={styles.closed}>All done. Trade for these pins on the board.</Text>
        )}
      </View>
    </View>
  );
}

export const MysteryCard = memo(MysteryCardBase);

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.cream, borderRadius: RADIUS.lg, borderWidth: OUTLINE.thick, borderColor: BRAND.navy, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.sm, borderBottomWidth: OUTLINE.thick, borderBottomColor: BRAND.navy },
  headText: { flex: 1, gap: 4 },
  name: { fontFamily: FONT.display, fontSize: 28, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0, paddingTop: 4 },
  tagline: { fontFamily: FONT.body, fontSize: 16, color: '#ffffff', opacity: 0.95 },
  chips: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.white, borderRadius: 999, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, paddingTop: 2 },
  endChip: { backgroundColor: 'rgba(5,52,110,0.35)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  endText: { fontFamily: FONT.body, fontSize: 15, color: BRAND.white },
  doneRibbon: { position: 'absolute', right: -6, top: 8, backgroundColor: BRAND.gold, borderColor: BRAND.white, borderWidth: 2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '8deg' }] },
  doneText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, paddingTop: 2 },
  body: { padding: SPACE.md, gap: SPACE.md },
  odds: { gap: SPACE.sm },
  oddsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 6 },
  oddsCell: { alignItems: 'center', gap: 2 },
  pct: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navySoft, paddingTop: 2 },
  chaserSlot: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: '#fff1c2', borderColor: BRAND.goldLip,
    borderWidth: 2, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 6,
  },
  chaserLabel: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, paddingTop: 2 },
  chaserPct: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft },
  meterWrap: { gap: 4 },
  meterTrack: { height: 16, borderRadius: 8, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy, justifyContent: 'center' },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6, backgroundColor: BRAND.gold },
  meterStar: { position: 'absolute', right: -12, width: 30, height: 30 },
  meterText: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navy, textAlign: 'center' },
  meterNum: { fontFamily: FONT.display, fontSize: 18 },
  actions: { alignItems: 'center', gap: SPACE.sm },
  freeChip: { backgroundColor: BRAND.green, borderRadius: 999, borderWidth: 2, borderColor: BRAND.white, paddingHorizontal: 10, paddingVertical: 2 },
  freeText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white, paddingTop: 2 },
  bundle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.blueBright, borderColor: BRAND.navy, borderWidth: 3,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, minHeight: 44,
  },
  bundleText: { fontFamily: FONT.display, fontSize: 19, color: BRAND.white, paddingTop: 3 },
  bundlePrice: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.cream, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  bundlePriceText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, paddingTop: 2 },
  closed: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft, textAlign: 'center' },
});
