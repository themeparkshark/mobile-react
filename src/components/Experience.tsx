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
import XpPotion from './XpPotion';
import type { PotionTransition } from './xpPotionModel';

/**
 * Player level on a profile: the level in Shark on a cream card, Alex's XP
 * potion filled to the progress inside this level, the XP still needed (not
 * the lifetime total, which lives in the statistics below) and, on your own
 * card, one line on what the next level opens.
 *
 * Level up beat: the old level and numbers stay until the potion bursts, then
 * the number pops, a LEVEL UP! ribbon shows for about 1.2 s, with a sound and a
 * haptic (also under Reduce Motion, where nothing moves). XP counts up on every
 * gain.
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
  const ribbon = useRef(new Animated.Value(0)).current;
  const [ribbonOn, setRibbonOn] = useState(false);

  useEffect(() => {
    seen.set(player.id, { ...live, progress });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, level, current, needed, progress]);
  useEffect(() => () => { if (counter.current) clearInterval(counter.current); }, []);

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

  const onTransition = useCallback((kind: PotionTransition) => {
    if (kind === 'levelUp') { holding.current = true; return; }
    if (kind === 'gain' || kind === 'pour') { countTo(live, kind === 'pour' ? 0 : shown.current); return; }
    setShown(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countTo, level, current, needed, shown.current]);

  const onBurst = useCallback(() => {
    holding.current = false;
    countTo(live, 0);
    if (own) {
      HapticPatterns.levelUp();
      playSound(require('../../assets/sounds/reward.mp3'));
    }
    setRibbonOn(true);
    if (reduced) {
      ribbon.setValue(1);
      setTimeout(() => setRibbonOn(false), 1600);
      return;
    }
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.25, duration: 140, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
    ribbon.setValue(0);
    Animated.sequence([
      Animated.spring(ribbon, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
      Animated.delay(1000),
      Animated.timing(ribbon, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setRibbonOn(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, playSound, reduced, countTo, level, current, needed]);

  const atMax = shown.needed > 0 && shown.current >= shown.needed && level === shown.level && current >= needed;
  const numbers = shown.needed > 0
    ? `${shown.current.toLocaleString()} / ${shown.needed.toLocaleString()} XP`
    : `${shown.current.toLocaleString()} XP`;
  const toNext = shown.needed > 0 && !atMax ? `to Level ${shown.level + 1}` : null;
  const caption = own ? (atMax ? 'Top level reached' : nextLevelCaption(shown.level, rideBoss)) : null;
  // VoiceOver always reads the real values, never the animation's.
  const spoken = needed > 0
    ? `Level ${level}. ${current.toLocaleString()} of ${needed.toLocaleString()} XP to level ${level + 1}.`
    : `Level ${level}. ${current.toLocaleString()} XP.`;
  const ownCaption = own ? (current >= needed && needed > 0 ? 'Top level reached' : nextLevelCaption(level, rideBoss)) : null;

  return (
    <View style={styles.card} accessible accessibilityRole="summary"
      accessibilityLabel={ownCaption ? `${spoken} ${ownCaption}.` : spoken}>
      <XpPotion
        progress={progress}
        level={level}
        size={70}
        paused={paused}
        initial={before ? { level: before.level, progress: before.progress } : undefined}
        onTransition={onTransition}
        onLevelUpBurst={onBurst}
        style={styles.potion}
      />
      <View style={{ flex: 1 }}>
        <Animated.Text style={[styles.level, { transform: [{ scale: pop }] }]} numberOfLines={1}
          adjustsFontSizeToFit minimumFontScale={0.8}>
          {vsprintf(labels.experience_level || 'Level %s', [shown.level])}
        </Animated.Text>
        <View style={styles.numbersRow}>
          <Text style={styles.numbers} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{numbers}</Text>
          {toNext && <Text style={styles.toNext} numberOfLines={1}>{toNext}</Text>}
        </View>
        {caption && <Text style={styles.caption} numberOfLines={2}>{caption}</Text>}
      </View>
      {ribbonOn && (
        // Shadow on a still wrapper; the animated view only scales and fades. Built from
        // nested pills with even borders so iOS fills it edge to edge on every frame.
        <View pointerEvents="none" style={styles.ribbonShadow}>
          <Animated.View style={{
            opacity: ribbon,
            transform: [{ scale: ribbon.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { rotate: '-4deg' }],
          }}>
            <View style={styles.ribbonLip}>
              <View style={styles.ribbonEdge}>
                <View style={styles.ribbonFill}>
                  <Text style={styles.ribbonText}>Level up!</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff8e4', borderRadius: 20,
    borderWidth: 3, borderColor: '#ffffff', borderBottomWidth: 5, borderBottomColor: '#f0dcae',
    paddingVertical: 12, paddingLeft: 18, paddingRight: 14, minHeight: 104,
    shadowColor: '#05346e', shadowOpacity: 0.16, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 3 },
  potion: { marginVertical: 2 },
  level: { fontFamily: 'Shark', fontSize: 26, color: '#05346e', textTransform: 'uppercase', alignSelf: 'flex-start' },
  numbersRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  numbers: { fontFamily: 'Shark', fontSize: 18, color: '#1f8a2b', flexShrink: 1 },
  toNext: { fontFamily: 'Knockout', fontSize: 16, color: '#3d5f8c' },
  caption: { fontFamily: 'Knockout', fontSize: 15, color: '#3d5f8c', marginTop: 3 },
  ribbonShadow: { position: 'absolute', right: 12, top: -16,
    shadowColor: '#05346e', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 3 }, shadowRadius: 4, elevation: 4 },
  ribbonLip: { backgroundColor: '#d99a00', borderRadius: 17, paddingBottom: 4 },
  ribbonEdge: { backgroundColor: '#ffffff', borderRadius: 17, padding: 3 },
  ribbonFill: { backgroundColor: '#ffcf3b', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 3 },
  ribbonText: { fontFamily: 'Shark', fontSize: 22, color: '#05346e', textTransform: 'uppercase' },
});
