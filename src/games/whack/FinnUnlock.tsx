/**
 * FinnUnlock: the new costume Finn a run unlocked, shown as a picture inside
 * the results card (never as words in the title). Alex's cheering costume
 * Finn pops up on a white card with a gold NEW tag on its own beat, after
 * the stars, the tally and the total have landed, so the star title (NICE!,
 * GREAT!, INCREDIBLE!) and the score each keep their moment.
 * The name is only spoken (VoiceOver). One spring on the UI thread, then it
 * rests; Reduce Motion shows it in place.
 */

import React, { useContext, useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { THEMED_SHARK_FRAMES } from './assets';
import type { WhackThemeId } from './timeline';
import { cardTitle } from './meta/collection';
import { GameAudio, Haptic } from '../../gamekit';
import { ResultsSettleContext } from '../../gamekit/results/ResultsCard';

/**
 * When the new Finn pops in if no card tells us (ms after the card lands).
 * Inside the shared card it waits for the card's settle moment instead:
 * after the stars, the tally and the total, so the Finn gets its own beat.
 */
export const FINN_UNLOCK_AT_MS = 1900;
/** The new Finn's tile size (pt). */
export const FINN_TILE_PT = 72;
/** The Finn lands just after its panel pops in. */
const FINN_AFTER_PANEL_MS = 90;

export function FinnUnlock({ theme, reducedMotion }: { theme: WhackThemeId; reducedMotion: boolean }) {
  const settle = useContext(ResultsSettleContext);
  const at = settle > 0 ? settle + FINN_AFTER_PANEL_MS : FINN_UNLOCK_AT_MS;
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const tag = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    pop.value = withDelay(at, withSequence(
      withTiming(1.18, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 9, stiffness: 260 }),
    ));
    tag.value = withDelay(at + 220, withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 })));
    // An unlock is a reward, not a coin: the reward cue, once.
    const t = setTimeout(() => { Haptic.hitSoft(); GameAudio.play('fx.reward', { volume: 0.7 }); }, at + 60);
    return () => { clearTimeout(t); cancelAnimation(pop); cancelAnimation(tag); };
  }, [reducedMotion, pop, tag, at]);
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
  // Compact (72 pt): a tall Whack win with a new Finn still leaves room for the
  // cheering shark to peek over the ribbon on a 874 pt phone (iPhone 17 Pro).
  row: { alignItems: 'center', justifyContent: 'center' },
  card: { width: FINN_TILE_PT, height: FINN_TILE_PT, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#05346e', alignItems: 'center',
    justifyContent: 'flex-end', overflow: 'hidden' },
  finn: { width: FINN_TILE_PT - 6, height: FINN_TILE_PT - 6 },
  slot: { width: FINN_TILE_PT, height: FINN_TILE_PT },
  tagPos: { position: 'absolute', top: -10, right: -26 },
  tag: { backgroundColor: '#ffcf3b', borderRadius: 10, borderWidth: 2.5, borderColor: '#05346e', paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
});
