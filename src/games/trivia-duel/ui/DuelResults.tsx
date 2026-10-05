/**
 * Duel results on stage (design 11.9, rev 7). The crown lands on your avatar
 * up on the stage; this half-height cream card slides up over the bottom 45%
 * while the stage keeps acting above it. Big result line, the score drums,
 * FIN BEATEN / RANK UP / NEW BEST banners or the near-miss line with the gap
 * bar, four 18pt stat rows, the Fin rank bar, the Best Moment polaroid that
 * drops in for 1.5s then tucks into the corner, one Fact Card row with Read
 * on TPS, and REMATCH (pulses on the beat) / PASS TO CREW / CONTINUE.
 */
import { openExternal } from '../../../services/external';
import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { ART, C } from '../art';
import type { FactCard } from '../store';
import { OutlinedText } from './Overlays';
import Svg, { Path as SvgPath } from 'react-native-svg';

export interface ResultsModel {
  won: boolean;
  tie: boolean;
  myScore: number;
  oppScore: number;
  oppName: string;
  banners: string[];
  nearMiss: string;
  rows: { label: string; value: string }[];
  facts: (FactCard & { isNew: boolean })[];
  stars: number;
  practice: boolean;
  /** Fin rank bar: label and progress toward the next rank (0..1), or null vs a ghost. */
  rank?: { label: string; progress: number; next: string | null } | null;
  /** Best Moment: the fastest correct lock. */
  best?: { label: string } | null;
  /** Ride challenge: the coin line instead of the duel title. */
  ride?: { won: boolean } | null;
}

interface Props {
  model: ResultsModel;
  beatMs: number;
  onRematch?: () => void;
  onGhost?: () => void;
  onContinue: () => void;
  reducedMotion: boolean;
  /** Height of the card (the bottom 45% of the screen). */
  height: number;
}

