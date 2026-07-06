/**
 * LinePlayScreen — the in-queue session UI.
 *
 * Layout (portrait, one-thumb):
 *   - Top: compact WaitCard (ride name, posted wait, elapsed, accrual, art).
 *   - Bottom: horizontal activity carousel (one activity per page).
 *   - Pause sheet when the line is moving (auto) or user pauses (manual).
 *   - "Line's moving 🚶" toast when auto-paused.
 *   - Session recap card on complete (time survived, activities, earned).
 *
 * Notably: NO keep-awake (games/queue must be battery-light and the timer is
 * server-side). The session controller lives in useLinePlaySession, which feeds
 * the shared LocationContext stream in for auto-pause — no new GPS watcher.
 *
 * Route params: { ride: RideContext }. Wire via Root.tsx Stack.Screen "LinePlay".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors, spacing, borderRadius, shadows } from '../../design-system';
import { useLinePlaySession } from '../../services/lineplay/useLinePlaySession';
import type { RideContext, ActivityItem } from '../../services/lineplay/LinePlaySession';
import {
  PredictionCard,
  PredictionResolution,
  resolvePrediction,
} from '../../services/lineplay/content';
import WaitCard from './components/WaitCard';
import ActivitySlot from './components/ActivitySlot';

const { width: SCREEN_W } = Dimensions.get('window');

export default function LinePlayScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const ride: RideContext | undefined = route.params?.ride;

  const { session, snapshot } = useLinePlaySession();
  const [prediction, setPrediction] = useState<{ card: PredictionCard; guess: 'beat' | 'miss' } | null>(null);
  const startedRef = useRef(false);
  const prevPausedRef = useRef(false);

  // Start the session once, on mount, if we have a ride.
  useEffect(() => {
    if (!ride || startedRef.current) return;
    startedRef.current = true;
    void session.start(ride);
  }, [ride, session]);

  // Haptic on transition into paused (line moving).
  useEffect(() => {
    const nowPaused = snapshot.state === 'paused';
    if (nowPaused && !prevPausedRef.current) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    prevPausedRef.current = nowPaused;
  }, [snapshot.state]);

  const handlePredict = useCallback((card: PredictionCard, guess: 'beat' | 'miss') => {
    setPrediction({ card, guess });
    void Haptics.selectionAsync();
  }, []);

  const handlePlayGame = useCallback((_item: Extract<ActivityItem, { kind: 'minigame' }>) => {
    // Wave 2 wires the real game mount here. For now this is a no-op stub so
    // the slot is interactive without a dependency on the game engine.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleEndSession = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    session.beginEnding();
  }, [session]);

  const handleExit = useCallback(() => {
    session.reset();
    navigation.goBack();
  }, [navigation, session]);

  if (!ride) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>No ride selected for this session.</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const resolution: PredictionResolution | null =
    snapshot.state === 'complete' && prediction
      ? resolvePrediction(prediction.card, prediction.guess, snapshot.elapsedSeconds / 60)
      : null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[colors.bgDark, colors.bgMedium]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleExit} hitSlop={12} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>×</Text>
          </Pressable>
          <Text style={styles.headerTitle}>LINE SESSION</Text>
          {snapshot.state === 'active' || snapshot.state === 'paused' ? (
            <Pressable onPress={handleEndSession} hitSlop={12} style={styles.endBtn}>
              <Text style={styles.endBtnText}>End</Text>
            </Pressable>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        {/* Wait card (top) */}
        <View style={styles.waitWrap}>
          {snapshot.startedAt == null ? (
            <WaitCardSkeleton />
          ) : (
            <WaitCard
              rideName={ride.rideName}
              postedWaitMinutes={snapshot.plannedWaitMinutes}
              elapsedSeconds={snapshot.elapsedSeconds}
              accrual={snapshot.accrual}
              imageUrl={ride.imageUrl}
              paused={snapshot.state === 'paused'}
            />
          )}
        </View>

        {/* Activity area (bottom) */}
        <View style={styles.activityArea}>
          {snapshot.state === 'complete' ? (
            <SessionRecap
              elapsedSeconds={snapshot.elapsedSeconds}
              activityCount={snapshot.playlist.length}
              earnedEnergy={snapshot.rewards?.bonusEnergy ?? snapshot.accrual.estimatedEnergy}
              experience={snapshot.rewards?.experience ?? 0}
              partsCount={
                snapshot.rewards?.rideParts.reduce((n, p) => n + p.quantity, 0) ?? 0
              }
              rewardsPending={snapshot.rewardsPending}
              resolution={resolution}
              onDone={handleExit}
            />
          ) : snapshot.playlist.length === 0 ? (
            <ActivitySkeleton />
          ) : (
            <FlatList
              data={snapshot.playlist}
              keyExtractor={(it) => it.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.page}>
                  <ActivitySlot
                    item={item}
                    rideId={ride.rideId}
                    parkId={ride.parkId}
                    onPlayGame={handlePlayGame}
                    onPredict={handlePredict}
                  />
                </View>
              )}
            />
          )}
        </View>
      </SafeAreaView>

      {/* Auto-pause toast */}
      {snapshot.state === 'paused' && snapshot.pauseReason === 'lineMoving' && (
        <LineMovingToast onResume={() => session.resume()} />
      )}

      {/* Ending grace bar */}
      {snapshot.state === 'ending' && (
        <EndingBar
          graceMsRemaining={snapshot.graceMsRemaining}
          onUndo={() => session.undoEnd()}
          onEndNow={() => void session.complete()}
        />
      )}
    </View>
  );
}

// -- toast -------------------------------------------------------------------

