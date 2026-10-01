/**
 * The queue recap, shown when a wait ends. A confirmed boarding opens as
 * "Your ride's up!"; leaving the queue area opens as "Wait wrapped up" with a
 * "Still in line?" way back in. Verified rewards count up in a staggered row
 * with his currency art (the crew story plays once, on the relay card), and
 * the next coin move is one clear action.
 *
 * Only server-confirmed amounts are shown as earned; nothing here grants.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { colors, spacing, borderRadius, shadows } from '../../../design-system';
import { BRAND, GameButton, GameIcon, type GameIconName } from '../../../ui';
import type { PredictionResolution } from '../../../services/lineplay/content';
import type { CrewPuzzleSummary } from '../../../api/endpoints/me/inline-timer/types';
import { crewRelayScore, type CrewRelayProgress } from '../../../services/lineplay/crewRelay';
import type { EndReason } from '../../../services/lineplay/LinePlaySession';
import type { RideCoinLevelType } from '../../../models/ride-coin-level-type';
import type { LinePlayFeedback, WaitRating, FavoriteLinePlayActivity } from '../../../api/endpoints/me/inline-timer/feedback';
import Playercard from '../../../components/Playercard';
import type { InventoryType } from '../../../models/inventory-type';
import { coinTierName } from '../../../constants/coinTiers';
import { parkDayLine, recapRows, type RecapRewardsInput } from '../../../services/lineplay/bonusRounds';

const QUEUE_STAMP_IMAGE = require('../../../../assets/images/stamps/stamp-09.png');
const QUEUE_RECAP_SHARK = require('../../../../assets/images/screens/lineplay/queue-recap-shark.png');

/** Counts a number up once on arrival; reduced motion shows it at once. */
function useCountUp(target: number, delayMs: number, reducedMotion: boolean): number {
  const [value, setValue] = useState(reducedMotion ? target : 0);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (reducedMotion || target <= 0) { setValue(target); return; }
    const duration = Math.min(900, 380 + target * 18);
    let start: number | null = null;
    const timer = setTimeout(() => {
      const step = (now: number) => {
        start ??= now;
        const t = Math.min(1, (now - start) / duration);
        setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delayMs);
    return () => { clearTimeout(timer); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [target, delayMs, reducedMotion]);
  return value;
}

/** "Memory Match x2 · Ride trivia" from a list of played activity names. */
export function playedSummary(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Array.from(counts, ([name, count]) => count > 1 ? `${name} x${count}` : name).join(' · ');
}

function RecapStat({ icon, value, prefix = '', label, index, reducedMotion }: {
  icon: GameIconName; value: number; prefix?: string; label: string; index: number; reducedMotion: boolean;
}) {
  const shown = useCountUp(value, 260 + index * 110, reducedMotion);
  return <Animated.View entering={reducedMotion ? undefined : ZoomIn.delay(160 + index * 110).springify().damping(11)}
    style={styles.recapStat} accessible accessibilityLabel={`${prefix}${value} ${label}`}>
    <GameIcon name={icon} size={30} />
    <Text style={styles.recapStatValue}>{prefix}{shown}</Text>
    <Text style={styles.recapStatLabel}>{label}</Text>
  </Animated.View>;
}

/** One recap row ticking in on a 180 ms stagger (queue-bonus.md 7.6). */
function TickRow({ icon, label, value, index, reducedMotion }: {
  icon: GameIconName; label: string; value: string; index: number; reducedMotion: boolean;
}) {
  return <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(300 + index * 180).springify().damping(14)}
    style={styles.tickRow} accessible accessibilityLabel={`${label} ${value}`}>
    <GameIcon name={icon} size={26} />
    <Text style={styles.tickLabel}>{label}</Text>
    <Text style={styles.tickValue}>{value}</Text>
  </Animated.View>;
}

const ROW_ICONS: Record<string, GameIconName> = { wait: 'timer', bonus: 'parts', mastery: 'star', encore: 'xp' };

function BonusLine({ icon, children }: { icon: GameIconName; children: string }) {
  return <View style={styles.bonusLine}>
    <GameIcon name={icon} size={26} />
    <Text style={styles.recapPredictionText}>{children}</Text>
  </View>;
}

export interface SessionRecapProps {
  elapsedSeconds: number;
  activityCount: number;
  activityNames: readonly string[];
  earnedEnergy: number;
  experience: number;
  partsCount: number;
  ticketsEarned: number;
  masteryBonusParts: number;
  crewPuzzleBonusParts?: number;
  currentQuestBonusParts?: number;
  rewardsPending: boolean;
  rewardsConfirmed: boolean;
  rewardTrackingAvailable: boolean;
  queueStamp?: { earned: boolean; new: boolean } | null;
  onOpenStampBook?: () => void;
  resolution: PredictionResolution | null;
  predictionUnscored: boolean;
  crewPuzzle: CrewPuzzleSummary | null;
  crewRelay: CrewRelayProgress | null;
  crewRouteNames: readonly [string, string] | null;
  crewScoreNoun: string;
  coin: RideCoinLevelType | null;
  coinState: 'idle' | 'loading' | 'owned' | 'unowned' | 'unavailable';
  playerEnergy: number | null;
  energyUnavailable?: boolean;
  rideName: string;
  onOpenCoin: () => void;
  onOpenPark: () => void;
  parkAvailable: boolean;
  feedbackEnabled?: boolean;
  feedback?: LinePlayFeedback | null;
  feedbackLoading?: boolean;
  feedbackSaving?: boolean;
  feedbackError?: string | null;
  onRateWait?: (rating: WaitRating) => void;
  onFavoriteActivity?: (favorite: FavoriteLinePlayActivity) => void;
  /** Why the wait ended; the queue ending it opens as "Your ride's up!". */
  endReason?: EndReason | null;
  /** Left the queue area by mistake: start a fresh wait that keeps the playlist. */
  onStillInLine?: () => void;
  doneLabel?: string;
  onDone: () => void;
  /** Queue Bonus Rounds recap rows (null on older servers). */
  bonusRecap?: RecapRewardsInput | null;
  /** The player's currently equipped look for the hero pose. */
  heroInventory?: InventoryType | null;
  /** Tap the hero: the existing Inventory screen (no new route). */
  onOpenInventory?: () => void;
  /** Play together (L3): the crew recap, owned by the group components. */
  groupSlot?: ReactNode;
}

export default function SessionRecap({
  elapsedSeconds, activityCount, activityNames, earnedEnergy, experience, partsCount, ticketsEarned,
  masteryBonusParts, crewPuzzleBonusParts = 0, currentQuestBonusParts = 0, rewardsPending, rewardsConfirmed,
  rewardTrackingAvailable, queueStamp = null, onOpenStampBook, resolution, predictionUnscored, crewPuzzle,
  crewRelay, crewRouteNames, crewScoreNoun, coin, coinState, playerEnergy, energyUnavailable = false, rideName,
  onOpenCoin, onOpenPark, parkAvailable, feedbackEnabled = false, feedback = null, feedbackLoading = false,
  feedbackSaving = false, feedbackError = null, onRateWait, onFavoriteActivity, endReason = null, onStillInLine,
  doneLabel = 'Done', onDone, bonusRecap = null, heroInventory = null, onOpenInventory, groupSlot = null,
}: SessionRecapProps) {
  const bonusMode = rewardsConfirmed && bonusRecap != null;
  const rows = bonusMode ? recapRows(bonusRecap) : [];
  const parkDay = bonusMode ? parkDayLine(bonusRecap) : null;
  const reducedMotion = useReducedGameMotion();
  const minutes = useCountUp(Math.floor(elapsedSeconds / 60), 120, reducedMotion);
  const secs = elapsedSeconds % 60;
  const rideUp = endReason === 'boarded';
  const leftQueue = endReason === 'left_queue';
  const enter = (index: number) => reducedMotion ? undefined : FadeInDown.delay(420 + index * 90).springify().damping(14);
  const upgradeReady = coin != null && coin.current_level < coin.max_level &&
    (coin.available_parts ?? 0) >= coin.parts_to_next_level && playerEnergy != null &&
    playerEnergy >= coin.energy_to_next_level;
  let stat = 0;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.recapCard}>
      <LinearGradient colors={['#13a8e9', '#0879ca', '#0768b9']} style={styles.recapHero}>
        <View style={styles.recapHeroCopy}>
          <Text style={styles.recapKicker}>{rideUp ? 'YOUR RIDE’S UP!' : leftQueue ? 'WAIT WRAPPED UP' : 'LINEPLAY COMPLETE'}</Text>
          <Text style={styles.recapRide} numberOfLines={2}>{rideName}</Text>
          <Text style={styles.recapTime} accessibilityLabel={`${Math.floor(elapsedSeconds / 60)} minutes ${secs} seconds`}>
            {minutes}m {secs}s</Text>
          <Text style={styles.recapSub}>{rideUp || leftQueue ? 'of queue play, all saved' : 'session time'}</Text>
        </View>
        {heroInventory && onOpenInventory ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Your shark. Open Inventory"
            onPress={onOpenInventory} style={styles.recapSharkWrap}>
            <Playercard inventory={heroInventory} showBackground={false} style={styles.heroCard} />
          </Pressable>
        ) : (
          <Animated.View entering={reducedMotion ? undefined : ZoomIn.delay(80).springify().damping(9)} style={styles.recapSharkWrap}>
            <Image source={QUEUE_RECAP_SHARK} style={styles.recapShark} contentFit="contain"
              accessibilityLabel="Shark celebrating with a ride coin and park ticket" />
          </Animated.View>
        )}
      </LinearGradient>

      {leftQueue && onStillInLine && (
        <Animated.View entering={enter(0)} style={styles.stillInLineCard}>
          <View style={styles.stillInLineRow}>
            <GameIcon name="queue" size={34} />
            <View style={styles.stillInLineCopy}>
              <Text style={styles.stillInLineTitle}>Still in line?</Text>
              <Text style={styles.stillInLineBody}>Pick up where you left off. This recap keeps its rewards.</Text>
            </View>
          </View>
          <GameButton label="Keep playing" icon="arrow" onPress={onStillInLine} fullWidth
            accessibilityLabel="Still in line. Keep playing this wait." />
        </Animated.View>
      )}

      {groupSlot}

      <Text style={styles.recapSectionTitle}>{rewardsConfirmed ? 'YOUR VERIFIED HAUL' : 'YOUR LINEPLAY ADVENTURE'}</Text>
      <View style={styles.recapStats}>
        <RecapStat icon="star" value={activityCount} label={activityCount === 1 ? 'activity' : 'activities'}
          index={stat++} reducedMotion={reducedMotion} />
        {rewardsConfirmed && <RecapStat icon="energy" value={earnedEnergy} prefix="+" label="energy" index={stat++} reducedMotion={reducedMotion} />}
        {rewardsConfirmed && <RecapStat icon="xp" value={experience} prefix="+" label="xp" index={stat++} reducedMotion={reducedMotion} />}
        {rewardsConfirmed && <RecapStat icon="parts" value={partsCount} label="parts" index={stat++} reducedMotion={reducedMotion} />}
        {rewardsConfirmed && ticketsEarned > 0 && <RecapStat icon="ticket" value={ticketsEarned} prefix="+"
          label={ticketsEarned === 1 ? 'ticket' : 'tickets'} index={stat++} reducedMotion={reducedMotion} />}
      </View>

      {rewardsConfirmed && queueStamp?.earned && onOpenStampBook && (
        <Animated.View entering={enter(0)}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open Queue Navigator in Stamp Book"
            onPress={onOpenStampBook} style={styles.queueStampCard}>
            <Image source={QUEUE_STAMP_IMAGE} style={styles.queueStampImage} contentFit="contain" />
            <View style={styles.queueStampCopy}>
              <Text style={styles.queueStampKicker}>{queueStamp.new ? 'NEW STAMP EARNED' : 'YOUR LINEPLAY STAMP'}</Text>
              <Text style={styles.queueStampTitle}>QUEUE NAVIGATOR</Text>
              <Text style={styles.queueStampAction}>Open your Stamp Book</Text>
            </View>
            <GameIcon name="arrow" size={32} />
          </Pressable>
        </Animated.View>
      )}

      {bonusMode && <View style={styles.tickRows}>
        {rows.map((row, index) => <TickRow key={row.key} icon={ROW_ICONS[row.key]} label={row.label}
          value={row.value} index={index} reducedMotion={reducedMotion} />)}
        {parkDay && <Text style={styles.parkDayLine}>{parkDay}</Text>}
      </View>}

      {!bonusMode && rewardsConfirmed && masteryBonusParts > 0 && (
        <BonusLine icon="star">{`Coin mastery added ${masteryBonusParts} Ride Part to this verified session.`}</BonusLine>
      )}
      {!bonusMode && rewardsConfirmed && crewPuzzleBonusParts > 0 && (
        <BonusLine icon="lock">{`Your Crew Codebreaker guess added ${crewPuzzleBonusParts} Ride Part.`}</BonusLine>
      )}
      {!bonusMode && rewardsConfirmed && currentQuestBonusParts > 0 && (
        <BonusLine icon="shark">{`Current Quest added ${currentQuestBonusParts} Ride Part to this verified wait.`}</BonusLine>
      )}

      {crewRelay?.step === 'complete' && (
        <Animated.View entering={enter(1)}>
          <View style={styles.recapPrediction}>
            <View style={styles.bonusLine}>
              <GameIcon name="chest" size={26} />
              <Text style={styles.recapPredictionText}>
                {`Crew story complete. ${crewScoreNoun}: ${crewRelayScore(crewRelay)}/2`}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}

      {activityNames.length > 0 && <Animated.View entering={enter(2)} style={styles.recapPrediction}>
        <Text style={styles.recapPredictionText}>Played: {playedSummary(activityNames)}</Text>
      </Animated.View>}

      {resolution && (
        <Animated.View entering={enter(3)} style={styles.recapPrediction}>
          <View style={styles.bonusLine}>
            <GameIcon name={resolution.correct ? 'check' : 'timer'} size={26} />
            <Text style={styles.recapPredictionText}>
              {resolution.correct ? 'Nailed the prediction! ' : 'Prediction missed. '}
              {resolution.beat
                ? `You beat the posted wait by ${Math.max(0, Math.round(resolution.postedWaitMinutes - resolution.actualWaitMinutes))}m.`
                : `The line held near the posted ${resolution.postedWaitMinutes}m.`}
            </Text>
          </View>
        </Animated.View>
      )}

      {predictionUnscored && (
        <Text style={styles.recapPending}>Your wait prediction was saved but not scored because boarding was not confirmed.</Text>
      )}

      {crewPuzzle && (
        <View style={styles.recapPrediction}>
          <Text style={styles.recapPredictionText}>
            {crewPuzzle.completed
              ? `Your ride’s crew opened all ${crewPuzzle.total_stages} codebreaker gates together.`
              : `Your ride’s crew opened ${crewPuzzle.stage - 1} of ${crewPuzzle.total_stages} codebreaker gates.`}
            {' '}{crewPuzzle.participants} players contributed clues.
          </Text>
        </View>
      )}

      {rewardsPending && (
        <Text style={styles.recapPending}>Rewards will sync when you&apos;re back online.</Text>
      )}
      {rewardTrackingAvailable && !rewardsConfirmed && !rewardsPending && (
        <Text style={styles.recapPending}>Checking eligible nearby time...</Text>
      )}
      {!rewardTrackingAvailable && (
        <Text style={styles.recapPending}>Games completed. Queue rewards are unavailable for this session.</Text>
      )}

      {rewardsConfirmed && coinState === 'loading' && (
        <Text style={styles.recapPending}>Checking this ride&apos;s coin progress...</Text>
      )}

      {rewardsConfirmed && coinState === 'owned' && coin && (
        <Animated.View entering={enter(4)} style={styles.coinNextCard}>
          <Text style={styles.coinNextLabel}>YOUR NEXT COIN MOVE</Text>
          <Text style={styles.coinNextTitle}>{coin.ride_name} · Level {coin.current_level}/{coin.max_level}</Text>
          {coin.current_level >= coin.max_level ? (
            <Text style={styles.coinNextBody}>This coin is fully mastered. Its Ride Parts stay in your collection.</Text>
          ) : (
            <>
              <Text style={styles.coinNextBody}>
                {coin.available_parts ?? 0}/{coin.parts_to_next_level} Ride Parts · {playerEnergy == null
                  ? energyUnavailable ? 'Energy balance unavailable' : 'Checking Energy balance'
                  : `${playerEnergy}/${coin.energy_to_next_level} Energy`}
                {'\n'}{playerEnergy == null
                  ? energyUnavailable ? 'Check this coin when you are connected.' : 'Checking your next upgrade.'
                  : upgradeReady
                    ? 'Upgrade ready now.'
                    : `Next upgrade needs ${Math.max(0, coin.parts_to_next_level - (coin.available_parts ?? 0))} more Parts and ${Math.max(0, coin.energy_to_next_level - playerEnergy)} more Energy.`}
              </Text>
              {coin.next_level_perks.length > 0 && (
                <Text style={styles.coinNextBody}>Next unlock: {coin.next_level_perks.map(perk => perk.name).join(' · ')}</Text>
              )}
            </>
          )}
          {bonusMode && coin.current_level < coin.max_level && <Text style={styles.progressLine}>
            {`${coin.available_parts ?? 0}/${coin.parts_to_next_level} to ${coinTierName(coin.current_level + 1)}`}
          </Text>}
          {bonusMode && upgradeReady
            ? <GameButton label="LEVEL UP" icon="coin" onPress={onOpenCoin} style={styles.coinNextButton}
              accessibilityLabel="Level up this ride coin" />
            : <GameButton label={upgradeReady ? 'Upgrade coin' : 'View this coin'} icon="coin" variant="secondary"
              onPress={onOpenCoin} style={styles.coinNextButton} />}
        </Animated.View>
      )}
      {rewardsConfirmed && coinState === 'unowned' && (
        <Animated.View entering={enter(4)} style={styles.coinNextCard}>
          <Text style={styles.coinNextLabel}>{partsCount > 0 ? 'PARTS SAVED' : 'YOUR NEXT PARK MOVE'}</Text>
          <Text style={styles.coinNextTitle}>{rideName}</Text>
          <Text style={styles.coinNextBody}>{partsCount > 0
            ? 'Collect this ride’s coin to spend the Parts you earned in line.'
            : 'Collect this ride’s coin to start mastering it. Your queue games still count in this recap.'}</Text>
          <GameButton label={parkAvailable ? 'Open ride checklist' : 'Open Coin Shelf'} icon="map" variant="secondary"
            onPress={onOpenPark} style={styles.coinNextButton} />
        </Animated.View>
      )}
      {rewardsConfirmed && coinState === 'unavailable' && (
        <Text style={styles.recapPending}>Coin progress is unavailable right now. Check the Coin Shelf when you&apos;re back online.</Text>
      )}

      {feedbackEnabled && (
        <View style={styles.waitFeedbackCard}>
          <Text style={styles.waitFeedbackTitle}>Did LinePlay make this wait better?</Text>
          {feedbackLoading ? <Text style={styles.recapPending}>Checking your answer...</Text> : <>
            <View style={styles.waitFeedbackOptions}>
              {([
                ['better', 'Yes'], ['somewhat', 'Somewhat'], ['no', 'No'],
              ] as const).map(([rating, label]) => (
                <Pressable key={rating} accessibilityRole="button"
                  disabled={feedbackSaving} onPress={() => onRateWait?.(rating)}
                  style={[styles.waitFeedbackOption, feedback?.rating === rating && styles.waitFeedbackSelected]}>
                  <Text style={styles.waitFeedbackOptionText}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {feedback && <>
              <Text style={styles.waitFeedbackNote}>Thanks. What helped most? Optional.</Text>
              <View style={styles.waitFeedbackOptions}>
                {([
                  ['games', 'Games'], ['story', 'Story'], ['crew', 'Crew'],
                  ['rewards', 'Rewards'], ['none', 'Nothing yet'],
                ] as const).map(([favorite, label]) => (
                  <Pressable key={favorite} accessibilityRole="button"
                    disabled={feedbackSaving} onPress={() => onFavoriteActivity?.(favorite)}
                    style={[styles.waitFeedbackOption, feedback.favorite === favorite && styles.waitFeedbackSelected]}>
                    <Text style={styles.waitFeedbackOptionText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>}
            {feedbackError && <Text style={styles.waitFeedbackError}>{feedbackError}</Text>}
            <Text style={styles.waitFeedbackNote}>Your answer never changes rewards. You can skip this.</Text>
          </>}
        </View>
      )}

      <GameButton label={doneLabel} onPress={onDone} fullWidth style={styles.recapBtn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroCard: { width: 130, height: 180 },
  tickRows: { marginHorizontal: spacing.lg, marginTop: spacing.sm, gap: 6 },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 2, borderColor: '#89cafa', paddingHorizontal: 12, minHeight: 44 },
  tickLabel: { flex: 1, fontFamily: 'Shark', fontSize: 16, color: '#083f7c' },
  tickValue: { fontFamily: 'Shark', fontSize: 18, color: '#b07800' },
  parkDayLine: { fontFamily: 'Knockout', fontSize: 12, color: '#416b8f', textAlign: 'center', marginTop: 2 },
  progressLine: { fontFamily: 'Shark', fontSize: 16, color: '#b07800', marginTop: 4 },
  recapCard: {
    marginHorizontal: spacing.lg, backgroundColor: '#ddf5ff', borderRadius: borderRadius.xxl,
    padding: spacing.md, borderWidth: 3, borderColor: '#ffffff', ...shadows.lg,
  },
  recapHero: {
    minHeight: 176, borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 3,
    borderColor: BRAND.navy, justifyContent: 'center', padding: spacing.lg,
  },
  recapHeroCopy: { width: '60%', zIndex: 1 },
  recapSharkWrap: { position: 'absolute', right: -5, bottom: -11 },
  recapShark: { width: 168, height: 168 },
  recapKicker: { color: '#fff4ac', fontFamily: 'Knockout', fontSize: 15, letterSpacing: 0.7 },
  recapRide: { color: '#ffffff', fontFamily: 'Shark', fontSize: 21, marginTop: 6, lineHeight: 25,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  recapTime: { color: '#ffffff', fontFamily: 'Shark', fontSize: 36, marginTop: spacing.xs,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  recapSub: { color: '#d6f4ff', fontFamily: 'Knockout', fontSize: 14 },
  recapSectionTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 17, textAlign: 'center', marginTop: spacing.lg },
  recapStats: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingVertical: spacing.md,
    borderRadius: borderRadius.lg, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: '#ffffff',
  },
  recapStat: { alignItems: 'center', flex: 1 },
  recapStatValue: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 20, marginTop: 2 },
  recapStatLabel: { color: '#3b6884', fontFamily: 'Knockout', fontSize: 12, marginTop: 1, textTransform: 'uppercase' },
  queueStampCard: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, padding: spacing.sm,
    borderRadius: borderRadius.lg, borderWidth: 3, borderColor: '#ffd443', backgroundColor: '#e5f8ff', ...shadows.md },
  queueStampImage: { width: 70, height: 70, marginRight: spacing.sm },
  queueStampCopy: { flex: 1 },
  queueStampKicker: { color: '#0874bb', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8 },
  queueStampTitle: { color: '#083d73', fontFamily: 'Shark', fontSize: 17, marginTop: 1 },
  queueStampAction: { color: '#205570', fontFamily: 'Knockout', fontSize: 14, marginTop: 3 },
  bonusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  stillInLineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stillInLineCard: { gap: spacing.sm, marginTop: spacing.md,
    padding: spacing.md, borderRadius: borderRadius.lg, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#ffd443' },
  stillInLineCopy: { flex: 1, minWidth: 0 },
  stillInLineTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 17 },
  stillInLineBody: { color: '#315d77', fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, marginTop: 2 },
  recapPrediction: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#a3d8ef' },
  recapPredictionText: { flexShrink: 1, color: '#205570', fontFamily: 'Knockout', fontSize: 14, lineHeight: 19 },
  recapPending: { color: '#925200', fontFamily: 'Knockout', fontSize: 13, marginTop: spacing.lg },
  coinNextCard: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: borderRadius.lg, borderWidth: 3,
    borderColor: '#ffd443', backgroundColor: '#ffffff' },
  coinNextLabel: { color: '#0874bb', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.7 },
  coinNextTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 18, marginTop: spacing.xs },
  coinNextBody: { color: '#315d77', fontFamily: 'Knockout', fontSize: 14, lineHeight: 19, marginTop: spacing.sm },
  coinNextButton: { marginTop: spacing.md, alignSelf: 'center' },
  waitFeedbackCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: borderRadius.lg, backgroundColor: '#ffffff' },
  waitFeedbackTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 17 },
  waitFeedbackOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  waitFeedbackOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 2, borderColor: '#8bc8e9' },
  waitFeedbackSelected: { borderColor: '#e7ac00', backgroundColor: '#fff3ba' },
  waitFeedbackOptionText: { color: '#073b74', fontFamily: 'Knockout', fontSize: 14 },
  waitFeedbackNote: { color: '#4c758d', fontFamily: 'Knockout', fontSize: 13, lineHeight: 18, marginTop: spacing.md },
  waitFeedbackError: { color: colors.error, fontFamily: 'Knockout', fontSize: 13, marginTop: spacing.sm },
  recapBtn: { marginTop: spacing.xl, marginBottom: spacing.sm, alignSelf: 'center' },
});
