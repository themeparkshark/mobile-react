/**
 * WaitCoinHero: the body of the LinePlay wait screen (stream L2): the ride's own coin, centered, in its
 * filling ring. Kid clarity (wave 6): one coin picture, one progress ring, and the card's one sentence under
 * it ("4:12 until your next Ride Part"). The sign's time and your own time in line are said once, in
 * Details, with their pictures; the coin's spoken label names its level and Parts.
 *
 * Everything here works offline: Parts this wait come from the session, and the coin is the last one seen
 * at this ride. With no server rewards there is no coin and this renders nothing.
 *
 * Owned by L2. L3's session start and hand-off overlay mount outside it.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import useReducedGameMotion from '../../../../hooks/useReducedGameMotion';
import type { LineWaitScreenSummary } from '../../../../api/endpoints/me/inline-timer/types';
import type { WaitSource } from '../../../../services/lineplay/LinePlaySession';
import { waitCoinProgress, waitHeroLayout } from '../../../../services/lineplay/waitScreen';
import useWaitScreenCoin from './useWaitScreenCoin';
import WaitCoinStage from './WaitCoinStage';
import { previewWaitScreen, usePreviewStep, waitScreenPreviewEnabled } from './waitScreenPreview';

export interface WaitCoinHeroProps {
  readonly rideId: number;
  readonly waitScreen: LineWaitScreenSummary | null | undefined;
  readonly creditedParts: number | null;
  readonly bonusParts?: number;
  /** Kept for callers (the preview and the card pass them); the closed card shows them only in Details now. */
  readonly elapsedSeconds: number;
  readonly plannedWaitMinutes: number;
  readonly waitSource: WaitSource;
  readonly playerEnergy: number | null;
  /** A game covers the screen: loops rest. */
  readonly covered: boolean;
  /** Ride Parts are tracked for this session. */
  readonly rewardsOn: boolean;
  readonly onLeveled?: () => void;
  readonly coinSize?: number;
  /** This wait (the session's start time): a level reached in it survives leaving LinePlay and coming back. */
  readonly waitKey?: number | string | null;
}

/** True while the app is in the foreground. */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function WaitCoinHero(props: WaitCoinHeroProps) {
  const preview = waitScreenPreviewEnabled();
  const step = usePreviewStep(preview);
  // Dev preview: a filling Level 2 coin. The sign time, the clock, the Parts and "earns Parts" come from the
  // screen (shownWait, shownClock, shownRewards), so the card and this body always agree.
  const p: WaitCoinHeroProps = preview ? { ...props, waitScreen: previewWaitScreen(step), playerEnergy: 120 } : props;
  return <WaitCoinHeroBody {...p} preview={preview} previewAutoLevel={preview && step >= 5} />;
}

function WaitCoinHeroBody({ rideId, waitScreen, creditedParts,
  playerEnergy, covered, rewardsOn, onLeveled, coinSize = 120, waitKey = null, preview = false, previewAutoLevel = false }:
  WaitCoinHeroProps & { preview?: boolean; previewAutoLevel?: boolean }) {
  const appActive = useAppActive();
  const reducedMotion = useReducedGameMotion();
  const active = appActive && !covered;
  const wait = useWaitScreenCoin({ rideId, waitScreen, creditedParts, enabled: rewardsOn, preview });
  const owned = wait.status === 'owned' && wait.coin != null;
  const progress = useMemo(() => waitCoinProgress({
    level: wait.coin?.level ?? 1,
    maxLevel: wait.coin?.maxLevel ?? 10,
    partsBanked: wait.partsBanked,
    partsToNext: wait.coin?.partsToNext ?? 2,
    energyToNext: wait.coin?.energyToNext ?? 0,
    playerEnergy,
    nextTierName: wait.coin?.nextTierName ?? null,
  }), [wait.coin, wait.partsBanked, playerEnergy]);

  // One coin picture, one progress ring and one sentence (kid clarity, wave 6): no stat columns beside the
  // coin (the old card had seven labels an 8-year-old could not read). The sign's time and your time in
  // line live in Details (WaitCard heroDetailLines), said once, with their pictures.

  // No server rewards: no coin and nothing else to show here (the card's one sentence says it).
  if (waitHeroLayout(rewardsOn) === 'strip') return null;

  return (
    <View style={styles.row} testID="wait-hero-coin">
      <WaitCoinStage size={coinSize} coin={wait.coin} owned={owned} progress={progress} partsBanked={wait.partsBanked}
        active={active} reducedMotion={reducedMotion} onLevelUp={wait.levelUp} onLeveled={onLeveled}
        autoLevel={previewAutoLevel} waitKey={waitKey} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
});

export default memo(WaitCoinHero);