function LineMovingToast({ onResume }: { onResume: () => void }) {
  const walk = useSharedValue(0);
  useEffect(() => {
    walk.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [walk]);
  const walkStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: walk.value * 6 }],
  }));

  return (
    <View style={styles.toastWrap} pointerEvents="box-none">
      <View style={styles.toast}>
        <Animated.Text style={[styles.toastEmoji, walkStyle]}>🚶</Animated.Text>
        <Text style={styles.toastText}>Line&apos;s moving! Games paused</Text>
        <Pressable onPress={onResume} style={styles.toastBtn} hitSlop={8}>
          <Text style={styles.toastBtnText}>Resume</Text>
        </Pressable>
      </View>
    </View>
  );
}

// -- ending grace bar --------------------------------------------------------

function EndingBar({
  graceMsRemaining,
  onUndo,
  onEndNow,
}: {
  graceMsRemaining: number;
  onUndo: () => void;
  onEndNow: () => void;
}) {
  const secs = Math.ceil(graceMsRemaining / 1000);
  return (
    <View style={styles.endingWrap} pointerEvents="box-none">
      <View style={styles.endingBar}>
        <Text style={styles.endingText}>Ending session in {secs}s</Text>
        <View style={styles.endingBtns}>
          <Pressable onPress={onUndo} style={styles.endingUndo} hitSlop={8}>
            <Text style={styles.endingUndoText}>Undo</Text>
          </Pressable>
          <Pressable onPress={onEndNow} style={styles.endingNow} hitSlop={8}>
            <Text style={styles.endingNowText}>End now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// -- recap -------------------------------------------------------------------

function SessionRecap({
  elapsedSeconds,
  activityCount,
  earnedEnergy,
  experience,
  partsCount,
  rewardsPending,
  resolution,
  onDone,
}: {
  elapsedSeconds: number;
  activityCount: number;
  earnedEnergy: number;
  experience: number;
  partsCount: number;
  rewardsPending: boolean;
  resolution: PredictionResolution | null;
  onDone: () => void;
}) {
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;

  return (
    <View style={styles.recapCard}>
      <Text style={styles.recapKicker}>SESSION COMPLETE</Text>
      <Text style={styles.recapTime}>
        {mins}m {secs}s
      </Text>
      <Text style={styles.recapSub}>survived in line</Text>

      <View style={styles.recapStats}>
        <RecapStat value={String(activityCount)} label="activities" />
        <RecapStat value={`+${earnedEnergy}⚡`} label="energy" />
        <RecapStat value={`+${experience}`} label="xp" />
        <RecapStat value={String(partsCount)} label="parts" />
      </View>

      {resolution && (
        <View style={styles.recapPrediction}>
          <Text style={styles.recapPredictionText}>
            {resolution.correct ? '🎯 Nailed the prediction!' : '🤏 Prediction missed.'}
            {'  '}
            {resolution.beat
              ? `You beat the posted wait by ${Math.max(0, Math.round(resolution.postedWaitMinutes - resolution.actualWaitMinutes))}m.`
              : `The line held near the posted ${resolution.postedWaitMinutes}m.`}
          </Text>
        </View>
      )}

      {rewardsPending && (
        <Text style={styles.recapPending}>Rewards will sync when you&apos;re back online.</Text>
      )}

      <Pressable onPress={onDone} style={styles.recapBtn}>
        <Text style={styles.recapBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

function RecapStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.recapStat}>
      <Text style={styles.recapStatValue}>{value}</Text>
      <Text style={styles.recapStatLabel}>{label}</Text>
    </View>
  );
}

// -- skeletons ---------------------------------------------------------------

function WaitCardSkeleton() {
  return <View style={styles.waitSkeleton} />;
}

function ActivitySkeleton() {
  return (
    <View style={styles.page}>
      <View style={styles.activitySkeleton} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgDark },
  safe: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { color: colors.textPrimary, fontSize: 26, lineHeight: 26 },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  endBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  endBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  waitWrap: { paddingHorizontal: spacing.lg },
  activityArea: { flex: 1, marginTop: spacing.lg },
  page: {
    width: SCREEN_W,
    paddingHorizontal: spacing.lg,
  },
  waitSkeleton: {
    height: 200,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.bgMedium,
    opacity: 0.6,
  },
  activitySkeleton: {
    minHeight: 220,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.bgMedium,
    opacity: 0.5,
  },
  ghostBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  ghostBtnText: { color: colors.secondary, fontWeight: '700' },

  // toast
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xxl,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadows.xl,
  },
  toastEmoji: { fontSize: 20, marginRight: spacing.sm },
  toastText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  toastBtn: {
    marginLeft: spacing.lg,
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  toastBtnText: { color: colors.primary, fontWeight: '800', fontSize: 13 },

  // ending bar
  endingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xxl,
    alignItems: 'center',
  },
  endingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgLight,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadows.xl,
  },
  endingText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  endingBtns: { flexDirection: 'row', marginLeft: spacing.lg, gap: spacing.sm },
  endingUndo: {
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  endingUndoText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  endingNow: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  endingNowText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },

  // recap
  recapCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    ...shadows.lg,
  },
  recapKicker: {
    color: colors.tertiary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  recapTime: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  recapSub: { color: colors.textMuted, fontSize: 14 },
  recapStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  recapStat: { alignItems: 'center', flex: 1 },
  recapStatValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  recapStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  recapPrediction: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bgLight,
  },
  recapPredictionText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  recapPending: {
    color: colors.warning,
    fontSize: 12,
    marginTop: spacing.lg,
  },
  recapBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  recapBtnText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
});
