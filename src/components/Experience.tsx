import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import { nextLevelCaption } from '../constants/levelUnlocks';
import { SoundEffectContext, SoundEffectContextType } from '../context/SoundEffectProvider';
import HapticPatterns from '../helpers/hapticPatterns';
import useCrumbs from '../hooks/useCrumbs';
import { useReduceMotionPreference } from '../hooks/useReducedGameMotion';
import { PlayerType } from '../models/player-type';
import { useProgressionFlags } from '../services/progression/progressionFlags';
import { GameIcon } from '../ui';
import XpBar, { XP_BAR_HEIGHT } from './XpBar';
import type { PotionTransition } from './xpPotionModel';

/**
 * Player level on a profile, in one slim row (Dustin, Oct 8 2026: the potion
 * card was "very big and bulky"; make it "horizontal and sleeker"):
 * a gold level badge, the XP potion poured into a horizontal bar with the XP
 * inside this level written on it (not the lifetime total, which lives in the
 * statistics below), Alex's little XP potion capping the end, and on your own
 * profile one short line on what the next level opens.
 *
 * Level up beat: the old level and numbers stay until the bar bursts, then the
 * badge pops to the new level, the bar reads LEVEL UP! in gold for about
 * 1.2 s, with a sound and a haptic (also under Reduce Motion, where nothing
 * moves). XP counts up on every gain and the potion cap wiggles.
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
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const { level, current, needed, percent } = experienceProgress(player);
  const progress = percent / 100;
  const before = useRef(seen.get(player.id)).current;
  const live: Shown = { level, current, needed };

  // The numbers on the card. They lag the data during a level up (until the burst) and count up on gains.
  const [shown, setShown] = useState<Shown>(before ?? live);
  const holding = useRef(false);
  const counter = useRef<ReturnType<typeof setInterval> | null>(null);
  const pop = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  // The LEVEL UP! beat on the bar (about 1.2 s).
  const [ribbonOn, setRibbonOn] = useState(false);

  useEffect(() => {
    seen.set(player.id, { ...live, progress });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, level, current, needed, progress]);
  const ribbonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (counter.current) clearInterval(counter.current);
    if (ribbonTimer.current) clearTimeout(ribbonTimer.current);
  }, []);

  const countTo = useCallback((to: Shown, from: number) => {
    if (counter.current) clearInterval(counter.current);
    if (reduced || to.current <= from) { setShown(to); return; }
    // The new level shows at once; only the XP number counts.
    setShown({ ...to, current: from });
    const start = Date.now();
    counter.current = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 600);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown({ ...to, current: Math.round(from + (to.current - from) * eased) });
      if (t >= 1 && counter.current) { clearInterval(counter.current); counter.current = null; }
    }, 33);
  }, [reduced]);

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
    if (kind === 'levelUp') { holding.current = true; return; }
    if (kind === 'gain') shake(false);
    if (kind === 'gain' || kind === 'pour') { countTo(live, kind === 'pour' ? 0 : shown.current); return; }
    setShown(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countTo, shake, level, current, needed, shown.current]);

  const onBurst = useCallback(() => {
    holding.current = false;
    countTo(live, 0);
    if (own) {
      HapticPatterns.levelUp();
      playSound(require('../../assets/sounds/reward.mp3'));
    }
    setRibbonOn(true);
    if (ribbonTimer.current) clearTimeout(ribbonTimer.current);
    ribbonTimer.current = setTimeout(() => setRibbonOn(false), reduced ? 1600 : 1300);
    if (reduced) return;
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.3, duration: 140, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
    shake(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, playSound, reduced, countTo, shake, level, current, needed]);

  // Stable handlers for the bar (it reads the latest through this ref), so a count-up tick never re-renders it.
  const handlers = useRef({ onTransition, onBurst });
  handlers.current = { onTransition, onBurst };
  const barTransition = useCallback((kind: PotionTransition) => handlers.current.onTransition(kind), []);
  const barBurst = useCallback(() => handlers.current.onBurst(), []);

  // A stranger's in-level XP is private (null): show the level only, never "0 / N XP".
  const hideXp = player.experience === null || player.experience === undefined;
  const atMax = shown.needed > 0 && shown.current >= shown.needed && level === shown.level && current >= needed;
  const numbers = shown.needed > 0
    ? `${shown.current.toLocaleString()} / ${shown.needed.toLocaleString()} XP`
    : `${shown.current.toLocaleString()} XP`;
  const caption = own ? (atMax ? 'Top level reached' : nextLevelCaption(shown.level, rideBoss)) : null;
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
          <Text style={styles.badgeLv}>LV</Text>
          <Text style={[styles.badgeNumber, shown.level >= 100 && { fontSize: 15 }]} numberOfLines={1}>{shown.level}</Text>
        </View>
      </Animated.View>
      {hideXp ? (
        <Text style={styles.levelOnly} numberOfLines={1}>{vsprintf(labels.experience_level || 'Level %s', [shown.level])}</Text>
      ) : (
        <View style={styles.column}>
          <View style={styles.barRow}>
            <XpBar
              progress={progress}
              level={level}
              label={ribbonOn ? 'LEVEL UP!' : numbers}
              gold={ribbonOn}
              paused={paused}
              initial={before ? { level: before.level, progress: before.progress } : undefined}
              onTransition={barTransition}
              onLevelUpBurst={barBurst}
              style={styles.bar}
            />
            {/* Alex's XP potion caps the end of the bar: it wiggles on every gain. */}
            <Animated.View pointerEvents="none" style={[styles.cap, { transform: [{ rotate: tilt }] }]}>
              <GameIcon name="xp" size={36} />
            </Animated.View>
          </View>
          {caption && <Text style={styles.caption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{caption}</Text>}
        </View>
      )}
    </View>
  );
}

const BADGE = 44;
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
  barRow: { height: XP_BAR_HEIGHT, justifyContent: 'center' },
  bar: { marginRight: 16 },
  cap: { position: 'absolute', right: -8, top: (XP_BAR_HEIGHT - 39) / 2 },
  caption: { fontFamily: 'Knockout', fontSize: 13, color: '#3d5f8c', marginTop: 3, marginLeft: 4 },
});
