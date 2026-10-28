/**
 * UnlockTile: the one look for anything a run unlocks, on every results card
 * (Whack's new costume Finn, Sharky's Prize Boxes, Overdrive, Rally, Power-ups).
 * A picture on a white tile with a gold NEW tag, sitting bare on the card's
 * blue (no cream panel, so there is never an empty box waiting for it). It
 * pops in on its own beat, after the stars, the title and the score; the name
 * is only spoken (VoiceOver). One spring on the UI thread, then it rests;
 * Reduce Motion shows it in place.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { GameAudio } from '../audio/GameAudio';
import { Haptic } from '../Haptics';

/** The tile's size (pt): compact, so a tall win still leaves room for the peeking shark on a 874 pt phone. */
export const UNLOCK_TILE_PT = 72;

export function UnlockTile({ source, label, atMs, reducedMotion, fit = 'contain' }: {
  source: ImageSourcePropType;
  /** Spoken only, e.g. "New Finn unlocked: pirate finn". */
  label: string;
  /** When it pops in (ms after the card mounts). */
  atMs: number;
  reducedMotion: boolean;
  /** 'bottom' stands a character on the tile's floor (a Finn); 'contain' centres an object. */
  fit?: 'contain' | 'bottom';
}) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const tag = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    pop.value = withDelay(atMs, withSequence(
      withTiming(1.18, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 9, stiffness: 260 }),
    ));
    tag.value = withDelay(atMs + 220, withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 })));
    // An unlock is a reward, not a coin: the reward cue, once.
    const t = setTimeout(() => { Haptic.hitSoft(); GameAudio.play('fx.reward', { volume: 0.7 }); }, atMs + 60);
    return () => { clearTimeout(t); cancelAnimation(pop); cancelAnimation(tag); };
  }, [reducedMotion, pop, tag, atMs]);
  const popSt = useAnimatedStyle(() => ({ opacity: pop.value > 0.02 ? 1 : 0, transform: [{ scale: pop.value }, { rotateZ: '-3deg' }] }));
  const tagSt = useAnimatedStyle(() => ({ opacity: tag.value > 0.02 ? 1 : 0, transform: [{ scale: tag.value }, { rotateZ: '8deg' }] }));
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <View style={styles.slot}>
        <Animated.View style={[styles.tile, fit === 'bottom' ? styles.tileFloor : null, popSt]}>
          <Image source={source} style={styles.art} resizeMode="contain" />
        </Animated.View>
        {/* The gold NEW tag pinned to the tile's top corner. */}
        <Animated.View style={[styles.tagPos, tagSt]}>
          <View style={styles.tag}><Text style={styles.tagText}>NEW</Text></View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', justifyContent: 'center', paddingTop: 8, paddingBottom: 2 },
  slot: { width: UNLOCK_TILE_PT, height: UNLOCK_TILE_PT },
  tile: { width: UNLOCK_TILE_PT, height: UNLOCK_TILE_PT, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#05346e',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileFloor: { justifyContent: 'flex-end' },
  art: { width: UNLOCK_TILE_PT - 8, height: UNLOCK_TILE_PT - 8 },
  tagPos: { position: 'absolute', top: -10, right: -26 },
  tag: { backgroundColor: '#ffcf3b', borderRadius: 10, borderWidth: 2.5, borderColor: '#05346e', paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
});
