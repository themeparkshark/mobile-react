/**
 * WaitCard — compact top card for a LinePlay session.
 * Shows ride name, posted wait, elapsed time, and server-counted nearby time.
 * Park-themed art slot (image_url) with a graceful gradient fallback.
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, shadows } from '../../../design-system';
import type { PauseReason, WaitSource } from '../../../services/lineplay/LinePlaySession';
import { SoundEffectContext } from '../../../context/SoundEffectProvider';
import HapticPatterns from '../../../helpers/hapticPatterns';
import { partCountdown } from '../../../services/lineplay/partCountdown';

export interface WaitCardProps {
  readonly rideName: string;
  readonly postedWaitMinutes: number;
  readonly waitSource: WaitSource;
  readonly entranceWaitMinutes: number | null;
  readonly entranceWaitObservedAt: number | null;
  readonly entranceWaitChangeMinutes: number;
  readonly elapsedSeconds: number;
  readonly imageUrl?: string | null;
  readonly paused: boolean;
  readonly pauseReason: PauseReason | null;
  readonly onTogglePause: () => void;
  readonly rewardTrackingAvailable: boolean;
  readonly rewardUnavailable: boolean;
  readonly lineRewardsReady?: boolean;
  readonly verifiedEligibleSeconds: number;
  readonly verifiedPresenceAt: number | null;
  readonly creditedParts: number | null;
  readonly partsRemainingToday: number | null;
  readonly partIntervalSeconds: number;
  readonly sessionPartCap: number;
  readonly ticketIntervalSeconds: number;
  readonly ticketAvailable: boolean | null;
  readonly masteryBonusAvailable: boolean;
  readonly currentQuestBonusEnabled?: boolean;
  readonly currentQuestVerified?: boolean;
  readonly currentQuestProofPending?: boolean;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WaitCard({
  rideName,
  postedWaitMinutes,
  waitSource,
  entranceWaitMinutes,
  entranceWaitObservedAt,
  entranceWaitChangeMinutes,
  elapsedSeconds,
  imageUrl,
  paused,
  pauseReason,
  onTogglePause,
  rewardTrackingAvailable,
  rewardUnavailable,
  lineRewardsReady,
  verifiedEligibleSeconds,
  verifiedPresenceAt,
  creditedParts,
  partsRemainingToday,
  partIntervalSeconds,
  sessionPartCap,
  ticketIntervalSeconds,
  ticketAvailable,
  masteryBonusAvailable,
  currentQuestBonusEnabled = false,
  currentQuestVerified = false,
  currentQuestProofPending = false,
}: WaitCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [partBurst, setPartBurst] = useState(0);
  const previousCredited = useRef<number | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstScale = useRef(new Animated.Value(1)).current;
  const { playSound } = useContext(SoundEffectContext);
  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;
  useEffect(() => {
    if (creditedParts == null) return;
    const previous = previousCredited.current;
    previousCredited.current = creditedParts;
    if (previous == null || creditedParts <= previous) return;
    const earned = creditedParts - previous;
    setPartBurst(earned);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setPartBurst(0), 3500);
    void AccessibilityInfo.announceForAccessibility(`${earned} Ride Part${earned === 1 ? '' : 's'} earned and added to your wallet.`);
    HapticPatterns.collect('common');
    void playSoundRef.current?.(require('../../../../assets/sounds/pin_swap_confirm.mp3'));
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced) return;
      burstScale.setValue(0.82);
      Animated.spring(burstScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    }).catch(() => undefined);
  }, [creditedParts, burstScale]);
  useEffect(() => () => {
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstScale.stopAnimation();
  }, [burstScale]);
  const interval = Math.max(1, partIntervalSeconds);
  const countdown = partCountdown(verifiedEligibleSeconds, verifiedPresenceAt, Date.now(), interval);
  const potentialParts = Math.min(Math.floor(verifiedEligibleSeconds / interval), sessionPartCap);
  const atSessionCap = potentialParts >= sessionPartCap;
  const atDailyCap = partsRemainingToday === 0;
  const atCap = atSessionCap || atDailyCap;
  const earnedLabel = `${creditedParts ?? 0} earned Part${creditedParts === 1 ? '' : 's'}`;
  const nextPartLabel = `about ${fmt(countdown.remainingSeconds)} eligible time`;
  const entranceAgeMinutes = entranceWaitObservedAt == null ? null :
    Math.max(0, Math.floor((Date.now() - entranceWaitObservedAt) / 60_000));
  const entranceFresh = entranceAgeMinutes != null && entranceAgeMinutes < 10;
  return (
    <View style={styles.wrap}>
      <View style={styles.artWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.art} resizeMode="cover" />
        ) : (
          <Image source={require('../../../../assets/images/shark_background.png')}
            style={styles.art} resizeMode="cover" />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(10,22,40,0.9)']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.rideName} numberOfLines={1}>
          {rideName}
        </Text>

        <View style={styles.statsRow}>
          <Stat label="Start plan"
            value={`${postedWaitMinutes}m`} />
          <View style={styles.divider} />
          <Stat label="Elapsed" value={fmt(elapsedSeconds)} accent />
          <View style={styles.divider} />
          <Stat label="Eligible" value={rewardTrackingAvailable ? fmt(verifiedEligibleSeconds) : '—'} />
        </View>

        {rewardTrackingAvailable && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${atCap ? 100 : Math.round(countdown.progressSeconds / interval * 100)}%` }]} />
          </View>
        )}

        <Text style={styles.progressHint}>
          {paused ? `${pauseReason === 'manual' ? 'Games paused' : 'Line moving · games paused'}. Nearby time may still count.` :
            rewardTrackingAvailable
              ? creditedParts !== null
                ? atCap
                  ? `${earnedLabel} · ${atDailyCap ? 'park-day limit reached' : 'session limit reached'}`
                  : countdown.needsCheck
                    ? `${earnedLabel} · waiting for a fresh nearby check`
                  : countdown.checking
                    ? creditedParts === 0
                      ? 'First Part · checking nearby time'
                      : `${earnedLabel} · checking nearby time for next Part`
                  : creditedParts === 0
                    ? `First Part in ${nextPartLabel}`
                    : `${earnedLabel} · next in ${nextPartLabel}`
                : atSessionCap
                  ? `${potentialParts} potential Parts · session limit reached`
                  : countdown.needsCheck
                    ? `${potentialParts} potential Parts · waiting for a fresh nearby check`
                  : countdown.checking
                    ? `${potentialParts} potential Part${potentialParts === 1 ? '' : 's'} · checking nearby time`
                    : `${potentialParts} potential Part${potentialParts === 1 ? '' : 's'} · next in ${nextPartLabel}`
              : lineRewardsReady === false
                ? 'Ride rewards unavailable here · games still work'
                : rewardUnavailable
                  ? 'Ride rewards unavailable right now · games still work'
                  : 'Connecting rewards · games work while we retry'}
        </Text>
        {partBurst > 0 && <Animated.View style={[styles.partBurst, { transform: [{ scale: burstScale }] }]}>
          <Text style={styles.partBurstText}>✦ +{partBurst} PART{partBurst === 1 ? '' : 'S'} EARNED</Text>
        </Animated.View>}
        <View style={styles.actionRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide wait and reward details' : 'Show wait and reward details'}
            onPress={() => setExpanded(value => !value)} style={styles.detailsButton}>
            <Text style={styles.detailsButtonText}>{expanded ? 'HIDE DETAILS  ↑' : 'WAIT + REWARD DETAILS  ↓'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Resume queue games' : 'Pause queue games'}
            onPress={onTogglePause} style={styles.pauseButton}>
            <Text style={styles.pauseButtonText}>{paused ? 'RESUME' : 'PAUSE'}</Text>
          </Pressable>
        </View>
        {expanded && <>
          <Text style={styles.waitSourceHint}>
            {waitSource === 'posted' ? 'Start plan based on the entrance wait when you started.' :
              waitSource === 'last_known' ? 'Start plan based on an older entrance wait.' :
                'Activity plan only; no posted wait was available.'}
          </Text>
          {entranceWaitMinutes != null && entranceWaitObservedAt != null && (
            <Text style={styles.entranceHint}>
              {entranceFresh ? `Latest entrance board ${entranceWaitMinutes}m` :
                `Entrance board last seen ${entranceWaitMinutes}m · ${entranceAgeMinutes}m ago`}
              {entranceFresh && Math.abs(entranceWaitChangeMinutes) >= 5
                ? ` · ${entranceWaitChangeMinutes > 0 ? 'up' : 'down'} ${Math.abs(entranceWaitChangeMinutes)}m` : ''}
              {entranceFresh && entranceWaitChangeMinutes <= -5
                ? ' · try a quick round next' : ''}
              . This is not your remaining time.
            </Text>
          )}
          {rewardTrackingAvailable && <Text style={styles.waitSourceHint}>
            {creditedParts === null
              ? 'Parts are potential until the server confirms eligible time. Session and daily limits apply.'
              : 'Earned Parts are already in your wallet. Nearby time is verified by the server; session and park-day limits apply.'}
          </Text>}
          {rewardTrackingAvailable && masteryBonusAvailable && (
            <Text style={styles.ticketHint}>⭐ Coin mastery: your first verified Part here today earns +1 bonus Part.</Text>
          )}
          {rewardTrackingAvailable && currentQuestBonusEnabled && (
            <Text style={styles.ticketHint}>
              {currentQuestVerified
                ? '🦈 Current Quest verified. A bonus Part can settle after ten eligible minutes, subject to ride limits.'
                : currentQuestProofPending
                  ? '🦈 Current Quest played. Route verification is pending; no bonus is counted yet.'
                  : '🦈 Complete Current Quest for a possible bonus Part after ten eligible minutes.'}
            </Text>
          )}
          {rewardTrackingAvailable && ticketAvailable !== null && (
            <Text style={styles.ticketHint}>
              {ticketAvailable
                ? verifiedEligibleSeconds >= ticketIntervalSeconds
                  ? '🎫 Park Ticket ready when this verified session ends.'
                  : `🎫 A Park Ticket unlocks after ${fmt(ticketIntervalSeconds - verifiedEligibleSeconds)} more eligible time.`
                : '🎫 Ticket for this ride collected or park-day limit reached.'}
            </Text>
          )}
        </>}
      </View>
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: borderRadius.xxl,
    overflow: 'hidden',
    backgroundColor: '#0768b9',
    borderWidth: 3,
    borderColor: '#fff',
    ...shadows.lg,
  },
  artWrap: {
    height: 55,
  },
  art: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: -18,
  },
  rideName: {
    color: colors.textPrimary,
    fontFamily: 'Shark',
    fontSize: 23,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(0,74,145,0.58)',
    paddingVertical: 5,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: 'Knockout',
    fontSize: 21,
  },
  statValueAccent: {
    color: colors.tertiary,
  },
  statLabel: {
    color: '#d9f2ff',
    fontFamily: 'Knockout',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressTrack: {
    height: 5,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.75)',
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: '#ffca30',
  },
  progressHint: {
    color: '#e1f5ff',
    fontSize: 11,
    marginTop: 5,
  },
  partBurst: { alignSelf: 'stretch', marginTop: 7, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 2, borderColor: '#fff', backgroundColor: '#ffcb2e' },
  partBurstText: { color: '#073e87', fontFamily: 'Knockout', fontSize: 15,
    letterSpacing: 0.6, textAlign: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  detailsButton: { flex: 1, minHeight: 44, justifyContent: 'center' },
  detailsButtonText: { color: '#ffdc47', fontFamily: 'Knockout', fontSize: 13 },
  pauseButton: { minWidth: 72, minHeight: 44, borderRadius: 9, borderWidth: 1,
    borderColor: '#fff', backgroundColor: '#07599a', justifyContent: 'center', alignItems: 'center' },
  pauseButtonText: { color: '#fff', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.5 },
  waitSourceHint: { color: '#d4edff', fontSize: 11, marginTop: spacing.sm },
  entranceHint: { color: colors.textPrimary, fontSize: 11, marginTop: spacing.xs },
  ticketHint: {
    color: '#F4CD72',
    fontSize: 12,
    marginTop: spacing.sm,
  },
});
