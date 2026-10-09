/**
 * <SharkPassBanner />: the door to the Shark Pass, for any screen. Shows only
 * while a season runs (server flag on, season active): the season, the step
 * the player is on, and how many rewards wait to be claimed. Opens the pass
 * screen; nothing is bought from here.
 */
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { getSharkPass, type SharkPassState } from '../../api/endpoints/me/shark-pass';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameIcon } from '../../ui';
import { MAX_FONT } from './moneyUi';
import { rewardWords } from '../../services/money/sharkPassModel';

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
    const reward = premium ? (t.paid.type === 'item' ? t.paid : t.free?.type === 'item' ? t.free : null) : t.free?.type === 'item' ? t.free : null;
    if (reward) return { reward, pointsAway: Math.max(0, t.tier * per - state.progress.points) };
  }
  return null;
}

export default function SharkPassBanner({ style, open }: {
  style?: StyleProp<ViewStyle>;
  /** Inside a modal: close it first, then go (e.g. the post-win sheet's closeTo). */
  open?: (go: () => void) => void;
}) {
  const [state, setState] = useState<SharkPassState | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    void getSharkPass().then(next => { if (live) setState(next); }).catch(() => undefined);
    return () => { live = false; };
  }, []));
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
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.title} numberOfLines={1}>{`SHARK PASS · STEP ${state.progress?.tier ?? 0}`}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={[st.line, claim && st.lineClaim]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{line}</Text>
          {state.progress && (
            <View style={st.bar}><View style={[st.fill, { width: `${Math.min(100, (state.progress.points_into_tier / state.season.points_per_tier) * 100)}%` }]} /></View>
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
  dot: { position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#e8322a', borderWidth: 2, borderColor: '#fff' },
});
