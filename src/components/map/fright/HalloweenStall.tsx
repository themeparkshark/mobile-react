/**
 * The Halloween Shop stall on the Fin-ister event map: the shop's own art in a
 * pumpkin-ringed booth plate, a LIMITED tag, and a night-palette name chip
 * ("Halloween Shop", then "Ends in 29 days", or "Only at Fin-ister Nights" for
 * a player who cannot shop right now). Plain RN views in a FIXED box (a
 * MarkerView size change re-adds the iOS annotation): text and opacity change,
 * the tree and the box never do. No Skia, no vector-drawn icons.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GameIcon } from '../../../ui';
import { NIGHT } from './frightArt';

export const STALL_BOX = { w: 150, h: 128 } as const;
/** The plate's foot inside the box: the stall stands on its point. */
export const STALL_ANCHOR = { x: 0.5, y: 0.56 } as const;
/** Alex's round store frame (386 x 363 art, height = width x 386 / 363), as on the Profile row. */
const BOOTH_W = 70;
const BOOTH_H = Math.round(BOOTH_W * 386 / 363);
const BOOTH = require('../../../../assets/images/screens/profile/shortcut_shark_shop.png');

export const HalloweenStall = memo(function HalloweenStall({ name, line, tag, open }: {
  readonly name: string;
  /** Second chip line: the countdown when open, the away line when not. */
  readonly line: string;
  readonly tag: string;
  /** The shop's own art (server). Reserved: the booth art reads clearer as a shop on the map. */
  readonly iconUrl?: string | null;
  /** Can this player shop now? Closed stalls dim a little and drop the coin badge. */
  readonly open: boolean;
}) {
  return (
    <View style={styles.box} pointerEvents="none">
      <View style={[styles.plate, !open && styles.plateAway]}>
        {/* The shop booth players already know from the Profile row (Alex's art), so it reads as "a shop" at a glance. */}
        <Image source={BOOTH} style={styles.art} contentFit="contain" />
        <View style={[styles.coin, open ? null : styles.hidden]}><GameIcon name="coins" size={20} /></View>
      </View>
      <View style={styles.tag}><Text style={styles.tagText} maxFontSizeMultiplier={1}>{tag}</Text></View>
      <View style={styles.chip}>
        <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1}>{name}</Text>
        <Text style={styles.line} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1}>{line}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: STALL_BOX.w, height: STALL_BOX.h, alignItems: 'center' },
  // A warm lantern glow behind the booth marks it as the night's event shop.
  plate: { width: BOOTH_W, height: BOOTH_H, shadowColor: NIGHT.lantern, shadowOpacity: 0.95, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  plateAway: { opacity: 0.6, shadowOpacity: 0.2 },
  art: { width: '100%', height: '100%' },
  coin: { position: 'absolute', right: 2, bottom: 2 },
  hidden: { opacity: 0 },
  tag: {
    position: 'absolute', top: 0, right: 18, backgroundColor: NIGHT.candy, borderRadius: 8, borderWidth: 2, borderColor: NIGHT.ink,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  tagText: { fontFamily: 'Shark', fontSize: 11, color: NIGHT.ink, letterSpacing: 0.5 },
  chip: {
    marginTop: 4, maxWidth: STALL_BOX.w, alignItems: 'center', backgroundColor: NIGHT.midnight, borderRadius: 12, borderWidth: 2,
    borderColor: NIGHT.pumpkin, paddingHorizontal: 9, paddingVertical: 3,
  },
  name: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.moon },
  line: { fontFamily: 'Knockout', fontSize: 12, color: NIGHT.fogLight },
});
