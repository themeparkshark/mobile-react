/**
 * WaitCoinStage: the ride's own coin, center stage on the LinePlay wait
 * screen. The Skia ring fills one notch per Part; each Part that lands sparks
 * at the fill head (the WaitCard above already plays the Part chime and tap).
 *
 * When Parts and Energy cover the next level, the rim lights up and the coin
 * offers a one-tap level up right here: the charge (rim spin, Light/Medium/
 * Heavy ticks), the existing progression v2 burst (glow Lv2-5, capped flash
 * and shatter Lv6+) and the ShelfCoin ignite. Level 10 hands the screen to the
 * Crowning through the PresentationQueue. In-line level-ups never enter that
 * queue (they are not full-screen); only the Crowning does.
 */
import { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import ShelfCoin from '../../../../components/collection/ShelfCoin';
import LevelUpBurst from '../../../../components/coin/LevelUpBurst';
import Crowning from '../../../../components/coin/Crowning';
import { levelRibbon, levelUpFx, type LevelUpFx } from '../../../../components/coin/progressionModel';
import { coinTier } from '../../../../constants/coinTiers';
import { queueHaptic } from '../../../../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../../../../audio/sfxLimiter';
import { usePresentationSlot } from '../../../../hooks/usePresentationQueue';
import { SoundEffectContext } from '../../../../context/SoundEffectProvider';
import { GameIcon } from '../../../../ui';
import { BRAND } from '../../../../ui/tokens';
import type { WaitCoinProgress } from '../../../../services/lineplay/waitScreen';
import type { WaitCoin } from './useWaitScreenCoin';
import CoinFillRing from './CoinFillRing';
import { coinLevelMarker, markWaitPartLanded, rememberWaitLevel, waitLevelMark, type WaitKey } from '../../../../services/lineplay/waitLevelMemory';
import { isDimFlashingLightsEnabled } from '../../../../../modules/flash-safety';

export interface WaitCoinStageProps {
  readonly size: number;
  readonly coin: WaitCoin | null;
  /** The coin is not collected yet: a ghost that still banks Parts. */
  readonly owned: boolean;
  readonly progress: WaitCoinProgress;
  readonly partsBanked: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly onLevelUp: () => Promise<{ success: boolean; unlocks?: unknown; xp?: number }>;
  /** After a confirmed level up (refresh Energy, etc). */
  readonly onLeveled?: () => void;
  /** Dev preview only: level up once, untouched, when ready. */
  readonly autoLevel?: boolean;
  /** This wait (the session's start time): a level reached in it survives leaving and coming back. */
  readonly waitKey?: WaitKey | null;
}

const LEVEL_SOUND = require('../../../../../assets/sounds/reward.mp3');

function WaitCoinStage({ size, coin, owned, progress, partsBanked, active, reducedMotion, onLevelUp,
  onLeveled, autoLevel = false, waitKey = null }: WaitCoinStageProps) {
  const { playSound } = useContext(SoundEffectContext);
  const level = coin?.level ?? 1;
  const tier = coinTier(level);
  const coinSize = Math.round(size * 0.6);

  // A level reached this wait stays on the coin for the rest of the wait (kept outside this
  // component, so leaving LinePlay and coming back still shows it): after the Parts are spent
  // an empty ring never looks like "nothing earned in 90 minutes".
  const coinId = coin?.id ?? null;
  const [levelMark, setLevelMark] = useState(() => waitLevelMark(waitKey, coinId));
  useEffect(() => { setLevelMark(waitLevelMark(waitKey, coinId)); }, [waitKey, coinId]);
  const leveledTo = levelMark?.level ?? null;

  // A Part landed: spark the ring.
  const [landKey, setLandKey] = useState(0);
  const lastBanked = useRef<number | null>(null);
  useEffect(() => {
    const previous = lastBanked.current;
    lastBanked.current = partsBanked;
    if (previous == null || partsBanked <= previous) return;
    // The WaitCard already chimes and taps for a credited Part; the coin only sparks.
    setLandKey(key => key + 1);
    // The first new Part after a level up: the coin swaps "LEVEL 3!" for its next goal.
    if (levelMark && !levelMark.partLanded) setLevelMark(markWaitPartLanded(waitKey, coinId));
  }, [partsBanked]);

  // Ready to level: one Medium tap the moment it fills, never on every render.
  const wasReady = useRef(progress.ready);
  useEffect(() => {
    if (progress.ready && !wasReady.current && active) {
      queueHaptic('hitMedium');
      void AccessibilityInfo.announceForAccessibility('Your coin is ready to level up.');
    }
    wasReady.current = progress.ready;
  }, [progress.ready]);

  const [busy, setBusy] = useState(false);
  const [chargeKey, setChargeKey] = useState(0);
  const [burst, setBurst] = useState<{ fx: LevelUpFx; key: number } | null>(null);
  const [igniteKey, setIgniteKey] = useState(0);
  const [ribbon, setRibbon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crowningId, setCrowningId] = useState<string | null>(null);
  const crowning = usePresentationSlot(crowningId, 'crowning', 'coin_shelf');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const scale = useSharedValue(1);
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const levelUp = useCallback(async () => {
    if (!coin || !progress.ready || busy) return;
    setBusy(true);
    setError(null);
    const target = coin.level + 1;
    const plan = levelUpFx(target, coin.partsToNext, { reducedMotion, dimFlashingLights: isDimFlashingLightsEnabled() });
    setChargeKey(key => key + 1);
    if (!reducedMotion) scale.value = withTiming(1.12, { duration: 900 });
    plan.haptics.filter(tick => tick.intent !== 'success')
      .forEach(tick => timers.current.push(setTimeout(() => queueHaptic(tick.intent), tick.at)));
    const charged = new Promise<void>(resolve => { timers.current.push(setTimeout(resolve, reducedMotion ? 0 : 900)); });
    try {
      const [result] = await Promise.all([onLevelUp(), charged]);
      if (!result.success) throw new Error('Level up failed');
      queueHaptic('success');
      playLimited('coin-level-up', { priority: SFX_PRIORITY.land, durationMs: 900 }, () => { playSound?.(LEVEL_SOUND); });
      setBurst(current => ({ fx: plan, key: (current?.key ?? 0) + 1 }));
      setIgniteKey(key => key + 1);
      setRibbon(levelRibbon(target));
      setLevelMark(rememberWaitLevel(waitKey ?? 'wait', coin.id, target));
      timers.current.push(setTimeout(() => setRibbon(null), 2600));
      scale.value = reducedMotion ? 1 : withSequence(withTiming(0.86, { duration: 90 }), withSpring(1, { damping: 6, stiffness: 240 }));
      void AccessibilityInfo.announceForAccessibility(`Coin leveled up. ${levelRibbon(target)}.`);
      if (plan.crowning) setCrowningId(`crowning:wait:${coin.id}:${Date.now()}`);
      onLeveled?.();
    } catch (caught) {
      scale.value = withTiming(1, { duration: 160 });
      queueHaptic('failBuzz');
      const status = (caught as { response?: { status?: number } })?.response?.status;
      setError(status === 409 ? 'This coin changed. Open your shelf to refresh it.' : 'Could not level up. Check your internet and try again.');
      timers.current.push(setTimeout(() => setError(null), 3500));
    } finally {
      setBusy(false);
    }
  }, [coin, progress.ready, busy, reducedMotion, onLevelUp, onLeveled, playSound, scale, waitKey]);

  const autoLeveled = useRef(false);
  useEffect(() => {
    if (!autoLevel || autoLeveled.current || !progress.ready) return;
    autoLeveled.current = true;
    void levelUp();
  }, [autoLevel, progress.ready]);

  const marker = coinLevelMarker(levelMark, progress.goalLevel);
  const label = !owned ? 'Win this ride to collect its coin'
    : ribbon ?? error ?? (busy ? 'Leveling up…' : progress.chip);
  /** The plain "2 of 4" count: the Parts gem beside it says what is counted. */
  const showCount = owned && !ribbon && !error && !busy && !progress.ready && !progress.partsReady && !progress.maxed;
  const accessibility = owned
    ? `${coin?.rideName ?? 'Ride'} coin, Level ${level} ${tier.name}. ${leveledTo != null ? `You leveled it up to Level ${leveledTo} this wait. ` : ''}${progress.label}.`
    : 'This ride coin is not collected yet. Parts you earn here wait for it.';

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable onPress={levelUp} disabled={!progress.ready || busy || !owned}
        accessibilityRole={progress.ready ? 'button' : 'image'} accessibilityLabel={accessibility}
        accessibilityHint={progress.ready ? 'Levels up this coin with your Parts and Energy.' : undefined}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <CoinFillRing size={size} level={level} fill={owned ? progress.fill : Math.min(1, progress.fill)}
            notches={progress.notches} ready={owned && progress.ready} maxed={owned && progress.maxed}
            landKey={landKey} chargeKey={chargeKey} active={active} reducedMotion={reducedMotion} ghost={!owned && partsBanked === 0} />
        </View>
        <Animated.View style={[{ width: coinSize, height: coinSize }, coinStyle]} pointerEvents="none">
          {owned && coin ? (
            <ShelfCoin coinUrl={coin.coinUrl} level={level} size={coinSize} igniteKey={igniteKey} />
          ) : (
            <View style={[styles.ghost, { width: coinSize, height: coinSize, borderRadius: coinSize / 2 }]}>
              <GameIcon name="coin" size={coinSize * 0.5} />
            </View>
          )}
          {burst && <LevelUpBurst fx={burst.fx} size={coinSize} playKey={burst.key} />}
        </Animated.View>
        {/* One level marker at a time. The ring's goal (an up arrow and "3") is where this fill is going,
            so the chip under the coin only has to say "2 of 4". Right after a level up the coin wears
            "LEVEL 3!" instead until the next Part lands. Max level shows the crown there. */}
        {owned && marker === 'goal' && progress.goalLevel != null && (
          <View style={styles.goalPip} pointerEvents="none">
            <View style={styles.goalArrow}><GameIcon name="arrow" size={11} /></View>
            <Text style={styles.goalText}>{progress.goalLevel}</Text>
          </View>
        )}
        {owned && marker === 'ribbon' && leveledTo != null && (
          <Animated.View entering={reducedMotion ? undefined : ZoomIn.springify().damping(12)} style={styles.leveledRibbon}
            pointerEvents="none">
            <GameIcon name="star" size={13} />
            <Text style={styles.leveledText}>LEVEL {leveledTo}!</Text>
          </Animated.View>
        )}
        {owned && level >= 10 && (
          <View style={[styles.levelPip, { borderColor: tier.ringDeep }]} pointerEvents="none">
            <GameIcon name="crown" size={16} />
          </View>
        )}
      </Pressable>
      <View style={[styles.labelChip, progress.ready && owned && styles.labelChipReady, (ribbon != null) && styles.labelChipRibbon]}>
        {progress.ready && owned && !busy && !ribbon && <GameIcon name="sparkle" size={14} />}
        {showCount && <GameIcon name="parts" size={17} />}
        <Text style={[styles.labelText, showCount && styles.labelTextCount,
          ((progress.ready && owned) || ribbon != null) && styles.labelTextReady]} numberOfLines={1}
          adjustsFontSizeToFit minimumFontScale={0.8}>
          {progress.ready && owned && !busy && !ribbon && !error ? 'TAP TO LEVEL UP' : label}
        </Text>
      </View>
      {crowningId && coin && (
        <Modal visible={crowning.visible} transparent animationType="fade" onRequestClose={() => { crowning.done(); setCrowningId(null); }}>
          <View style={styles.crowningWrap}>
            <Crowning rideName={coin.rideName} coinUrl={coin.coinUrl} boss={coin.boss ?? null} reduced={reducedMotion}
              inPerson playSound={source => { playSound?.(source); }}
              onDone={() => { crowning.done(); setCrowningId(null); }} />
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ghost: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(5,52,110,0.25)' },
  levelPip: { position: 'absolute', right: '12%', bottom: '12%', minWidth: 26, height: 26, borderRadius: 13,
    paddingHorizontal: 5, backgroundColor: BRAND.white, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  labelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -6, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 12, backgroundColor: BRAND.navy, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', maxWidth: 190 },
  labelChipReady: { backgroundColor: BRAND.gold, borderColor: BRAND.navy },
  labelChipRibbon: { backgroundColor: '#ffffff', borderColor: BRAND.gold },
  labelText: { fontFamily: 'Knockout', fontSize: 13, color: '#ffffff', letterSpacing: 0.3 },
  labelTextReady: { color: BRAND.navy },
  labelTextCount: { fontSize: 15, letterSpacing: 0.4 },
  goalPip: { position: 'absolute', right: -6, bottom: '9%', flexDirection: 'row', alignItems: 'center', gap: 1,
    paddingLeft: 3, paddingRight: 5, height: 20, borderRadius: 10, backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy },
  goalArrow: { transform: [{ rotate: '-90deg' }] },
  // The card's number font: its 1 has a flag, so "10" never reads "IO".
  goalText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 1 },
  leveledRibbon: { position: 'absolute', top: -9, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 2, borderColor: BRAND.gold },
  leveledText: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navy, letterSpacing: 0.3 },
  crowningWrap: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: 'rgba(5,52,110,0.35)' },
});

export default memo(WaitCoinStage);
