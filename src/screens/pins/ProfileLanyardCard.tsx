/**
 * The lanyard on a profile: the flex others see. Your own profile and every
 * player card show the pins you chose to wear, chasers shining and park pins
 * with their seal. Nothing personal: only pin art and two counts.
 * Tapping your own opens the Pins page. A server without Pins v2 shows nothing.
 */
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { getPlayerLanyard } from '../../api/endpoints/pins';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, OUTLINE, RADIUS, SPACE } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { Lanyard } from './Lanyard';
import { PIN_ART } from './PinArt';
import type { LanyardPin } from './pinsModel';

export default function ProfileLanyardCard({ playerId, own }: { playerId: number; own: boolean }) {
  const [data, setData] = useState<{ lanyard: LanyardPin[]; pins: number; sets_done: number } | null>(null);
  const { width } = useWindowDimensions();
  const still = useUiReducedMotion();
  const focused = useIsFocused();
  useEffect(() => {
    let live = true;
    getPlayerLanyard(playerId).then(d => { if (live) setData(d); }).catch(() => undefined);
    return () => { live = false; };
  }, [playerId, focused]);

  if (!data || (!own && data.lanyard.length === 0)) return null;
  const chasers = data.lanyard.filter(p => p.is_chaser).length;
  const body = (
    <View style={styles.card} accessible accessibilityLabel={`${own ? 'Your' : 'Their'} lanyard: ${data.lanyard.map(p => p.name).join(', ') || 'empty'}. ${data.pins} pins, ${data.sets_done} park sets done`}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={1.15} style={styles.title}>Lanyard</Text>
        <View style={styles.chip}><Image source={PIN_ART.seal} style={styles.icon} contentFit="contain" /><Text maxFontSizeMultiplier={1.1} style={styles.chipText}>{data.sets_done}</Text></View>
        {chasers > 0 && <View style={styles.chip}><Image source={PIN_ART.chaser} style={styles.icon} contentFit="contain" /><Text maxFontSizeMultiplier={1.1} style={styles.chipText}>{chasers}</Text></View>}
        <Text maxFontSizeMultiplier={1.1} style={styles.count}>{data.pins} pins</Text>
      </View>
      {data.lanyard.length > 0 ? (
        <Lanyard pins={data.lanyard} width={width - 32 - SPACE.md * 2} height={140} still={still} active={focused} />
      ) : (
        <Text maxFontSizeMultiplier={1.2} style={styles.empty}>Wear your best pins here</Text>
      )}
    </View>
  );
  if (!own) return body;
  return (
    <Pressable onPress={() => RootNavigation.navigate('PinCollections')} accessibilityRole="button" accessibilityHint="Opens your pins">
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 18, backgroundColor: BRAND.blue, borderRadius: RADIUS.lg, borderWidth: OUTLINE.thick, borderColor: BRAND.navy, paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: SPACE.sm, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { fontFamily: FONT.display, fontSize: 22, color: BRAND.white, paddingTop: 3, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.cream, borderRadius: 999, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, paddingTop: 2 },
  icon: { width: 18, height: 18 },
  count: { marginLeft: 'auto', fontFamily: FONT.body, fontSize: 16, color: '#e2f6ff' },
  empty: { fontFamily: FONT.body, fontSize: 18, color: '#e2f6ff', textAlign: 'center', paddingVertical: SPACE.lg },
});
