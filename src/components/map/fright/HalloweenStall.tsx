/**
 * The Halloween Shop stall on the Fin-ister event map: the Halloween booth
 * (GPT Image 2.5 from Alex's references, art/map-icons/shop in the art kit)
 * with a warm lantern glow, a LIMITED tag, and a night-palette name chip
 * ("Halloween Shop" over tonight's real hours: "Open till 2 AM").
 * Away (not at the event or outside event hours) is a deliberate locked look:
 * the booth dims, a gold lock sits on it, the chip turns fog-grey and reads
 * "Opens at 6:30 PM" or "Only at Fin-ister Nights". Plain RN views in a FIXED
 * box (a MarkerView size change re-adds the iOS annotation): only text and
 * opacity change, the tree and the box never do. No Skia, no vector icons.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GameIcon } from '../../../ui';
import { NIGHT } from './frightArt';

export const STALL_BOX = { w: 150, h: 132 } as const;
/** The booth's foot inside the box: the stall stands on its point. */
export const STALL_ANCHOR = { x: 0.5, y: 0.58 } as const;
const BOOTH = require('./art/halloween-booth.webp');
const BOOTH_PT = 76;

export const HalloweenStall = memo(function HalloweenStall({ name, line, tag, open }: {
  readonly name: string;
  /** Second chip line: tonight's hours when open, when it opens (or the away line) when not. */
  readonly line: string;
  readonly tag: string;
  /** Can this player shop now? */
  readonly open: boolean;
}) {
  return (
    <View style={styles.box} pointerEvents="none">
      <View style={[styles.glow, open ? null : styles.hidden]} />
      <Image source={BOOTH} style={[styles.booth, open ? null : styles.boothAway]} contentFit="contain" cachePolicy="memory" />
      <View style={[styles.lock, open ? styles.hidden : null]}><GameIcon name="lock" size={24} /></View>
      <View style={[styles.tag, open ? null : styles.tagAway]}><Text style={styles.tagText} maxFontSizeMultiplier={1}>{tag}</Text></View>
      <View style={[styles.chip, open ? null : styles.chipAway]}>
        <Text style={[styles.name, open ? null : styles.nameAway]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
          maxFontSizeMultiplier={1}>{name}</Text>
        <Text style={[styles.line, open ? null : styles.lineAway]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
          maxFontSizeMultiplier={1}>{line}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: STALL_BOX.w, height: STALL_BOX.h, alignItems: 'center' },
  glow: {
    position: 'absolute', top: 14, width: 64, height: 54, borderRadius: 32, backgroundColor: NIGHT.lantern, opacity: 0.35,
    shadowColor: NIGHT.lantern, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  booth: { width: BOOTH_PT, height: BOOTH_PT },
  boothAway: { opacity: 0.55 },
  lock: { position: 'absolute', top: 30, left: STALL_BOX.w / 2 - 12 },
  hidden: { opacity: 0 },
  tag: {
    position: 'absolute', top: 0, right: 14, backgroundColor: NIGHT.candy, borderRadius: 8, borderWidth: 2, borderColor: NIGHT.ink,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  tagAway: { backgroundColor: NIGHT.fog },
  tagText: { fontFamily: 'Shark', fontSize: 11, color: NIGHT.ink, letterSpacing: 0.5 },
  chip: {
    marginTop: 2, maxWidth: STALL_BOX.w, alignItems: 'center', backgroundColor: NIGHT.midnight, borderRadius: 12, borderWidth: 2,
    borderColor: NIGHT.pumpkin, paddingHorizontal: 9, paddingVertical: 3,
  },
  chipAway: { borderColor: NIGHT.fog, backgroundColor: NIGHT.ink },
  name: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.moon },
  nameAway: { color: NIGHT.fogLight },
  line: { fontFamily: 'Knockout', fontSize: 12, color: NIGHT.fogLight },
  lineAway: { color: NIGHT.fog },
});
