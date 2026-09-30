/**
 * Duel results (design 11.9): the crown drop on a win (Clash 3-beat
 * anticipation), FIN BEATEN / RANK UP / NEW BEST banners, or the near-miss
 * line and gap bar on a loss. Rows, the Fact Cards stack with Read on TPS,
 * and REMATCH (pulses on the beat) / RACE MY RUN / CONTINUE.
 */
import React, { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { ART, C } from '../art';
import type { FactCard } from '../store';
import { OutlinedText } from './Overlays';

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
}

interface Props {
  model: ResultsModel;
  beatMs: number;
  onRematch?: () => void;
  onGhost?: () => void;
  onContinue: () => void;
  reducedMotion: boolean;
}

export function DuelResults({ model, beatMs, onRematch, onGhost, onContinue, reducedMotion }: Props) {
  const crownY = useSharedValue(-260);
  const crownR = useSharedValue(0);
  const cardS = useSharedValue(0.85);
  const cardO = useSharedValue(0);
  const pulse = useSharedValue(1);
  const gap = useSharedValue(0);

  useEffect(() => {
    cardO.value = withTiming(1, { duration: 200 });
    cardS.value = reducedMotion ? 1 : withSpring(1, { damping: 12, stiffness: 220 });
    if (model.won && !reducedMotion) {
      const b = beatMs;
      crownR.value = withDelay(200, withSequence(
        withTiming(-6, { duration: b / 4 }), withTiming(6, { duration: b / 4 }),
        withTiming(-12, { duration: b / 4 }), withTiming(12, { duration: b / 4 }),
        withTiming(0, { duration: b / 2 }),
      ));
      crownY.value = withDelay(200 + b * 1.5, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }));
    } else crownY.value = 0;
    if (!model.won && !reducedMotion) {
      gap.value = withRepeat(withSequence(withTiming(1, { duration: beatMs }), withTiming(0, { duration: beatMs })), -1);
    }
    if (!reducedMotion && onRematch) pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: beatMs * 0.25 }), withTiming(1, { duration: beatMs * 0.75 })), -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crownStyle = useAnimatedStyle(() => ({ transform: [{ translateY: crownY.value }, { rotate: `${crownR.value}deg` }] }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardO.value, transform: [{ scale: cardS.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const gapStyle = useAnimatedStyle(() => ({ backgroundColor: gap.value > 0.5 ? C.gold : C.coral }));

  const total = Math.max(1, model.myScore + model.oppScore);
  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.card, cardStyle]}>
        {model.won ? (
          <Animated.View style={[styles.crownWrap, crownStyle]}>
            <Image source={ART.crown} style={styles.crown} />
          </Animated.View>
        ) : null}
        <OutlinedText
          text={model.practice ? (model.won ? 'PRACTICE WIN!' : 'PRACTICE DONE') : model.won ? 'YOU WIN!' : model.tie ? 'DEAD EVEN!' : 'SO CLOSE!'}
          size={36}
          color={model.won ? C.gold : '#ffffff'}
          width={3}
          style={{ alignSelf: 'center' }}
        />
        <View style={styles.scoreRow}>
          <Text style={styles.scoreMe}>{model.myScore}</Text>
          <Text style={styles.scoreVs}>vs</Text>
          <Text style={styles.scoreOpp}>{model.oppScore}</Text>
        </View>
        <View style={styles.gapTrack}>
          <View style={[styles.gapMe, { flex: model.myScore / total }]} />
          {!model.won && model.oppScore > model.myScore ? (
            <Animated.View style={[styles.gapSeg, { flex: (model.oppScore - model.myScore) / total }, gapStyle]} />
          ) : null}
          <View style={[styles.gapOpp, { flex: Math.min(model.myScore, model.oppScore) / total }]} />
        </View>
        {model.banners.length ? (
          <View style={styles.banners}>
            {model.banners.map((b, i) => <Banner key={b} text={b} i={i} reducedMotion={reducedMotion} />)}
          </View>
        ) : null}
        {!model.won && model.nearMiss ? <Text style={styles.near}>{model.nearMiss}</Text> : null}
        <View style={styles.rows}>
          {model.rows.map((r) => (
            <View key={r.label} style={styles.rowItem}>
              <Text style={styles.rowVal}>{r.value}</Text>
              <Text style={styles.rowLabel}>{r.label}</Text>
            </View>
          ))}
        </View>
        {model.facts.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.facts} contentContainerStyle={{ paddingHorizontal: 2 }}>
            {model.facts.map((f) => <FactCardView key={f.id} card={f} />)}
          </ScrollView>
        ) : null}
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
    </View>
  );
}

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

