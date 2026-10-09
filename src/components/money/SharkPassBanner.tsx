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

const EMBLEM = require('../../../assets/images/sharkpass/pass-emblem.webp');

/** The banner's second line. Exported for tests. */
export function bannerLine(state: SharkPassState | null): string | null {
  if (!state || !state.enabled || !state.season || !state.progress) return null;
  const { tier, claimable, premium } = state.progress;
  if (claimable > 0) return `${claimable} ${claimable === 1 ? 'reward' : 'rewards'} to claim`;
  return tier === 0 ? 'Play to climb 50 steps of winter rewards' : `Step ${tier} of ${state.season.tier_count}${premium ? '' : ' · see the Shark Pass row'}`;
}

export default function SharkPassBanner({ style }: { style?: StyleProp<ViewStyle> }) {
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
    <Pressable onPress={() => RootNavigation.navigate('SharkPass')} accessibilityRole="button"
      accessibilityLabel={`Shark Pass, ${state.season.title}. ${line}.`}
      style={({ pressed }) => [st.lip, style, pressed && st.lipPressed]}>
      <View style={st.card}>
        <Image source={EMBLEM} style={st.emblem} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.title}>{`SHARK PASS · ${state.season.title.toUpperCase()}`}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={[st.line, claim && st.lineClaim]}>{line}</Text>
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
  dot: { position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#e8322a', borderWidth: 2, borderColor: '#fff' },
});
