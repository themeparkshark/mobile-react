/**
 * <SharkPassBanner />: the door to the Shark Pass, for any screen. Shows only
 * while a season runs (server flag on, season active): the season, the step
 * the player is on, and how many rewards wait to be claimed. Opens the pass
 * screen; nothing is bought from here.
 */
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { getSharkPass, type SharkPassState } from '../../api/endpoints/me/shark-pass';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameIcon } from '../../ui';
import { MAX_FONT } from './moneyUi';
import { isWearable, passGain, rewardWords } from '../../services/money/sharkPassModel';

const EMBLEM = require('../../../assets/images/sharkpass/pass-emblem.webp');

/** The banner's line: rewards to claim, else how far the kid's next prize is. Exported for tests. */
export function bannerLine(state: SharkPassState | null): string | null {
  if (!state || !state.enabled || !state.season || !state.progress) return null;
  const { claimable, premium } = state.progress;
  if (claimable > 0) return `${claimable} ${claimable === 1 ? 'reward' : 'rewards'} to claim`;
  const next = nextBannerPrize(state, premium);
  if (next) return `${next.pointsAway.toLocaleString('en-US')} points to ${rewardWords(next.reward)}`;
  const { progress, season } = state;
  const step = progress.tier;
  const steps = season.tier_count;
  return `Step ${step} of ${steps}`;
}

/** Free kids see their own next free prize first; pass owners see the next prize on either row. */
function nextBannerPrize(state: SharkPassState, premium: boolean) {
  if (!state.enabled || !state.tiers || !state.season || !state.progress) return null;
  const per = state.season.points_per_tier;
  for (const t of state.tiers) {
    if (t.unlocked) continue;
    const reward = premium ? (isWearable(t.paid) ? t.paid : isWearable(t.free) ? t.free : null) : isWearable(t.free) ? t.free : null;
    if (reward) return { reward, pointsAway: Math.max(0, t.tier * per - state.progress.points) };
  }
  return null;
}

/** The last points this app run saw, so the next banner can say "+120 pass points" after a win. */
let lastSeen: { season: string; points: number; tier: number } | null = null;
/** Any screen that loads the pass notes its points (the Shark Pass screen, the banner). */
export function noteSharkPassPoints(state: SharkPassState | null): void {
  if (state && state.enabled && state.season && state.progress) lastSeen = { season: state.season.key, points: state.progress.points, tier: state.progress.tier };
}
export default function SharkPassBanner({ style, open }: {
  style?: StyleProp<ViewStyle>;
  /** Inside a modal: close it first, then go (e.g. the post-win sheet's closeTo). */
  open?: (go: () => void) => void;
}) {
  const [state, setState] = useState<SharkPassState | null>(null);
  const [gain, setGain] = useState<{ gained: number; stepUp: number | null; from: number } | null>(null);
  const reduced = useUiReducedMotion();
  const fillTo = useSharedValue(0);
  useFocusEffect(useCallback(() => {
    let live = true;
    void getSharkPass().then(next => {
      if (!live) return;
      const g = passGain(lastSeen, next);
      const from = g && lastSeen && next && next.enabled && next.season && !g.stepUp ? (lastSeen.points % next.season.points_per_tier) / next.season.points_per_tier : 0;
      setGain(g ? { ...g, from } : null);
      setState(next);
      noteSharkPassPoints(next);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []));
  const target = state && state.enabled && state.season && state.progress ? Math.min(1, state.progress.points_into_tier / state.season.points_per_tier) : 0;
  useEffect(() => {
    if (reduced || !gain) { fillTo.value = target; return; }
    // The bar fills from where it was to where the win took it (Reduce Motion: jumps).
    fillTo.value = gain.from;
    fillTo.value = withDelay(250, withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [target, gain, reduced, fillTo]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fillTo.value * 100}%` }));
  const line = bannerLine(state);
  if (!line || !state || !state.enabled || !state.season) return null;
  const claim = (state.progress?.claimable ?? 0) > 0;
  return (
    <Pressable onPress={() => { const go = () => RootNavigation.navigate('SharkPass'); if (open) open(go); else go(); }} accessibilityRole="button"
      accessibilityLabel={`Shark Pass, ${state.season.title}. ${line}.`}
      style={({ pressed }) => [st.lip, style, pressed && st.lipPressed]}>
      <View style={st.card}>
        <Image source={EMBLEM} style={st.emblem} contentFit="contain" />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.title} numberOfLines={1}>{`SHARK PASS · STEP ${state.progress?.tier ?? 0}`}</Text>
            {gain && <Text maxFontSizeMultiplier={1.1} style={st.gain}>{gain.stepUp ? `Step ${gain.stepUp}!` : `+${gain.gained} pts`}</Text>}
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT} style={[st.line, claim && st.lineClaim]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{line}</Text>
          {state.progress && (
            <View style={st.bar}><Animated.View style={[st.fill, fillStyle]} /></View>
          )}
        </View>
        <GameIcon name="arrow" size={26} />
        {claim && <View style={st.dot} />}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  lip: { borderRadius: 20, backgroundColor: '#5a3a00', paddingBottom: 5 },
  lipPressed: { paddingBottom: 1, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, borderWidth: 3, borderColor: BRAND.gold,
    backgroundColor: '#123f80', paddingVertical: 8, paddingHorizontal: 10 },
  emblem: { width: 52, height: 52 },
  title: { fontFamily: FONT.display, fontSize: 17, color: BRAND.gold },
  line: { fontFamily: FONT.body, fontSize: 15, color: '#ffffff' },
  lineClaim: { fontFamily: FONT.display, color: '#7dffb0' },
  bar: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: BRAND.gold, borderRadius: 4 },
  gain: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy, backgroundColor: BRAND.gold, borderRadius: 8, paddingHorizontal: 6, overflow: 'hidden' },
  dot: { position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#e8322a', borderWidth: 2, borderColor: '#fff' },
});
