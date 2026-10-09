import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import { nextLevelCaption } from '../constants/levelUnlocks';
import HapticPatterns from '../helpers/hapticPatterns';
import { selectionAsync } from '../helpers/haptics';
import { GameAudio } from '../gamekit/audio/GameAudio';
import { playSfx } from '../gamekit/SFX';
import useCrumbs from '../hooks/useCrumbs';
import { useReduceMotionPreference } from '../hooks/useReducedGameMotion';
import { PlayerType } from '../models/player-type';
import { useProgressionFlags } from '../services/progression/progressionFlags';
import { GameIcon } from '../ui';
import XpBar, { XP_BAR_HEIGHT, XP_BAR_LIP } from './XpBar';
import type { PotionTransition } from './xpPotionModel';

/**
 * Player level on a profile, in one slim row (Dustin, Oct 8 2026: the potion
 * card was "very big and bulky"; make it "horizontal and sleeker"):
 * a gold level badge, the XP potion poured into a horizontal bar with the XP
 * inside this level written on it (not the lifetime total, which lives in the
 * statistics below), Alex's little XP potion capping the end, and on your own
 * profile one short line on what the next level opens.
 *
 * Level up beat: the old level stays until the bar bursts, then the badge pops
 * to the new level, the bar turns gold and reads LEVEL UP!, with a sound, a
 * haptic and a VoiceOver announcement (also under Reduce Motion, where it
 * fades instead of moving), then it refills while the new XP counts up.
 * On a gain the XP counts up, the potion cap wiggles, and your own profile
 * ticks softly with a selection haptic.
 */
export function experienceProgress(player: Pick<PlayerType, 'experience' | 'experience_level'>) {
  const needed = Math.max(0, Number(player.experience_level?.experience) || 0);
  const current = Math.max(0, Math.min(needed || Infinity, Number(player.experience) || 0));
  return {
    level: Number(player.experience_level?.level) || 1,
    current,
    needed,
    percent: needed > 0 ? Math.min(100, current / needed * 100) : 0,
  };
}

type Shown = { level: number; current: number; needed: number };

/** What each player's card showed last, so a return visit only animates what changed. */
const seen = new Map<number, Shown & { progress: number }>();

