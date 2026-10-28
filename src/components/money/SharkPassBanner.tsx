/**
 * <SharkPassBanner />: the door to the Shark Pass, for any screen. Shows only
 * while a season runs (server flag on, season active): the season, the step
 * the player is on, and how many rewards wait to be claimed. Opens the pass
 * screen; nothing is bought from here.
 */
import { NavigationRouteContext, useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { getSharkPass, type SharkPassState } from '../../api/endpoints/me/shark-pass';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameIcon } from '../../ui';
import { MAX_FONT } from './moneyUi';
import { nextPassPrize, passGain, rewardWords, stepWords } from '../../services/money/sharkPassModel';
import { useRung } from '../../services/reveal/revealLadder';
import countText from '../../helpers/countText';

const EMBLEM = require('../../../assets/images/sharkpass/pass-emblem.webp');

/**
 * The banner's line: rewards to claim, else the one next prize (the same answer as the pass
 * screen: nextPassPrize), else "Step N of 50". Exported for tests.
 */
export function bannerLine(state: SharkPassState | null): string | null {
  if (!state || !state.enabled || !state.season || !state.progress) return null;
  const { claimable } = state.progress;
  if (claimable > 0) return `${claimable} ${claimable === 1 ? 'reward' : 'rewards'} to claim`;
  const next = nextPassPrize(state);
  if (next) return `${countText(next.pointsAway)} points to ${rewardWords(next.reward)}`;
  return stepWords(state.progress.tier, state.season.tier_count);
}

/** The last points this app run saw, so the next banner can say "+120 pass points" after a win. */
let lastSeen: { season: string; points: number; tier: number } | null = null;
/** Dev only (captures): pretend the last look was `points` earlier, so the next banner shows its tick. */
export function devPretendEarlier(points: number): void {
  if (__DEV__ && lastSeen) lastSeen = { ...lastSeen, points: Math.max(0, lastSeen.points - points), tier: Math.max(0, lastSeen.tier - (points >= 400 ? 1 : 0)) };
}

/** The last points this run saw (null before any look). */
export function lastSharkPassSeen(): { season: string; points: number; tier: number } | null { return lastSeen; }

/** Any screen that loads the pass notes its points (the Shark Pass screen, the banner). */
export function noteSharkPassPoints(state: SharkPassState | null): void {
  if (state && state.enabled && state.season && state.progress) lastSeen = { season: state.season.key, points: state.progress.points, tier: state.progress.tier };
}
export default function SharkPassBanner({ style, open, always }: {
  style?: StyleProp<ViewStyle>;
  /** Inside a modal: close it first, then go (e.g. the post-win sheet's closeTo). */
  open?: (go: () => void) => void;
  /** A purchase door (Supplies): shows whenever the switch is on, whatever the unlock rung. */
  always?: boolean;
}) {
  // Core loop rung 5: the banner promotes the pass only once it unlocks (3 coins, after Daily 3 opened).
  // A purchase door never waits for a rung: in the Shark Shop (Supplies) it always shows while the switch is on.
  const route = useContext(NavigationRouteContext);
  const passRung = useRung('shark_pass').open;
  const shown = always === true || route?.name?.toLowerCase() === 'store' || passRung;
  const [state, setState] = useState<SharkPassState | null>(null);
  const [gain, setGain] = useState<{ gained: number; stepUp: number | null; from: number } | null>(null);
  const reduced = useUiReducedMotion();
  const fillTo = useSharedValue(0);
  useFocusEffect(useCallback(() => {
    if (!shown) return undefined;
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
  }, [shown]));
  const target = state && state.enabled && state.season && state.progress ? Math.min(1, state.progress.points_into_tier / state.season.points_per_tier) : 0;
  useEffect(() => {
    if (reduced || !gain) { fillTo.value = target; return; }
    // The bar fills from where it was to where the win took it (Reduce Motion: jumps).
    fillTo.value = gain.from;
    fillTo.value = withDelay(250, withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [target, gain, reduced, fillTo]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0.04, fillTo.value) * 100}%` }));
  const line = bannerLine(state);
  if (!shown || !line || !state || !state.enabled || !state.season) return null;
  const claim = (state.progress?.claimable ?? 0) > 0;
  return (
    <Pressable onPress={() => { const go = () => RootNavigation.navigate('SharkPass'); if (open) open(go); else go(); }} accessibilityRole="button"
      accessibilityLabel={`Shark Pass, ${state.season.title}. ${line}.`}
      style={({ pressed }) => [st.lip, style, pressed && st.lipPressed]}>
      <View style={st.card}>
        <Image source={EMBLEM} style={st.emblem} contentFit="contain" />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {`SHARK PASS · ${stepWords(state.progress?.tier ?? 0, state.season.tier_count).toUpperCase()}`}</Text>
            {/* "+N pass points" ticks only once the pass has unlocked (rung 5). */}
            {gain && passRung && <Text maxFontSizeMultiplier={1.1} style={st.gain}>{gain.stepUp ? `Step ${gain.stepUp}!` : `+${gain.gained} pass points`}</Text>}
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
  bar: { height: 9, borderRadius: 5, backgroundColor: '#0b2f63', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: BRAND.gold, borderRadius: 4 },
  gain: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy, backgroundColor: BRAND.gold, borderRadius: 8, paddingHorizontal: 6, overflow: 'hidden' },
  dot: { position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#e8322a', borderWidth: 2, borderColor: '#fff' },
});
