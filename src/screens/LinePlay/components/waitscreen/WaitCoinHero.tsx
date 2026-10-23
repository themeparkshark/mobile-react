/**
 * WaitCoinHero: the body of the LinePlay wait screen (stream L2). The ride's
 * own coin sits center stage between two quiet stat columns:
 *
 *   60m  SIGN SAYS        (coin, filling)         12  SHARKS HERE
 *   23m  IN LINE          "2 of 4 Parts"
 *
 * Picture first for a 7-year-old: one wait number (the ride sign's, the one
 * they can see at the line) under the ride car, their own time under the
 * stopwatch, both written the same way ("60m", "23m"), one short word under
 * each number, one Parts idea
 * (the ring and its "2 of 4 Parts" chip; a new Part flies in as "+1 RIDE
 * PART!" above), and no fine print until Details is tapped. The real-waits
 * guess stays in the spoken label as "about 42".
 *
 * Everything here works offline: time in line runs on the phone clock, Parts
 * this wait come from the session, and the coin and wait ratio are the last
 * ones seen at this ride. "Sharks in line" hides when there is no fresh count.
 *
 * Owned by L2. L3's session start and hand-off overlay mount outside it.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../../ui/tokens';
import { GameIcon } from '../../../../ui';
import useReducedGameMotion from '../../../../hooks/useReducedGameMotion';
import type { LineWaitScreenSummary } from '../../../../api/endpoints/me/inline-timer/types';
import type { WaitSource } from '../../../../services/lineplay/LinePlaySession';
import { inLineLabel, sharksInLine, waitCoinProgress, waitEstimate, waitHeroLayout } from '../../../../services/lineplay/waitScreen';
import useWaitScreenCoin from './useWaitScreenCoin';
import WaitCoinStage from './WaitCoinStage';
import { previewWaitScreen, usePreviewStep, waitScreenPreviewEnabled } from './waitScreenPreview';

export interface WaitCoinHeroProps {
  readonly rideId: number;
  readonly waitScreen: LineWaitScreenSummary | null | undefined;
  readonly creditedParts: number | null;
  readonly bonusParts?: number;
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

function Stat({ value, label, align, accessibilityLabel, icon }: {
  value: string; label: string; align: 'left' | 'right'; accessibilityLabel: string; icon?: 'timer' | 'parts' | 'ride' | 'shark';
}) {
  return (
    <View style={[styles.stat, align === 'right' && styles.statRight]} accessible accessibilityLabel={accessibilityLabel}>
      <View style={[styles.statValueRow, align === 'right' && styles.statValueRowRight]}>
        {icon && <GameIcon name={icon} size={18} />}
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      </View>
      <Text style={[styles.statLabel, align === 'right' && styles.textRight]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function WaitCoinHero(props: WaitCoinHeroProps) {
  const preview = waitScreenPreviewEnabled();
  const step = usePreviewStep(preview);
  // Dev preview: a filling Level 2 coin. The sign time, the clock, the Parts and "earns Parts" come from the
  // screen (shownWait, shownClock, shownRewards), so the card and this body always agree.
  const p: WaitCoinHeroProps = preview ? { ...props, waitScreen: previewWaitScreen(step), playerEnergy: 120 } : props;
  return <WaitCoinHeroBody {...p} preview={preview} previewAutoLevel={preview && step >= 5} />;
}

function WaitCoinHeroBody({ rideId, waitScreen, creditedParts, elapsedSeconds, plannedWaitMinutes, waitSource,
  playerEnergy, covered, rewardsOn, onLeveled, coinSize = 120, preview = false, previewAutoLevel = false }:
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
  const estimate = waitEstimate({ postedMinutes: plannedWaitMinutes, waitSource, ratio: wait.waitRatio, elapsedSeconds });
  const sharks = sharksInLine(wait.inLineNow);

  // One wait number, or nothing when the ride has no sign time (time in line still shows).
  const signStat = estimate.kidValue != null ? <Stat align="left" value={estimate.kidValue} label="SIGN SAYS"
    accessibilityLabel={estimate.accessibilityLabel} icon="ride" /> : null;
  const inLineStat = <Stat align="left" value={inLineLabel(elapsedSeconds)} label="IN LINE"
    accessibilityLabel={`In line ${inLineLabel(elapsedSeconds)}.`} icon="timer" />;
  const sharksStat = sharks ? <Stat align="right" value={sharks.value} label={sharks.label}
    accessibilityLabel={sharks.accessibilityLabel} icon="shark" /> : null;

  // No server rewards: no coin, so no hole for one. One short row of stats.
  if (waitHeroLayout(rewardsOn) === 'strip') {
    return (
      <View style={styles.strip} testID="wait-hero-strip">
        {signStat && <View style={styles.stripCell}>{signStat}</View>}
        <View style={styles.stripCell}>{inLineStat}</View>
        {sharksStat && <View style={[styles.stripCell, styles.sideRight]}>{sharksStat}</View>}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {signStat}
        {inLineStat}
      </View>
      <WaitCoinStage size={coinSize} coin={wait.coin} owned={owned} progress={progress} partsBanked={wait.partsBanked}
        active={active} reducedMotion={reducedMotion} onLevelUp={wait.levelUp} onLeveled={onLeveled}
        autoLevel={previewAutoLevel} />
      <View style={[styles.side, styles.sideRight]}>
        {sharksStat}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  strip: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 6, marginBottom: 2 },
  stripCell: { flexShrink: 1, minWidth: 0 },
  side: { flex: 1, minWidth: 0, gap: 6 },
  sideRight: { alignItems: 'flex-end' },
  stat: { minWidth: 0 },
  statRight: { alignItems: 'flex-end' },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValueRowRight: { flexDirection: 'row-reverse' },
  statValue: { fontFamily: 'Shark', fontSize: 22, lineHeight: 26, color: '#ffffff', flexShrink: 1,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  statLabel: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff', letterSpacing: 0.4, marginTop: -1 },
  textRight: { textAlign: 'right' },
});

export default memo(WaitCoinHero);