export default function Experience({
  player,
  own = true,
  paused = false,
}: {
  readonly player: PlayerType;
  /** The signed-in player's card: shows what the next level unlocks and celebrates level ups. */
  readonly own?: boolean;
  /** Stop the potion's animation (scrolled off screen or screen not focused). */
  readonly paused?: boolean;
}) {
  const { labels } = useCrumbs();
  const { rideBoss } = useProgressionFlags();
  // Three states, like the potion: null means not known yet (decide nothing).
  const reduced = useReduceMotionPreference() === true;
  const { level, current, needed, percent } = experienceProgress(player);
  const progress = percent / 100;
  const before = useRef(seen.get(player.id)).current;
  const live: Shown = { level, current, needed };

  // The level on the badge lags the data through a level up (until the burst). The XP numbers live in
  // the bar and count up on the UI thread.
  const [shownLevel, setShownLevel] = useState(before?.level ?? level);
  const announced = useRef(0);
  const pop = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    seen.set(player.id, { ...live, progress });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, level, current, needed, progress]);

  // Own profile: the gain tick and the refill tick are preloaded, so they land with the motion.
  useEffect(() => {
    if (!own) return;
    void (async () => {
      try {
        if (!GameAudio.backend) await GameAudio.init();
        await GameAudio.preload(['ui.select', 'fx.reward']);
      } catch { /* sound is decoration */ }
    })();
  }, [own]);

  const shake = useCallback((big: boolean) => {
    if (reduced) return;
    wiggle.setValue(0);
    Animated.sequence([
      Animated.timing(wiggle, { toValue: big ? -1 : -0.6, duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: big ? 0.8 : 0.45, duration: 110, useNativeDriver: true }),
      Animated.spring(wiggle, { toValue: 0, friction: 4, tension: 180, useNativeDriver: true }),
    ]).start();
  }, [reduced, wiggle]);

  const onTransition = useCallback((kind: PotionTransition) => {
    if (kind === 'levelUp') return; // the badge waits for the burst
    if (kind === 'gain') {
      shake(false);
      if (own) {
        playSfx('ui.select', 0.5);
        void selectionAsync();
      }
    }
    setShownLevel(level);
  }, [shake, own, level]);

  const onBurst = useCallback(() => {
    setShownLevel(level);
    if (own) {
      HapticPatterns.levelUp();
      playSfx('fx.reward');
      // Once per level, even if a refetch replays a celebration.
      if (announced.current !== level) {
        announced.current = level;
        AccessibilityInfo.announceForAccessibility(`Level ${level}!`);
      }
    }
    if (reduced) return;
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.3, duration: 140, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
    shake(true);
  }, [own, reduced, shake, pop, level]);

  const onRefill = useCallback(() => {
    if (own) playSfx('ui.select', 0.4);
  }, [own]);

  // Stable handlers for the bar (it reads the latest through this ref), so a new render never re-renders it.
  const handlers = useRef({ onTransition, onBurst, onRefill });
  handlers.current = { onTransition, onBurst, onRefill };
  const barTransition = useCallback((kind: PotionTransition) => handlers.current.onTransition(kind), []);
  const barBurst = useCallback(() => handlers.current.onBurst(), []);
  const barRefill = useCallback(() => handlers.current.onRefill(), []);
  const xp = useMemo(() => ({ current, needed }), [current, needed]);
  const initial = useMemo(() => (before ? { level: before.level, progress: before.progress, xp: { current: before.current, needed: before.needed } } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  // A stranger's in-level XP is private (null): show the level only, never "0 / N XP".
  const hideXp = player.experience === null || player.experience === undefined;
  const atMax = needed > 0 && current >= needed;
  const caption = own ? (atMax ? 'Top level reached' : nextLevelCaption(shownLevel, rideBoss)) : null;
  // VoiceOver always reads the real values, never the animation's.
  const spoken = hideXp ? `Level ${level}.` : needed > 0
    ? `Level ${level}. ${current.toLocaleString()} of ${needed.toLocaleString()} XP to level ${level + 1}.`
    : `Level ${level}. ${current.toLocaleString()} XP.`;
  const ownCaption = own ? (current >= needed && needed > 0 ? 'Top level reached' : nextLevelCaption(level, rideBoss)) : null;
  const tilt = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-30deg', '6deg'] });

  return (
    <View style={styles.row} accessible accessibilityRole="summary"
      accessibilityLabel={ownCaption ? `${spoken} ${ownCaption}.` : spoken}>
      <Animated.View style={[styles.badgeLip, { transform: [{ scale: pop }] }]}>
        <View style={styles.badge}>
          <View style={styles.badgeShade} />
          <View style={styles.badgeGloss} />
          <Text style={styles.badgeLv} maxFontSizeMultiplier={1}>LV</Text>
          <Text style={[styles.badgeNumber, shownLevel >= 100 && { fontSize: 15 }]} numberOfLines={1} maxFontSizeMultiplier={1}>{shownLevel}</Text>
        </View>
      </Animated.View>
      {hideXp ? (
        <Text style={styles.levelOnly} numberOfLines={1}>{vsprintf(labels.experience_level || 'Level %s', [shownLevel])}</Text>
      ) : (
        <View style={styles.column}>
          <View style={styles.barRow}>
            <XpBar
              progress={progress}
              level={level}
              xp={xp}
              paused={paused}
              initial={initial}
              onTransition={barTransition}
              onLevelUpBurst={barBurst}
              onRefill={barRefill}
              style={styles.bar}
            />
            {/* Alex's XP potion caps the end of the bar: it wiggles on every gain. */}
            <Animated.View pointerEvents="none" style={[styles.cap, { transform: [{ rotate: tilt }] }]}>
              <GameIcon name="xp" size={CAP} />
            </Animated.View>
          </View>
          {caption && <Text style={styles.caption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{caption}</Text>}
        </View>
      )}
    </View>
  );
}

const BADGE = 44;
const CAP = 32;
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  // Gold coin badge: ink outline, a darker lip under it, a cel band and a gloss, like the title pill.
  badgeLip: { width: BADGE, height: BADGE + 3, borderRadius: BADGE / 2, backgroundColor: '#05346e', paddingBottom: 3 },
  badge: { width: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 3, borderColor: '#05346e', backgroundColor: '#ffcf3b',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 13, backgroundColor: '#f2b51c' },
  badgeGloss: { position: 'absolute', left: 7, top: 5, width: 12, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.85)', transform: [{ rotate: '-25deg' }] },
  badgeLv: { fontFamily: 'Knockout', fontSize: 10, lineHeight: 11, color: '#05346e', marginTop: 2, letterSpacing: 0.5 },
  badgeNumber: { fontFamily: 'Shark', fontSize: 20, lineHeight: 22, color: '#05346e', marginTop: -1, paddingHorizontal: 4 },
  levelOnly: { fontFamily: 'Shark', fontSize: 22, color: '#05346e', textTransform: 'uppercase', marginTop: 3 },
  column: { flex: 1 },
  barRow: { height: XP_BAR_HEIGHT + XP_BAR_LIP, justifyContent: 'center' },
  // The cap sits in its own slot, 2 pt clear of the bar end.
  bar: { marginRight: CAP + 2 },
  cap: { position: 'absolute', right: 0, top: (XP_BAR_HEIGHT + XP_BAR_LIP - CAP * 1.08) / 2 },
  caption: { fontFamily: 'Knockout', fontSize: 13, color: '#3d5f8c', marginTop: 3, marginLeft: 4 },
});