export function DuelResults({ model, beatMs, onRematch, onGhost, onContinue, reducedMotion, height }: Props) {
  const cardY = useSharedValue(reducedMotion ? 0 : height + 40);
  const cardO = useSharedValue(reducedMotion ? 0 : 1);
  const pulse = useSharedValue(1);
  const gap = useSharedValue(0);
  const polY = useSharedValue(-300);
  const polS = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) cardO.value = withTiming(1, { duration: 300 });
    else cardY.value = withDelay(beatMs, withSpring(0, { damping: 14, stiffness: 180 }));
    if (!model.won && !reducedMotion) {
      gap.value = withRepeat(withSequence(withTiming(1, { duration: beatMs }), withTiming(0, { duration: beatMs })), -1);
    }
    if (!reducedMotion && onRematch) pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: beatMs * 0.25 }), withTiming(1, { duration: beatMs * 0.75 })), -1);
    if (model.best && !reducedMotion) {
      polY.value = withDelay(beatMs * 2, withSequence(
        withSpring(0, { damping: 10, stiffness: 220 }),
        withDelay(1500, withTiming(-112, { duration: 320, easing: Easing.inOut(Easing.cubic) })),
      ));
      polS.value = withDelay(beatMs * 2 + 1500, withTiming(0.42, { duration: 320 }));
    } else {
      polY.value = -112;
      polS.value = 0.42;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({ opacity: cardO.value, transform: [{ translateY: cardY.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const gapStyle = useAnimatedStyle(() => ({ backgroundColor: gap.value > 0.5 ? C.gold : C.coral }));
  // Drops in centre for 1.5s, then tucks into the card's top-right corner (clear of the banners).
  const polStyle = useAnimatedStyle(() => ({ transform: [{ translateY: polY.value }, { translateX: ((1 - polS.value) / 0.58) * 128 }, { scale: polS.value }, { rotate: '-6deg' }] }));

  const total = Math.max(1, model.myScore + model.oppScore);
  const fact = model.facts[0];
  const title = model.ride ? (model.ride.won ? 'RIDE COIN!' : 'GOOD TRY!')
    : model.practice ? (model.won ? 'PRACTICE WIN!' : 'GOOD PRACTICE!') : model.won ? 'YOU WIN!' : model.tie ? 'DEAD EVEN!' : 'GOOD GAME!';
  return (
    <View style={[styles.root, { height }]} pointerEvents="box-none">
      <Animated.View style={[styles.card, { minHeight: model.ride ? undefined : height - 8 }, cardStyle]}>
        <View style={styles.head}>
          <OutlinedText text={title} size={30} color={model.won ? C.gold : '#ffffff'} width={2.5} />
          <View style={styles.scoreRow}>
            <Text style={styles.scoreMe}>{model.myScore}</Text>
            <Text style={styles.scoreVs}>vs</Text>
            <Text style={styles.scoreOpp}>{model.oppScore}</Text>
          </View>
        </View>
        {model.ride ? (
          <View style={styles.starRow}>
            {[1, 2, 3].map((k) => <StarPip key={k} on={k <= model.stars} i={k} reducedMotion={reducedMotion} />)}
          </View>
        ) : null}
        {!model.ride && !model.won && model.oppScore > model.myScore ? (
          <View style={styles.gapTrack}>
            <View style={[styles.gapMe, { flex: model.myScore / total }]} />
            <Animated.View style={[styles.gapSeg, { flex: (model.oppScore - model.myScore) / total }, gapStyle]} />
            <View style={{ flex: model.myScore / total }} />
          </View>
        ) : null}
        {model.banners.length ? (
          <View style={styles.banners}>
            {model.banners.map((b, i) => <Banner key={b} text={b} i={i} reducedMotion={reducedMotion} />)}
          </View>
        ) : null}
        {(model.ride ? !model.ride.won : !model.won) && model.nearMiss ? <Text style={styles.near}>{model.nearMiss}</Text> : null}
        <View style={styles.rows}>
          {model.rows.map((r) => (
            <View key={r.label} style={styles.rowItem}>
              <Text style={styles.rowVal}>{r.value}</Text>
              <Text style={styles.rowLabel}>{r.label}</Text>
            </View>
          ))}
        </View>
        {model.rank ? (
          <View style={styles.rankRow}>
            <Text style={styles.rankLabel}>{model.rank.label}</Text>
            <View style={styles.rankTrack}><View style={[styles.rankFill, { width: `${Math.round(model.rank.progress * 100)}%` }]} /></View>
            <Text style={styles.rankNext}>{model.rank.next ?? 'TOP'}</Text>
          </View>
        ) : null}
        {fact ? <FactRow card={fact} /> : null}
        <View style={styles.buttons}>
          {onRematch ? (
            <Animated.View style={pulseStyle}>
              <Pressable style={[styles.btn, styles.primary]} onPress={onRematch} accessibilityRole="button">
                <Text style={styles.primaryText}>REMATCH</Text>
              </Pressable>
            </Animated.View>
          ) : null}
          <View style={styles.btnRow}>
            {onGhost ? (
              <Pressable style={[styles.btn, styles.secondary, styles.half]} onPress={onGhost} accessibilityRole="button">
                <Text style={styles.secondaryText}>PASS TO CREW</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.btn, styles.secondary, onGhost ? styles.half : styles.full]} onPress={onContinue} accessibilityRole="button">
              <Text style={styles.secondaryText}>CONTINUE</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
      {model.best ? (
        <Animated.View style={[styles.polaroid, polStyle]} pointerEvents="none">
          <Image source={ART.polaroid} style={styles.polImg} resizeMode="contain" />
          <View style={styles.polCaption}>
            <Text style={styles.polTitle}>BEST MOMENT</Text>
            <Text style={styles.polText}>{model.best.label}</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function StarPip({ on, i, reducedMotion }: { on: boolean; i: number; reducedMotion: boolean }) {
  const s = useSharedValue(reducedMotion || !on ? 1 : 0);
  useEffect(() => {
    if (!on || reducedMotion) return;
    s.value = withDelay(500 + i * 220, withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 300 })));
  }, [on, i, s, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={st}>
      <Svg width={38} height={38}>
        <SvgPath d={STAR_D} fill={on ? C.gold : '#ffffff'} stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

const STAR_D = (() => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 8 : 17;
    d += `${i ? 'L' : 'M'} ${(19 + Math.cos(a) * r).toFixed(1)} ${(20 + Math.sin(a) * r).toFixed(1)} `;
  }
  return `${d}Z`;
})();

function Banner({ text, i, reducedMotion }: { text: string; i: number; reducedMotion: boolean }) {
  const sx = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    sx.value = withDelay(700 + i * 180, withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 300 })));
  }, [sx, i, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: sx.value }, { scaleY: 2 - Math.max(0.6, Math.min(1.25, sx.value)) }] }));
  return (
    <Animated.View style={[styles.banner, st]}>
      <Text style={styles.bannerText}>{text}</Text>
    </Animated.View>
  );
}

