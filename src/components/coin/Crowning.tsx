import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CoinUpgradeDemo from '../CoinUpgradeDemo';
import Ribbon from '../Ribbon';
import YellowButton from '../YellowButton';
import { queueHaptic } from '../../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../../audio/sfxLimiter';
import { CROWNING, crowningCopy, type CoinBossBlock } from './progressionModel';
import { FlexShareButton, SHARE_IN_MODALS } from '../../share';

/**
 * The Crowning (progression.md 9.5): Level 10, 5.5 s, skippable after 1.5 s.
 *  0-900 ms     charge (the sheet's own Act 1)
 *  900-1700     burst, the crown drops with a squash and a gold dust ring
 *  1700-3200    the background LIGHTENS toward #d8efff; the Boss Shark rises
 *               behind the coin as a navy figure (70%) with a 2pt white rim
 *  3200-4500    ribbon and card
 *  4500+        one primary button and a "Later" link
 * Reduce Motion: the crown appears with the static card. Rendered inside the
 * coin sheet, and only when the PresentationQueue gives it the screen.
 */
const crownArt = require('../../../assets/images/progression/crown.png');
const bossArt = require('../../../assets/images/screens/welcome/shark.png');

export interface CrowningProps {
  readonly rideName: string;
  readonly coinUrl?: string;
  readonly boss: CoinBossBlock | null;
  readonly reduced: boolean;
  readonly inPerson?: boolean;
  /** The Ride Boss lobby, when this build has it and the boss is live. */
  readonly onFight?: () => void;
  readonly onDone: () => void;
  readonly playSound?: (source: number) => void;
}

