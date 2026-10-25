import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BRAND } from '../../ui';

/**
 * The hand-drawn panel behind every daily-loop card (chest, flame, tomorrow,
 * freeze, ember, welcome back): Alex's blue with light from the top (sky to
 * blue to a deeper blue), a 2 pt inner highlight under the white rim, a soft
 * shade along the bottom and a few faint bubbles, so the card reads like one
 * of his frames and never like a flat system modal. Static: drawn once, no
 * animation, no layout callbacks. Sits first inside the card (absolute fill).
 */
export const CARD_RADIUS = 24;
export const CARD_BORDER = 4;

const SOFT = require('../../../assets/images/reveal/soft-spot.webp');

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
      <View style={[styles.highlight, { borderRadius: inner }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  bubble: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.06)' },
  pool: { position: 'absolute', left: '-15%', right: '-15%', top: '-18%', height: '62%', opacity: 0.5 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 },
  // The 2 pt inner highlight just inside the white rim (top light catches it most).
  highlight: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: 'rgba(255,255,255,0.28)', borderBottomColor: 'rgba(255,255,255,0.08)' },
});

export default CardSurface;
