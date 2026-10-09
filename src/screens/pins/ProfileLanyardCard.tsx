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
  const [data, setData] = useState<{
    lanyard: LanyardPin[]; pins: number; sets_done: number; chasers?: number; best_serial?: number | null;
    completers?: { item_id: number; name: string; icon_url: string | null }[]; first_finds?: number;
  } | null>(null);
  const { width } = useWindowDimensions();
  const still = useUiReducedMotion();
  const focused = useIsFocused();
  useEffect(() => {
    let live = true;
    getPlayerLanyard(playerId).then(d => { if (live) setData(d); }).catch(() => undefined);
    return () => { live = false; };
  }, [playerId, focused]);

  if (!data || (!own && data.lanyard.length === 0)) return null;
  const chasers = data.chasers ?? data.lanyard.filter(p => p.is_chaser).length;
  const body = (
    <View style={styles.card} accessible accessibilityLabel={`${own ? 'Your' : 'Their'} lanyard: ${data.lanyard.map(p => p.name).join(', ') || 'empty'}. ${data.pins} pins, ${data.sets_done} park sets done`}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={1.3} style={styles.title}>Lanyard</Text>
        <View style={styles.chip}><Image source={PIN_ART.seal} style={styles.icon} contentFit="contain" /><Text maxFontSizeMultiplier={1.1} style={styles.chipText}>{data.sets_done}</Text></View>
        {chasers > 0 && <View style={styles.chip}><Image source={PIN_ART.chaser} style={styles.icon} contentFit="contain" /><Text maxFontSizeMultiplier={1.1} style={styles.chipText}>{chasers}</Text></View>}
        {!!data.best_serial && <View style={[styles.chip, styles.serialChip]}><Text maxFontSizeMultiplier={1.1} style={[styles.chipText, { color: BRAND.gold }]}>#{data.best_serial}</Text></View>}
        {!!data.first_finds && <View style={[styles.chip, { backgroundColor: BRAND.gold }]} accessible accessibilityLabel={`First to find ${data.first_finds} park pins`}><Text maxFontSizeMultiplier={1.1} style={styles.chipText}>#1 x{data.first_finds}</Text></View>}
        <Text maxFontSizeMultiplier={1.1} style={styles.count}>{data.pins} pins</Text>
      </View>
      {!!data.completers?.length && (
        // Completer medals: the sets and series they finished, shown to everyone.
        <View style={styles.medals} accessible accessibilityLabel={`Completer medals: ${data.completers.map(c => c.name).join(', ')}`}>
          {data.completers.map(c => c.icon_url && <Image key={c.item_id} source={c.icon_url} style={{ width: 40, height: 40 }} contentFit="contain" />)}
        </View>
      )}
      {data.lanyard.length > 0 ? (
        <Lanyard pins={data.lanyard} width={width - 32 - SPACE.md * 2} height={140} still={still} active={focused} />
      ) : (
        <Text maxFontSizeMultiplier={1.35} style={styles.empty}>Wear your best pins here</Text>
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
  serialChip: { backgroundColor: '#3b2a05', borderColor: BRAND.gold },
  count: { marginLeft: 'auto', fontFamily: FONT.body, fontSize: 16, color: '#e2f6ff' },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, backgroundColor: 'rgba(5,52,110,0.35)', borderRadius: 12, padding: 6 },
  empty: { fontFamily: FONT.body, fontSize: 18, color: '#e2f6ff', textAlign: 'center', paddingVertical: SPACE.lg },
});
