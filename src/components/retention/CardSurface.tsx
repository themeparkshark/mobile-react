import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BRAND } from '../../ui';

/**
 * The hand-drawn panel behind every daily-loop card (chest, flame, tomorrow,
 * freeze, ember, welcome back): Alex's blue with light from the top (sky to
 * blue to a deeper blue), a white bevel inside the navy outline (CARD_FRAME), a soft
 * shade along the bottom and a few faint bubbles, so the card reads like one
 * of his frames and never like a flat system modal. Static: drawn once, no
 * animation, no layout callbacks. Sits first inside the card (absolute fill).
 */
export const CARD_RADIUS = 24;
export const CARD_BORDER = 4;
/** The cartoon lip under every card (Alex's frames sit on a thick navy base, like a sticker on the water). */
export const CARD_LIP = 9;

/**
 * Alex's chunky frame, shared by every loop card: a thick navy outline (his ink line), a thicker navy lip along the
 * bottom that reads as the card's drop shadow, and (drawn by CardSurface) a white bevel just inside the outline.
 * No iOS shadow layer (a shadow on a clipped, animated card costs an offscreen pass every frame).
 */
export const CARD_FRAME = {
  backgroundColor: BRAND.blue, borderRadius: CARD_RADIUS, borderWidth: CARD_BORDER, borderColor: BRAND.navy, borderBottomWidth: CARD_LIP,
} as const;

const SOFT = require('../../../assets/images/reveal/soft-spot.webp');
/** The white bevel's width (pt). */
const BEVEL = 3;

/** Where the faint bubbles sit (fractions of the card), drawn once. */
const BUBBLES = [
  { x: 0.08, y: 0.14, r: 9 }, { x: 0.9, y: 0.1, r: 6 }, { x: 0.86, y: 0.36, r: 12 }, { x: 0.12, y: 0.52, r: 5 },
  { x: 0.92, y: 0.66, r: 7 }, { x: 0.06, y: 0.8, r: 11 }, { x: 0.94, y: 0.9, r: 5 },
] as const;

export const CardSurface = memo(function CardSurface() {
  const inner = CARD_RADIUS - CARD_BORDER;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: inner, overflow: 'hidden' }]}>
      <LinearGradient colors={['#3d9ee6', BRAND.blue, '#055aa3']} locations={[0, 0.42, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill} />
      {/* A soft round pool of light high in the card (where the prize sits). */}
      <Image cachePolicy="memory-disk" source={SOFT} style={styles.pool} contentFit="fill" tintColor="#d6efff" transition={0} />
      {BUBBLES.map((b, i) => (
        <View key={i} style={[styles.bubble, { left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: b.r * 2, height: b.r * 2, borderRadius: b.r }]} />
      ))}
      {/* The bottom shade: the card sits on the water like a raft. */}
      <LinearGradient colors={['rgba(5,52,110,0)', 'rgba(5,52,110,0.32)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={styles.shade} />
      {/* Alex's white bevel just inside the navy ink line: bright along the top, softer down the sides. */}
      <View style={[styles.highlight, { borderRadius: inner }]} />
      <View style={[styles.innerLine, { borderRadius: inner - BEVEL }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  bubble: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.06)' },
  pool: { position: 'absolute', left: '-15%', right: '-15%', top: '-18%', height: '62%', opacity: 0.5 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 },
  // The white bevel just inside the navy outline (top light catches it most), then a thin sky line under it.
  highlight: { ...StyleSheet.absoluteFillObject, borderWidth: BEVEL, borderColor: 'rgba(255,255,255,0.92)', borderTopWidth: BEVEL + 1,
    borderBottomColor: 'rgba(214,239,255,0.55)' },
  innerLine: { position: 'absolute', left: BEVEL, right: BEVEL, top: BEVEL + 1, bottom: BEVEL, borderWidth: 1.5, borderColor: 'rgba(5,52,110,0.18)' },
});

export default CardSurface;
