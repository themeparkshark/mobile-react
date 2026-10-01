/**
 * WaitCoinHero: the body of the LinePlay wait screen (stream L2). The ride's
 * own coin sits center stage between two quiet stat columns:
 *
 *   SIGN SAYS 60          (coin, filling)         12
 *   You're tracking ~42                           SHARKS IN LINE
 *   IN LINE 23m                                   +3 PARTS
 *                                                 this wait
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
import { inLineLabel, partsThisWait, sharksInLine, waitCoinProgress, waitEstimate,
  waitStamps } from '../../../../services/lineplay/waitScreen';
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
  value: string; label: string; align: 'left' | 'right'; accessibilityLabel: string; icon?: 'timer' | 'parts' | 'queue';
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
  // Dev preview: a wait at a posted 60 that grows 10 minutes a step, with a filling Level 2 coin.
  const p: WaitCoinHeroProps = preview ? { ...props, waitScreen: previewWaitScreen(step), creditedParts: 1 + Math.min(3, step),
    elapsedSeconds: (20 + step * 12) * 60 + (props.elapsedSeconds % 60), plannedWaitMinutes: 60, waitSource: 'posted', playerEnergy: 120,
    rewardsOn: true } : props;
  return <WaitCoinHeroBody {...p} preview={preview} previewAutoLevel={preview && step >= 5} />;
}

function WaitCoinHeroBody({ rideId, waitScreen, creditedParts, bonusParts = 0, elapsedSeconds, plannedWaitMinutes, waitSource,
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
  const earned = partsThisWait(creditedParts, bonusParts);
  // The hour only changes the Night mark; read it once a minute, not per frame.
  const minute = Math.floor(elapsedSeconds / 60);
  const stamps = useMemo(() => waitStamps(elapsedSeconds, new Date().getHours()), [minute]);

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        <Stat align="left" value={estimate.posted != null ? String(estimate.posted) : '--'} label={estimate.posted != null ? 'SIGN SAYS (MIN)' : 'NO SIGN TIME'}
          accessibilityLabel={estimate.accessibilityLabel} icon="queue" />
        {estimate.posted != null && <Text style={styles.tracking} numberOfLines={2}>{estimate.detail}</Text>}
        <Stat align="left" value={inLineLabel(elapsedSeconds)} label="IN LINE"
          accessibilityLabel={`In line ${inLineLabel(elapsedSeconds)}.`} icon="timer" />
      </View>
      {rewardsOn ? (
        <WaitCoinStage size={coinSize} coin={wait.coin} owned={owned} progress={progress} partsBanked={wait.partsBanked}
          stamps={stamps} active={active} reducedMotion={reducedMotion} onLevelUp={wait.levelUp} onLeveled={onLeveled}
          autoLevel={previewAutoLevel} />
      ) : <View style={{ width: coinSize }} />}
      <View style={[styles.side, styles.sideRight]}>
        {sharks ? <Stat align="right" value={sharks.value} label={sharks.label}
          accessibilityLabel={sharks.accessibilityLabel} icon="queue" /> : <View style={styles.statSpacer} />}
        {rewardsOn && <Stat align="right" value={`+${earned}`} label={earned === 1 ? 'PART THIS WAIT' : 'PARTS THIS WAIT'}
          accessibilityLabel={`${earned} Ride Part${earned === 1 ? '' : 's'} earned this wait.`} icon="parts" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  side: { flex: 1, minWidth: 0, gap: 6 },
  sideRight: { alignItems: 'flex-end' },
  stat: { minWidth: 0 },
  statRight: { alignItems: 'flex-end' },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValueRowRight: { flexDirection: 'row-reverse' },
  statValue: { fontFamily: 'Shark', fontSize: 22, lineHeight: 26, color: '#ffffff', flexShrink: 1,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  statLabel: { fontFamily: 'Knockout', fontSize: 11, color: '#cdeaff', letterSpacing: 0.4, marginTop: -1 },
  textRight: { textAlign: 'right' },
  tracking: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 15, color: '#ffdf75', marginTop: -4 },
  statSpacer: { height: 36 },
});

export default memo(WaitCoinHero);
