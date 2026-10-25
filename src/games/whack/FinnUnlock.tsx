/**
 * FinnUnlock: the new costume Finn a run unlocked, shown as a picture inside
 * the results card (never as words in the title). Alex's cheering costume
 * Finn pops up on a white card with a gold NEW tag, after the stars have
 * stamped, so the star title (NICE!, GREAT!, INCREDIBLE!) keeps its moment.
 * The name is only spoken (VoiceOver). One spring on the UI thread, then it
 * rests; Reduce Motion shows it in place.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { THEMED_SHARK_FRAMES } from './assets';
import type { WhackThemeId } from './timeline';
import { cardTitle } from './meta/collection';
import { GameAudio, Haptic } from '../../gamekit';

/** When the new Finn pops in (ms after the card lands): after three stars at 464 ms apart. */
export const FINN_UNLOCK_AT_MS = 1900;

export function FinnUnlock({ theme, reducedMotion }: { theme: WhackThemeId; reducedMotion: boolean }) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const tag = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    pop.value = withDelay(FINN_UNLOCK_AT_MS, withSequence(
      withTiming(1.18, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 9, stiffness: 260 }),
    ));
    tag.value = withDelay(FINN_UNLOCK_AT_MS + 220, withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 })));
    const t = setTimeout(() => { Haptic.hitSoft(); GameAudio.play('fx.coinFull', { volume: 0.6 }); }, FINN_UNLOCK_AT_MS + 60);
    return () => { clearTimeout(t); cancelAnimation(pop); cancelAnimation(tag); };
  }, [reducedMotion, pop, tag]);
  const popSt = useAnimatedStyle(() => ({ opacity: pop.value > 0.02 ? 1 : 0, transform: [{ scale: pop.value }, { rotateZ: '-3deg' }] }));
  const tagSt = useAnimatedStyle(() => ({ opacity: tag.value > 0.02 ? 1 : 0, transform: [{ scale: tag.value }, { rotateZ: '8deg' }] }));
  const name = cardTitle(theme).toLowerCase();
  return (
    <View style={styles.row} accessible accessibilityLabel={`New Finn unlocked: ${name}`}>
      <View style={styles.slot}>
        <Animated.View style={[styles.card, popSt]}>
          <Image source={THEMED_SHARK_FRAMES[theme][1]} style={styles.finn} resizeMode="contain" />
        </Animated.View>
        {/* The gold NEW tag pinned to the card's top corner. */}
        <Animated.View style={[styles.tagPos, tagSt]}>
          <View style={styles.tag}><Text style={styles.tagText}>NEW</Text></View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  card: { width: 92, height: 92, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#05346e', alignItems: 'center',
    justifyContent: 'flex-end', overflow: 'hidden' },
  finn: { width: 86, height: 86 },
  slot: { width: 92, height: 92 },
  tagPos: { position: 'absolute', top: -10, right: -26 },
  tag: { backgroundColor: '#ffcf3b', borderRadius: 10, borderWidth: 2.5, borderColor: '#05346e', paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
});