function FactCardView({ card }: { card: FactCard & { isNew: boolean } }) {
  return (
    <View style={[styles.fact, card.gold && styles.factGold]}>
      {card.isNew ? <Text style={styles.factNew}>NEW</Text> : null}
      <Text style={styles.factText} numberOfLines={4}>{card.fact}</Text>
      {card.tpsArticleUrl ? (
        <Pressable
          onPress={() => { void WebBrowser.openBrowserAsync(`${card.tpsArticleUrl}${card.tpsArticleUrl!.includes('?') ? '&' : '?'}utm_source=app&utm_medium=trivia`); }}
          style={styles.readBtn}
          accessibilityRole="link"
        >
          <Text style={styles.readText}>Read on TPS</Text>
        </Pressable>
      ) : card.source ? <Text style={styles.factSource}>{`Source: ${card.source}`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 14 },
  card: { backgroundColor: C.blue, borderRadius: 24, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 8, padding: 14, paddingTop: 22 },
  crownWrap: { position: 'absolute', top: -70, alignSelf: 'center' },
  crown: { width: 96, height: 91 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', marginTop: 2 },
  scoreMe: { fontFamily: 'Shark', fontSize: 34, color: '#ffffff' },
  scoreVs: { fontFamily: 'Knockout', fontSize: 16, color: '#dff4ff', marginHorizontal: 10 },
  scoreOpp: { fontFamily: 'Shark', fontSize: 34, color: C.cream },
  gapTrack: { flexDirection: 'row', height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: C.ink, overflow: 'hidden', backgroundColor: '#dff4ff', marginVertical: 6 },
  gapMe: { backgroundColor: C.gold },
  gapSeg: { backgroundColor: C.coral },
  gapOpp: { backgroundColor: 'transparent' },
  banners: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 },
  banner: { backgroundColor: C.gold, borderWidth: 2.5, borderColor: C.ink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, margin: 3 },
  bannerText: { fontFamily: 'Shark', fontSize: 16, color: C.navy },
  near: { fontFamily: 'Knockout', fontSize: 17, color: '#ffffff', textAlign: 'center', marginVertical: 4 },
  rows: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 6 },
  rowItem: { alignItems: 'center', minWidth: 64 },
  rowVal: { fontFamily: 'Shark', fontSize: 20, color: '#ffffff' },
  rowLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#dff4ff' },
  facts: { maxHeight: 118, marginBottom: 6 },
  fact: { width: 210, marginRight: 8, backgroundColor: C.cream, borderRadius: 14, borderWidth: 3, borderColor: C.ink, padding: 9 },
  factGold: { borderColor: C.goldDeep, borderWidth: 4 },
  factNew: { position: 'absolute', right: 6, top: 4, fontFamily: 'Shark', fontSize: 12, color: C.goldDeep },
  factText: { fontSize: 14, fontWeight: '700', color: C.navy },
  factSource: { fontFamily: 'Knockout', fontSize: 11, color: '#5b7896', marginTop: 4 },
  readBtn: { marginTop: 6, alignSelf: 'flex-start', backgroundColor: C.blue, borderRadius: 8, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 8, paddingVertical: 2 },
  readText: { fontFamily: 'Knockout', fontSize: 13, color: '#ffffff' },
  buttons: { marginTop: 2 },
  btn: { height: 56, borderRadius: 16, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 6, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primary: { backgroundColor: C.gold },
  primaryText: { fontFamily: 'Shark', fontSize: 24, color: C.navy },
  secondary: { backgroundColor: '#ffffff' },
  secondaryText: { fontFamily: 'Shark', fontSize: 17, color: C.navy },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48.5%' },
  full: { width: '100%' },
});
