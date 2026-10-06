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
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
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
import type { WaitCoinProgress, WaitStamp } from '../../../../services/lineplay/waitScreen';
import type { WaitCoin } from './useWaitScreenCoin';
import CoinFillRing from './CoinFillRing';
import WaitStampBadge from './WaitStampBadge';
import { isDimFlashingLightsEnabled } from '../../../../../modules/flash-safety';

export interface WaitCoinStageProps {
  readonly size: number;
  readonly coin: WaitCoin | null;
  /** The coin is not collected yet: a ghost that still banks Parts. */
  readonly owned: boolean;
  readonly progress: WaitCoinProgress;
  readonly partsBanked: number;
  readonly stamps: readonly WaitStamp[];
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly onLevelUp: () => Promise<{ success: boolean; unlocks?: unknown; xp?: number }>;
  /** After a confirmed level up (refresh Energy, etc). */
  readonly onLeveled?: () => void;
  /** Dev preview only: level up once, untouched, when ready. */
  readonly autoLevel?: boolean;
}

const LEVEL_SOUND = require('../../../../../assets/sounds/reward.mp3');

function WaitCoinStage({ size, coin, owned, progress, partsBanked, stamps, active, reducedMotion, onLevelUp,
  onLeveled, autoLevel = false }: WaitCoinStageProps) {
  const { playSound } = useContext(SoundEffectContext);
  const level = coin?.level ?? 1;
  const tier = coinTier(level);
  const coinSize = Math.round(size * 0.6);

  // A Part landed: spark the ring.
  const [landKey, setLandKey] = useState(0);
  const lastBanked = useRef<number | null>(null);
  useEffect(() => {
    const previous = lastBanked.current;
    lastBanked.current = partsBanked;
    if (previous == null || partsBanked <= previous) return;
    // The WaitCard already chimes and taps for a credited Part; the coin only sparks.
    setLandKey(key => key + 1);
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
  }, [coin, progress.ready, busy, reducedMotion, onLevelUp, onLeveled, playSound, scale]);

  const autoLeveled = useRef(false);
  useEffect(() => {
    if (!autoLevel || autoLeveled.current || !progress.ready) return;
    autoLeveled.current = true;
    void levelUp();
  }, [autoLevel, progress.ready]);

  const label = !owned ? 'Win this ride to collect its coin'
    : ribbon ?? error ?? (busy ? 'Leveling up…' : progress.label);
  const accessibility = owned
    ? `${coin?.rideName ?? 'Ride'} coin, Level ${level} ${tier.name}. ${progress.label}.`
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
        {owned && (
          <View style={[styles.levelPip, { borderColor: tier.ringDeep }]} pointerEvents="none">
            {level >= 10 ? <GameIcon name="crown" size={16} /> : <Text style={styles.levelPipText}>{level}</Text>}
          </View>
        )}
        {stamps.length > 0 && (
          <View style={styles.stamps} pointerEvents="none">
            {stamps.map(stamp => <WaitStampBadge key={stamp.kind} stamp={stamp} />)}
          </View>
        )}
      </Pressable>
      <View style={[styles.labelChip, progress.ready && owned && styles.labelChipReady, (ribbon != null) && styles.labelChipRibbon]}>
        {progress.ready && owned && !busy && !ribbon && <GameIcon name="sparkle" size={14} />}
        <Text style={[styles.labelText, ((progress.ready && owned) || ribbon != null) && styles.labelTextReady]} numberOfLines={1}
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
  levelPipText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 1 },
  stamps: { position: 'absolute', left: -14, top: 2, gap: 3, alignItems: 'flex-start' },
  labelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -6, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 12, backgroundColor: BRAND.navy, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', maxWidth: 190 },
  labelChipReady: { backgroundColor: BRAND.gold, borderColor: BRAND.navy },
  labelChipRibbon: { backgroundColor: '#ffffff', borderColor: BRAND.gold },
  labelText: { fontFamily: 'Knockout', fontSize: 13, color: '#ffffff', letterSpacing: 0.3 },
  labelTextReady: { color: BRAND.navy },
  crowningWrap: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: 'rgba(5,52,110,0.35)' },
});

export default memo(WaitCoinStage);