/** One Fact Card row (15pt) with Read on TPS (in-app browser, UTM tagged). */
function FactRow({ card }: { card: FactCard & { isNew: boolean } }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factText} numberOfLines={2}>{card.fact}</Text>
      {card.tpsArticleUrl ? (
        <Pressable
          onPress={() => { void openExternal(`${card.tpsArticleUrl}${card.tpsArticleUrl!.includes('?') ? '&' : '?'}utm_source=app&utm_medium=trivia`); }}
          style={styles.readBtn}
          accessibilityRole="link"
          hitSlop={8}
        >
          <Text style={styles.readText}>Read on TPS</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', paddingHorizontal: 10, paddingBottom: 10 },
  card: { backgroundColor: C.cream, borderRadius: 24, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 7, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  scoreMe: { fontFamily: 'Shark', fontSize: 30, color: C.navy },
  scoreVs: { fontFamily: 'Knockout', fontSize: 15, color: C.navy, opacity: 0.6, marginHorizontal: 8 },
  scoreOpp: { fontFamily: 'Shark', fontSize: 24, color: C.navy, opacity: 0.6 },
  gapTrack: { flexDirection: 'row', height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: C.ink, overflow: 'hidden', backgroundColor: '#ffffff', marginTop: 6 },
  gapMe: { backgroundColor: C.gold },
  gapSeg: { backgroundColor: C.coral },
  banners: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  banner: { backgroundColor: C.gold, borderWidth: 2.5, borderColor: C.ink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, margin: 3 },
  bannerText: { fontFamily: 'Shark', fontSize: 18, color: C.navy },
  near: { fontFamily: 'Knockout', fontSize: 18, color: C.navy, textAlign: 'center', marginTop: 6 },
  rows: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  starRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  rowItem: { alignItems: 'center', minWidth: 70 },
  rowVal: { fontFamily: 'Shark', fontSize: 22, color: C.navy },
  rowLabel: { fontFamily: 'Knockout', fontSize: 13, color: C.navy, opacity: 0.6 },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rankLabel: { fontFamily: 'Knockout', fontSize: 15, color: C.navy, width: 110 },
  rankTrack: { flex: 1, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: C.ink, backgroundColor: '#ffffff', overflow: 'hidden' },
  rankFill: { height: '100%', backgroundColor: C.blue },
  rankNext: { fontFamily: 'Knockout', fontSize: 13, color: C.navy, opacity: 0.6, marginLeft: 8, width: 82, textAlign: 'right' },
  fact: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2.5, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 6 },
  factText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.navy },
  readBtn: { marginLeft: 8, backgroundColor: C.blue, borderRadius: 8, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 8, paddingVertical: 3 },
  readText: { fontFamily: 'Knockout', fontSize: 13, color: '#ffffff' },
  buttons: { marginTop: 4 },
  btn: { height: 56, borderRadius: 16, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 6, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primary: { backgroundColor: C.gold },
  primaryText: { fontFamily: 'Shark', fontSize: 24, color: C.navy },
  secondary: { backgroundColor: '#ffffff' },
  secondaryText: { fontFamily: 'Shark', fontSize: 17, color: C.navy },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48.5%' },
  full: { width: '100%' },
  polaroid: { position: 'absolute', alignSelf: 'center', top: 0, alignItems: 'center' },
  polImg: { width: 200, height: 152 },
  polCaption: { position: 'absolute', bottom: 18, alignItems: 'center' },
  polTitle: { fontFamily: 'Shark', fontSize: 14, color: C.navy },
  polText: { fontFamily: 'Knockout', fontSize: 16, color: C.navy },
});