export default function Crowning({ rideName, coinUrl, boss, reduced, inPerson = false, onFight, onDone, playSound }: CrowningProps) {
  const clock = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const [phase, setPhase] = useState<'playing' | 'card'>(reduced ? 'card' : 'playing');
  const [skippable, setSkippable] = useState(reduced);
  const copy = crowningCopy(rideName, boss, inPerson, null, !!onFight);

  useEffect(() => {
    if (reduced) { queueHaptic('success'); return; }
    const total = CROWNING.totalMs - CROWNING.phases.burst.start;
    const run = Animated.timing(clock, { toValue: 1, duration: total, easing: Easing.linear, useNativeDriver: false });
    run.start(({ finished }) => { if (finished) setPhase('card'); });
    const at = (ms: number) => Math.max(0, ms - CROWNING.phases.burst.start);
    const timers = [
      setTimeout(() => {
        queueHaptic('comboHeavy');
        playLimited('crowning', { priority: SFX_PRIORITY.land, durationMs: 1200 }, () => {
          playSound?.(require('../../../assets/sounds/reward.mp3'));
        });
      }, 0),
      setTimeout(() => queueHaptic('success'), at(CROWNING.phases.burst.start + 200)),
      // Two soft heartbeat thumps as the boss wakes.
      setTimeout(() => queueHaptic('tapLight'), at(CROWNING.phases.awaken.start + 500)),
      setTimeout(() => queueHaptic('tapLight'), at(CROWNING.phases.awaken.start + 800)),
      setTimeout(() => setSkippable(true), at(CROWNING.skippableAfterMs)),
      setTimeout(() => setPhase('card'), at(CROWNING.phases.ribbon.start)),
    ];
    return () => { run.stop(); timers.forEach(clearTimeout); };
  }, [reduced]);

  const span = CROWNING.totalMs - CROWNING.phases.burst.start;
  const t = (ms: number) => Math.max(0, Math.min(1, (ms - CROWNING.phases.burst.start) / span));
  const background = clock.interpolate({
    inputRange: [0, t(CROWNING.phases.awaken.start), t(CROWNING.phases.awaken.end), 1],
    outputRange: [CROWNING.background.from, CROWNING.background.from, CROWNING.background.to, CROWNING.background.to],
  });
  const crownScaleY = clock.interpolate({
    inputRange: [0, t(1100), t(1300), t(1500), 1],
    outputRange: [1, 1, CROWNING.crownSquash[0], CROWNING.crownSquash[1], CROWNING.crownSquash[2]],
  });
  const crownDrop = clock.interpolate({ inputRange: [0, t(1100), 1], outputRange: [-160, 0, 0] });
  const bossRise = clock.interpolate({
    inputRange: [0, t(CROWNING.phases.awaken.start), t(CROWNING.phases.awaken.end), 1], outputRange: [80, 80, 0, 0],
  });
  const bossOpacity = clock.interpolate({
    inputRange: [0, t(CROWNING.phases.awaken.start), t(CROWNING.phases.awaken.end), 1],
    outputRange: [0, 0, CROWNING.silhouette.opacity, CROWNING.silhouette.opacity],
  });
  const dust = clock.interpolate({ inputRange: [0, t(1300), t(1900), 1], outputRange: [0, 0.9, 0, 0] });
  const dustScale = clock.interpolate({ inputRange: [0, t(1300), t(1900), 1], outputRange: [0.6, 0.8, 1.6, 1.6] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: reduced ? CROWNING.background.to : background }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Skip"
        onPress={() => { if (skippable && phase !== 'card') { clock.stopAnimation(); clock.setValue(1); setPhase('card'); } }} />
      <View style={styles.stage} pointerEvents="none">
        {/* The boss is a figure, never a surface: navy 70% with a white rim light. */}
        <Animated.View style={[styles.boss, { opacity: reduced ? CROWNING.silhouette.opacity : bossOpacity,
          transform: [{ translateY: reduced ? 0 : bossRise }] }]}>
          <Image source={bossArt} contentFit="contain" tintColor={CROWNING.silhouette.rimColor}
            style={[styles.bossImage, { transform: [{ scale: 1.04 }] }]} />
          <Image source={bossArt} contentFit="contain" tintColor={CROWNING.silhouette.fill}
            style={[styles.bossImage, StyleSheet.absoluteFill]} />
        </Animated.View>
        <View style={styles.coin}>
          <CoinUpgradeDemo level={10} coinUrl={coinUrl} size={132} showLabel={false} animate={!reduced} />
          <Animated.View style={[styles.dust, { opacity: reduced ? 0 : dust, transform: [{ scale: dustScale }] }]} />
          <Animated.View style={[styles.crown, { transform: reduced ? [] : [{ translateY: crownDrop }, { scaleY: crownScaleY }] }]}>
            <Image source={crownArt} contentFit="contain" style={{ width: 92, height: 88 }} />
          </Animated.View>
        </View>
      </View>
      {phase === 'card' && (
        <View style={styles.cardWrap}>
          <Ribbon text={copy.ribbon} />
          <View style={styles.card}>
            <Text style={styles.bossName}>{copy.bossName}</Text>
            {copy.hint && <Text style={styles.line}>{copy.hint}</Text>}
            {copy.groggy && <Text style={styles.groggy}>{copy.groggy}</Text>}
            <Text style={styles.line}>Your coin is Level 10 · Shark Crown</Text>
            <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
              <YellowButton text={copy.primary} onPress={() => (onFight && copy.secondary ? onFight() : onDone())} />
            </View>
            {SHARE_IN_MODALS && !!coinUrl && <FlexShareButton kind="crowned" payload={{ coinUrl }} surface="coin_sheet" size="md" style={{ marginTop: 10 }} />}
            {copy.secondary && (
              <TouchableOpacity accessibilityRole="button" onPress={onDone} style={{ paddingVertical: 10 }}>
                <Text style={styles.later}>{copy.secondary}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 200, alignItems: 'center', justifyContent: 'center', borderRadius: 20, overflow: 'hidden' },
  stage: { alignItems: 'center', justifyContent: 'center', height: 300, width: '100%' },
  boss: { position: 'absolute', top: 0, width: 260, height: 220 },
  bossImage: { width: 260, height: 220 },
  coin: { marginTop: 70, alignItems: 'center', justifyContent: 'center' },
  crown: { position: 'absolute', top: -58 },
  dust: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 6, borderColor: '#ffcf3b' },
  cardWrap: { width: '92%', alignItems: 'center', marginTop: 8 },
  card: { width: '95%', marginTop: -12, backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 3, borderColor: '#ffcf3b',
    paddingHorizontal: 16, paddingTop: 22, paddingBottom: 8, alignItems: 'center' },
  bossName: { fontFamily: 'Shark', fontSize: 22, color: '#05346e', textAlign: 'center' },
  line: { fontFamily: 'Knockout', fontSize: 15, color: '#19496b', textAlign: 'center', marginTop: 4 },
  groggy: { fontFamily: 'Shark', fontSize: 14, color: '#168052', marginTop: 6 },
  later: { fontFamily: 'Shark', fontSize: 15, color: '#075b9b', textDecorationLine: 'underline' },
});
