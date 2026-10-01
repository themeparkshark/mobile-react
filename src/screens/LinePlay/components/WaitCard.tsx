/**
 * WaitCard — compact top card for a LinePlay session.
 * Shows ride name, posted wait, elapsed time, and server-counted nearby time.
 * Park-themed art slot (image_url) with a graceful gradient fallback.
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, shadows } from '../../../design-system';
import type { PauseReason, WaitSource, RewardConnectionIssue } from '../../../services/lineplay/LinePlaySession';
import { SoundEffectContext } from '../../../context/SoundEffectProvider';
import HapticPatterns from '../../../helpers/hapticPatterns';
import { partCountdown } from '../../../services/lineplay/partCountdown';
import Svg, { Circle } from 'react-native-svg';
import { GameIcon, type GameIconName } from '../../../ui';

/** A detail line with its art, never an emoji. */
function HintLine({ icon, children }: { icon: GameIconName; children: string }) {
  return <View style={styles.hintLine}>
    <GameIcon name={icon} size={18} />
    <Text style={[styles.ticketHint, styles.hintLineText]}>{children}</Text>
  </View>;
}

const RING = 96;
const RING_STROKE = 10;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

export interface WaitCardProps {
  readonly rideName: string;
  /** Keep the current game in focus while its reward status stays visible. */
  readonly compact?: boolean;
  readonly postedWaitMinutes: number;
  readonly waitSource: WaitSource;
  readonly entranceWaitMinutes: number | null;
  readonly entranceWaitObservedAt: number | null;
  readonly entranceWaitChangeMinutes: number;
  readonly elapsedSeconds: number;
  readonly imageUrl?: string | null;
  readonly paused: boolean;
  readonly completed?: boolean;
  readonly pauseReason: PauseReason | null;
  readonly onTogglePause: () => void;
  readonly rewardTrackingAvailable: boolean;
  readonly rewardUnavailable: boolean;
  readonly rewardConnectionIssue?: RewardConnectionIssue | null;
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
  /** Opens the quick-game picker; omitted when no game is available. */
  readonly onPlayBonus?: () => void;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WaitCard({
  rideName,
  compact = false,
  postedWaitMinutes,
  waitSource,
  entranceWaitMinutes,
  entranceWaitObservedAt,
  entranceWaitChangeMinutes,
  elapsedSeconds,
  imageUrl,
  paused,
  completed = false,
  pauseReason,
  onTogglePause,
  rewardTrackingAvailable,
  rewardUnavailable,
  rewardConnectionIssue,
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
  onPlayBonus,
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
  const ringProgress = !rewardTrackingAvailable ? 0
    : atCap ? 1 : Math.max(0, Math.min(1, countdown.progressSeconds / interval));
  const earned = creditedParts ?? 0;
  // Games still work everywhere; say plainly when this ride pays no Parts.
  const noPartsHere = !completed && !rewardTrackingAvailable && (lineRewardsReady === false || rewardUnavailable);
  // One plain status line; the fine print lives behind the details toggle.
  const headline = completed ? 'Session complete' : paused
    ? 'Paused'
    : !rewardTrackingAvailable
      ? lineRewardsReady === false || rewardUnavailable ? 'PLAY ANYTIME'
        : rewardConnectionIssue === 'sign_in' ? 'Sign-in needed'
          : rewardConnectionIssue ? 'Games ready' : 'Checking location…'
      : atCap ? 'Max Parts reached'
        : countdown.needsCheck ? 'Checking you’re in line…'
          : countdown.checking ? 'Part on the way…'
            : fmt(countdown.remainingSeconds);
  const subline = completed ? 'Your game recap is ready below.' : paused
    ? pauseReason === 'manual' ? 'Time near the ride still counts. Tap play when you’re ready.' : 'Time near the ride still counts.'
    : !rewardTrackingAvailable
      ? lineRewardsReady === false || rewardUnavailable
        ? 'Ride Parts aren’t available at this ride right now.'
        : rewardConnectionIssue === 'nearby' ? 'Ride Parts start near this ride.'
          : rewardConnectionIssue === 'sign_in' ? 'Sign in again to earn Ride Parts.'
            : rewardConnectionIssue === 'network' ? 'Games work while we retry rewards.'
              : 'Play while we check your queue location.'
      : atCap
        ? atDailyCap ? 'You’ve earned today’s Parts for this ride.' : 'Session limit reached. Great wait!'
        : countdown.needsCheck ? 'Keep playing. Stay near the ride to keep earning.'
          : countdown.checking ? 'Keep playing. Your next check adds it.'
          : earned === 0 ? 'until your first Ride Part' : 'until your next Ride Part';

  return (
    <View style={styles.wrap}>
      <View style={styles.artWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.art} resizeMode="cover" />
        ) : (
          <Image source={require('../../../../assets/images/water_background.png')}
            style={styles.art} resizeMode="cover" />
        )}
        {/* Bright water, never a dark panel: the ride art only tints through. */}
        <LinearGradient colors={['rgba(38,178,240,0.86)', 'rgba(16,142,222,0.92)']} style={StyleSheet.absoluteFill} />
      </View>

      <View style={[styles.content, compact && styles.compactContent]}>
        <View style={styles.topRow}>
          <Text style={[styles.rideName, compact && styles.compactRideName]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{rideName}</Text>
          {compact && !completed && onPlayBonus && <Pressable accessibilityRole="button"
            accessibilityLabel={rewardTrackingAvailable ? 'Open queue games for bonus rewards' : 'Open queue games'}
            onPress={onPlayBonus} disabled={paused}
            style={({ pressed }) => [styles.compactArcade, paused && styles.playButtonDisabled, pressed && styles.playButtonPressed]}>
            <Text style={styles.compactArcadeText}>ARCADE</Text>
          </Pressable>}
          {!completed && <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Resume queue games' : 'Pause queue games'}
            onPress={onTogglePause} style={styles.pauseButton} hitSlop={8}>
            <GameIcon name={paused ? 'play' : 'pause'} size={40} />
          </Pressable>}
        </View>

        {compact ? <View style={styles.compactMeter}>
          {noPartsHere ? <GameIcon name="queue" size={34} />
            : <Image source={require('../../../../assets/images/ride-parts.png')} style={styles.compactGem} />}
          <View style={styles.compactCopy} accessible accessibilityLabel={`${earned} Ride Part${earned === 1 ? '' : 's'} earned. ${headline} ${subline}`}>
            <Text style={styles.compactHeadline}>{headline}{rewardTrackingAvailable ? ` · ${earned} Part${earned === 1 ? '' : 's'}` : ''}</Text>
            {noPartsHere && <Text style={styles.compactNote} numberOfLines={1}>No Parts at this ride</Text>}
            {partBurst > 0 && <Text style={styles.compactBurst}>+{partBurst} RIDE PART{partBurst === 1 ? '' : 'S'}!</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Hide wait and reward details' : 'Show wait and reward details'}
            onPress={() => setExpanded(value => !value)} style={styles.compactDetails}>
            <Text style={styles.detailsButtonText}>{expanded ? 'Hide' : 'Details'}</Text>
          </Pressable>
        </View> : <View style={styles.meterRow}>
          <View style={{ width: RING, height: RING }}
            accessible accessibilityLabel={`${earned} Ride Part${earned === 1 ? '' : 's'} earned. ${headline} ${subline}`}>
            <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
              <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(255,255,255,0.22)"
                strokeWidth={RING_STROKE} fill="none" />
              <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="#ffcf3b" strokeWidth={RING_STROKE}
                fill="none" strokeLinecap="round" strokeDasharray={`${RING_C} ${RING_C}`}
                strokeDashoffset={RING_C * (1 - ringProgress)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
            </Svg>
            <Animated.View style={[styles.gemWrap, { transform: [{ scale: burstScale }] }]}>
              <Image source={require('../../../../assets/images/ride-parts.png')} style={styles.gem} />
              <Text style={styles.gemCount}>{earned}</Text>
            </Animated.View>
          </View>
          <View style={styles.meterCopy}>
            <Text style={styles.meterHeadline} numberOfLines={1} adjustsFontSizeToFit>{headline}</Text>
            <Text style={styles.meterSub}>{subline}</Text>
            {partBurst > 0 && <Text style={styles.partBurstText}>+{partBurst} RIDE PART{partBurst === 1 ? '' : 'S'}!</Text>}
          </View>
        </View>}

        {!compact && !completed && onPlayBonus && (
          <Pressable accessibilityRole="button" accessibilityLabel={rewardTrackingAvailable ? "Open queue games for bonus rewards" : "Open queue games"}
            onPress={onPlayBonus} disabled={paused}
            style={({ pressed }) => [styles.playButton, paused && styles.playButtonDisabled, pressed && styles.playButtonPressed]}>
            <Text style={styles.playButtonText}>{rewardTrackingAvailable ? 'PLAY FOR BONUS' : 'QUEUE ARCADE'}</Text>
          </Pressable>
        )}

        {!compact && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide wait and reward details' : 'Show wait and reward details'}
          onPress={() => setExpanded(value => !value)} style={[styles.detailsButton, compact && styles.compactDetails]} hitSlop={6}>
          <Text style={styles.detailsButtonText}>{expanded ? 'Hide details' : `${completed ? 'Session' : rewardTrackingAvailable ? 'In line' : 'Playing'} ${fmt(elapsedSeconds)} · ${waitSource === 'estimate' ? 'game plan' : 'posted wait'} ${postedWaitMinutes}m · details`}</Text>
        </Pressable>}
        {expanded && <>
          {compact && <>
            <Text style={styles.meterSub}>{subline}</Text>
            <Text style={styles.waitSourceHint}>{`${completed ? 'Session' : rewardTrackingAvailable ? 'In line' : 'Playing'} ${fmt(elapsedSeconds)} · ${waitSource === 'estimate' ? 'game plan' : 'posted wait'} ${postedWaitMinutes}m`}</Text>
          </>}
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
              . This is not your remaining time.
            </Text>
          )}
          {rewardTrackingAvailable && <Text style={styles.waitSourceHint}>
            {`Verified time near the ride: ${fmt(verifiedEligibleSeconds)}. One Ride Part per ${Math.round(interval / 60)} minutes, up to ${sessionPartCap} per line.`}
          </Text>}
          {rewardTrackingAvailable && masteryBonusAvailable && (
            <HintLine icon="star">Coin mastery: your first Part here today earns +1 bonus Part.</HintLine>
          )}
          {rewardTrackingAvailable && currentQuestBonusEnabled && (
            <HintLine icon="shark">
              {currentQuestVerified ? 'Current Quest verified: bonus Part on the way.'
                : currentQuestProofPending ? 'Current Quest played. Checking your route.'
                  : 'Finish Current Quest for a bonus Part.'}
            </HintLine>
          )}
          {rewardTrackingAvailable && ticketAvailable !== null && (
            <HintLine icon="ticket">
              {ticketAvailable
                ? verifiedEligibleSeconds >= ticketIntervalSeconds
                  ? 'Park Ticket ready when this line ends.'
                  : `Park Ticket in ${fmt(ticketIntervalSeconds - verifiedEligibleSeconds)} more.`
                : 'Today’s Ticket for this ride is collected.'}
            </HintLine>
          )}
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactNote: { color: '#ffffff', fontFamily: 'Knockout', fontSize: 13, lineHeight: 16, marginTop: 1 },
  compactContent: { paddingTop: 6 },
  compactRideName: { fontSize: 19, lineHeight: 22, marginRight: 7 },
  compactMeter: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  compactGem: { width: 28, height: 28, resizeMode: 'contain' },
  compactCopy: { flex: 1 },
  compactHeadline: { fontFamily: 'Knockout', fontSize: 16, color: '#ffdf75' },
  compactBurst: { fontFamily: 'Knockout', fontSize: 13, color: '#7dffb0' },
  compactArcade: { minHeight: 44, paddingHorizontal: 10, marginRight: 7, borderRadius: 12, backgroundColor: '#ffcf3b', borderBottomWidth: 3, borderBottomColor: '#d99a00', justifyContent: 'center' },
  compactArcadeText: { fontFamily: 'Knockout', fontSize: 15, color: '#075083' },
  compactDetails: { minHeight: 44, minWidth: 58, justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 14 },
  gemWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  gem: { width: 44, height: 44, resizeMode: 'contain' },
  gemCount: {
    position: 'absolute', bottom: 10, fontFamily: 'Shark', fontSize: 18, color: '#fff',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  meterCopy: { flex: 1 },
  meterHeadline: { fontFamily: 'Shark', fontSize: 32, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  meterSub: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', marginTop: 2 },
  playButton: {
    marginTop: 10, backgroundColor: '#ffcf3b', borderRadius: 16, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 5, borderBottomColor: '#d99a00',
  },
  playButtonPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  playButtonDisabled: { opacity: 0.5 },
  playButtonText: { fontFamily: 'Shark', fontSize: 21, color: '#075083' },
  wrap: {
    borderRadius: borderRadius.xxl,
    overflow: 'hidden',
    backgroundColor: '#0768b9',
    borderWidth: 3,
    borderColor: '#fff',
    ...shadows.lg,
  },
  artWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  art: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 4,
  },
  rideName: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: 'Shark',
    fontSize: 22,
    lineHeight: 25,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  partBurstText: { color: '#7dffb0', fontFamily: 'Shark', fontSize: 18, marginTop: 4 },
  detailsButton: { minHeight: 34, justifyContent: 'center', alignItems: 'center' },
  detailsButtonText: { color: '#cdeaff', fontFamily: 'Knockout', fontSize: 14 },
  pauseButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  hintLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  hintLineText: { marginTop: 0, flexShrink: 1 },
  waitSourceHint: { color: '#d4edff', fontFamily: 'Knockout', fontSize: 11, marginTop: spacing.sm },
  entranceHint: { color: colors.textPrimary, fontFamily: 'Knockout', fontSize: 11, marginTop: spacing.xs },
  ticketHint: {
    color: '#F4CD72',
    fontFamily: 'Knockout',
    fontSize: 12,
    marginTop: spacing.sm,
  },
});
