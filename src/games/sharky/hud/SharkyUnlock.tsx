/**
 * SharkyUnlock: the new thing a Sharky run unlocked (Prize Boxes, Overdrive,
 * Rally, Power-ups), shown the same way Whack shows a new Finn: a picture on
 * a white tile with a gold NEW tag, inside the card above the buttons, on its
 * own beat after the stars, the title and the score. The name is only spoken
 * (VoiceOver). One spring on the UI thread, then it rests; Reduce Motion
 * shows it in place.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { Haptic } from '../../../gamekit/Haptics';
import { SHARKY_ART } from '../assets';

/** Existing Sharky art for each unlock (no new art). */
const UNLOCK_ART: Record<string, number> = {
  'PRIZE BOXES': SHARKY_ART.prizeBox,
  OVERDRIVE: SHARKY_ART.dash,
  'RALLY YOUR CREW': SHARKY_ART.fanCheer,
  'POWER-UPS': SHARKY_ART.sparkle,
};

/** "NEW: Prize Boxes" -> "Prize Boxes" (the words are only spoken). */
export function unlockName(card: string): string {
  return card.replace(/^NEW:\s*/i, '').trim();
}

/** The picture for an unlock, or the prize box for one we do not know yet. */
export function unlockArt(card: string): number {
  return UNLOCK_ART[unlockName(card).toUpperCase()] ?? SHARKY_ART.prizeBox;
}

export function SharkyUnlock({ card, atMs, reducedMotion }: { card: string; atMs: number; reducedMotion: boolean }) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const tag = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    pop.value = withDelay(atMs, withSequence(
      withTiming(1.18, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 9, stiffness: 260 }),
    ));
    tag.value = withDelay(atMs + 220, withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 })));
    // An unlock is a reward: the reward cue, once (the same as a new Finn).
    const t = setTimeout(() => { Haptic.hitSoft(); GameAudio.play('fx.reward', { volume: 0.7 }); }, atMs + 60);
    return () => { clearTimeout(t); cancelAnimation(pop); cancelAnimation(tag); };
  }, [reducedMotion, pop, tag, atMs]);
  const popSt = useAnimatedStyle(() => ({ opacity: pop.value > 0.02 ? 1 : 0, transform: [{ scale: pop.value }, { rotateZ: '-3deg' }] }));
  const tagSt = useAnimatedStyle(() => ({ opacity: tag.value > 0.02 ? 1 : 0, transform: [{ scale: tag.value }, { rotateZ: '8deg' }] }));
  return (
    <View style={styles.row} accessible accessibilityLabel={`New unlocked: ${unlockName(card).toLowerCase()}`}>
      <View style={styles.slot}>
        <Animated.View style={[styles.tile, popSt]}>
          <Image source={unlockArt(card)} style={styles.art} resizeMode="contain" />
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
  slot: { width: 84, height: 84 },
  tile: { width: 84, height: 84, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#05346e', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden' },
  art: { width: 70, height: 70 },
  tagPos: { position: 'absolute', top: -10, right: -26 },
  tag: { backgroundColor: '#ffcf3b', borderRadius: 10, borderWidth: 2.5, borderColor: '#05346e', paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
});
