/**
 * The Halloween Shop stall on the Fin-ister event map: the Halloween booth
 * (GPT Image 2.5 from Alex's references, art/map-icons/shop in the art kit)
 * with its warm lantern glow baked into the art (no live shadow on a map marker), a LIMITED tag, and a night-palette name chip
 * ("Halloween Shop" over tonight's real hours: "Open till 2 AM").
 * Away (not at the event or outside event hours) is a deliberate locked look:
 * the solid booth without its glow, a small gold lock in its corner, the chip turns fog-grey and reads
 * "Opens at 6:30 PM" or "Only at Fin-ister Nights". Plain RN views in a FIXED
 * box (a MarkerView size change re-adds the iOS annotation): only text and
 * opacity change, the tree and the box never do. No Skia, no vector icons.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GameIcon } from '../../../ui';
import { NIGHT } from './frightArt';

export const STALL_BOX = { w: 150, h: 136 } as const;
/** The booth's foot inside the box: the stall stands on its point. */
export const STALL_ANCHOR = { x: 0.5, y: 0.58 } as const;
const BOOTH = require('./art/halloween-booth.webp');
const BOOTH_CLOSED = require('./art/halloween-booth-closed.webp');
/** Both arts are 288 px squares with the booth at the same spot, so swapping is opacity only. */
const BOOTH_PT = 92;

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
      <View style={styles.boothBox}>
        <Image source={BOOTH} style={[styles.booth, open ? null : styles.hidden]} contentFit="contain" cachePolicy="memory" />
        <Image source={BOOTH_CLOSED} style={[styles.booth, open ? styles.hidden : null]} contentFit="contain" cachePolicy="memory" />
      </View>
      <View style={[styles.lock, open ? styles.hidden : null]}><GameIcon name="lock" size={20} /></View>
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
  boothBox: { width: BOOTH_PT, height: BOOTH_PT, marginTop: -8, marginBottom: -12 },
  booth: { position: 'absolute', width: BOOTH_PT, height: BOOTH_PT },
  lock: { position: 'absolute', top: 58, left: STALL_BOX.w / 2 + 18 },
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
