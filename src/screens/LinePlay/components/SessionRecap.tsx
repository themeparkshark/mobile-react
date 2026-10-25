/**
 * The queue recap, shown when a wait ends. A confirmed boarding opens as
 * "Your ride's up!"; leaving the queue area opens as "Wait wrapped up" with a
 * "Still in line?" way back in. Verified rewards count up in a staggered row
 * with his currency art (the crew story plays once, on the relay card), and
 * the next coin move is one clear action.
 *
 * Only server-confirmed amounts are shown as earned; nothing here grants.
 */
import { useRef, type ReactNode } from 'react';
import { Image as NativeImage, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import RideUpCelebration, { RIDE_UP, RIDE_UP_REPEAT, RideUpHero, RideUpKicker, RollingValue, rideUpStatStartsAt, type RideUpPlan } from './RideUpCelebration';
import { takeRideUpVariant } from './rideUpRepeat';
import { colors, spacing, borderRadius, shadows } from '../../../design-system';
import { BRAND, GameButton, GameIcon, ICON_SOURCES, type GameIconName } from '../../../ui';
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

let recapArtWarm = false;

/**
 * Decode the recap's art (the celebrating shark, the stamp and the earned-row icons) into memory before the wait
 * ends, so "Your ride's up!" never opens on a card with its shark and icons still blank (round 6: two such frames
 * on a cold first open). LinePlay calls it when the line screen opens; cheap, once per app run, never throws.
 */
export function warmRecapArt(): void {
  if (recapArtWarm) return;
  recapArtWarm = true;
  try {
    const icons: GameIconName[] = ['star', 'energy', 'xp', 'parts', 'ticket', 'arrow', 'timer'];
    const uris = [QUEUE_RECAP_SHARK, QUEUE_STAMP_IMAGE, ...icons.map(name => ICON_SOURCES[name])]
      .map(source => NativeImage.resolveAssetSource(source)?.uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
    void Image.prefetch(uris, 'memory').catch(() => { recapArtWarm = false; });
  } catch {
    recapArtWarm = false;
  }
}

/** How long a recap number rolls (bigger numbers roll a little longer, capped). */
function rollMs(target: number): number {
  return Math.min(900, 380 + target * 18);
}

/** "Memory Match x2 · Ride trivia" from a list of played activity names. */
export function playedSummary(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Array.from(counts, ([name, count]) => count > 1 ? `${name} x${count}` : name).join(' · ');
}

function RecapStat({ icon, value, prefix = '', label, index, reducedMotion, rideUp = false, plan = RIDE_UP }: {
  icon: GameIconName; value: number; prefix?: string; label: string; index: number; reducedMotion: boolean;
  /**
   * "Your ride's up!": the chip is in place from the card's first frame and its number rolls
   * out of the header's burst (RIDE_UP.statStepMs apart), landing with a pop and a tick by about 1.2 s.
   */
  rideUp?: boolean;
  /** The ride-up beat sheet (the day's first ride, or the quicker repeat). */
  plan?: RideUpPlan;
}) {
  const delayMs = rideUp ? rideUpStatStartsAt(index, plan) : 260 + index * 90;
  const durationMs = rideUp ? plan.statMs : rollMs(value);
  return <Animated.View entering={reducedMotion || rideUp ? undefined : ZoomIn.delay(160 + index * 90).springify().damping(11)}
    style={styles.recapStat} accessible accessibilityLabel={`${prefix}${value} ${label}`}>
    <GameIcon name={icon} size={30} />
    <RollingValue value={value} prefix={prefix} delayMs={delayMs} durationMs={durationMs} reduced={reducedMotion}
      tick={rideUp} style={styles.recapStatValue} />
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
  /** The opt-in "line snack" offer, shown only once the wait is over. */
  snackSlot?: ReactNode;
  /** The next adventure for this ride, teased so the next line has something to look forward to. */
  nextAdventure?: string | null;
  /** Shark adventures finished across every line: [found, total]. */
  adventuresFound?: readonly [number, number, boolean] | null;
  /** Names this recap for the day's ride-up count (default: the ride and the time); a preview passes its own per showing. */
  rideUpKey?: string;
}

export default function SessionRecap({
  elapsedSeconds, activityCount, activityNames, earnedEnergy, experience, partsCount, ticketsEarned,
  masteryBonusParts, crewPuzzleBonusParts = 0, currentQuestBonusParts = 0, rewardsPending, rewardsConfirmed,
  rewardTrackingAvailable, queueStamp = null, onOpenStampBook, resolution, predictionUnscored, crewPuzzle,
  crewRelay, crewRouteNames, crewScoreNoun, coin, coinState, playerEnergy, energyUnavailable = false, rideName,
  onOpenCoin, onOpenPark, parkAvailable, feedbackEnabled = false, feedback = null, feedbackLoading = false,
  feedbackSaving = false, feedbackError = null, onRateWait, onFavoriteActivity, endReason = null, onStillInLine,
  doneLabel = 'Done', onDone, bonusRecap = null, heroInventory = null, onOpenInventory, groupSlot = null, snackSlot = null, nextAdventure = null, adventuresFound = null,
  rideUpKey,
}: SessionRecapProps) {
  const bonusMode = rewardsConfirmed && bonusRecap != null;
  const rows = bonusMode ? recapRows(bonusRecap) : [];
  const parkDay = bonusMode ? parkDayLine(bonusRecap) : null;
  const reducedMotion = useReducedGameMotion();
  const wholeMinutes = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const rideUp = endReason === 'boarded';
  const leftQueue = endReason === 'left_queue';
  // The day's first ride gets the full cheer; another ride the same day gets the quick one (rideUpRepeat.ts). Keyed by
  // this recap (ride and time), so a re-render never counts it twice.
  const planRef = useRef<RideUpPlan | null>(null);
  if (rideUp && planRef.current === null) planRef.current = takeRideUpVariant(rideUpKey ?? `${rideName}:${elapsedSeconds}`) === 'short' ? RIDE_UP_REPEAT : RIDE_UP;
  const rideUpPlan = planRef.current ?? RIDE_UP;
  const rideUpShort = rideUpPlan === RIDE_UP_REPEAT;
  // "Your ride's up!" lays the page out at once (the shark is on the header from frame 1 and the cards under it
  // only rise a few points in a quick fade), so the sheet never shows a blank body while the header plays.
  const enter = (index: number) => reducedMotion ? undefined
    : rideUp ? FadeInDown.delay(40 + index * 40).duration(180)
    : FadeInDown.delay(420 + index * 90).springify().damping(14);
  const upgradeReady = coin != null && coin.current_level < coin.max_level &&
    (coin.available_parts ?? 0) >= coin.parts_to_next_level && playerEnergy != null &&
    playerEnergy >= coin.energy_to_next_level;
  let stat = 0;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.recapCard}>
      {/* "Your ride's up!": the header card itself is the celebration (pop, title stamp, gold bar, rays, burst). */}
      <RideUpHero active={rideUp} plan={rideUpPlan}>{backdrop => (
      <LinearGradient colors={['#13a8e9', '#0879ca', '#0768b9']} style={styles.recapHero}>
        {backdrop}
        <View style={styles.recapHeroCopy}>
          <RideUpKicker active={rideUp} style={styles.recapKicker}>{rideUp ? 'YOUR RIDE’S UP!' : leftQueue ? 'WAIT WRAPPED UP' : 'LINEPLAY COMPLETE'}</RideUpKicker>
          <Text style={styles.recapRide} numberOfLines={2}>{rideName}</Text>
          <View accessible accessibilityLabel={`${wholeMinutes} minutes ${secs} seconds`}>
            {/* The minutes roll with the gold bar on "Your ride's up!" (UI thread). */}
            <RollingValue value={wholeMinutes} suffix={`m ${secs}s`} reduced={reducedMotion}
              delayMs={rideUp ? rideUpPlan.ringAt : 120} durationMs={rideUp ? rideUpPlan.ringMs : rollMs(wholeMinutes)}
              style={[styles.recapTime, styles.recapTimeRoll]} />
          </View>
          <Text style={styles.recapSub}>{rideUp || leftQueue ? 'of line games, all saved' : 'time played'}</Text>
        </View>
        {heroInventory && onOpenInventory ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Your shark. Open your closet"
            onPress={onOpenInventory} style={styles.recapSharkWrap}>
            <Playercard inventory={heroInventory} showBackground={false} style={styles.heroCard} />
          </Pressable>
        ) : (
          <Animated.View entering={reducedMotion || rideUp ? undefined : ZoomIn.delay(80).springify().damping(9)} style={styles.recapSharkWrap}>
            <Image source={QUEUE_RECAP_SHARK} style={styles.recapShark} contentFit="contain"
              accessibilityLabel="Shark celebrating with a ride coin and park ticket" />
          </Animated.View>
        )}
      </LinearGradient>
      )}</RideUpHero>

      {leftQueue && onStillInLine && (
        <Animated.View entering={enter(0)} style={styles.stillInLineCard}>
          <View style={styles.stillInLineRow}>
            <GameIcon name="queue" size={34} />
            <View style={styles.stillInLineCopy}>
              <Text style={styles.stillInLineTitle}>Still in line?</Text>
              <Text style={styles.stillInLineBody}>Pick up where you left off. You keep what you earned.</Text>
            </View>
          </View>
          <GameButton label="Keep playing" icon="arrow" onPress={onStillInLine} fullWidth
            accessibilityLabel="Still in line. Keep playing this wait." />
        </Animated.View>
      )}

      {groupSlot}

      <Text style={styles.recapSectionTitle}>{rewardsConfirmed ? 'WHAT YOU EARNED' : 'YOUR LINEPLAY ADVENTURE'}</Text>
      <View style={styles.recapStats}>
        <RecapStat icon="star" value={activityCount} label={activityCount === 1 ? 'activity' : 'activities'}
          index={stat++} reducedMotion={reducedMotion} rideUp={rideUp} plan={rideUpPlan} />
        {rewardsConfirmed && <RecapStat icon="energy" value={earnedEnergy} prefix="+" label="energy" index={stat++} reducedMotion={reducedMotion} rideUp={rideUp} plan={rideUpPlan} />}
        {rewardsConfirmed && <RecapStat icon="xp" value={experience} prefix="+" label="xp" index={stat++} reducedMotion={reducedMotion} rideUp={rideUp} plan={rideUpPlan} />}
        {rewardsConfirmed && <RecapStat icon="parts" value={partsCount} label="parts" index={stat++} reducedMotion={reducedMotion} rideUp={rideUp} plan={rideUpPlan} />}
        {rewardsConfirmed && ticketsEarned > 0 && <RecapStat icon="ticket" value={ticketsEarned} prefix="+"
          label={ticketsEarned === 1 ? 'ticket' : 'tickets'} index={stat++} reducedMotion={reducedMotion} rideUp={rideUp} plan={rideUpPlan} />}
      </View>

      {rewardsConfirmed && queueStamp?.earned && onOpenStampBook && (
        <Animated.View entering={enter(0)}>
          <Pressable accessibilityRole="button" accessibilityLabel="See your Queue Navigator stamp"
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
        <BonusLine icon="star">{`Coin mastery gave you ${masteryBonusParts} extra Ride Part.`}</BonusLine>
      )}
      {!bonusMode && rewardsConfirmed && crewPuzzleBonusParts > 0 && (
        <BonusLine icon="lock">{`Your Crew Codebreaker guess gave you ${crewPuzzleBonusParts} Ride Part.`}</BonusLine>
      )}
      {!bonusMode && rewardsConfirmed && currentQuestBonusParts > 0 && (
        <BonusLine icon="shark">{`Current Quest gave you ${currentQuestBonusParts} extra Ride Part.`}</BonusLine>
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
              {resolution.correct ? 'Your wait guess was right! ' : 'Your wait guess missed. '}
              {resolution.beat
                ? `You beat the posted wait by ${Math.max(0, Math.round(resolution.postedWaitMinutes - resolution.actualWaitMinutes))}m.`
                : `The wait was about the posted ${resolution.postedWaitMinutes}m.`}
            </Text>
          </View>
        </Animated.View>
      )}

      {predictionUnscored && (
        <Text style={styles.recapPending}>Your wait guess did not count. It only counts if you get to the ride.</Text>
      )}

      {crewPuzzle && (
        <View style={styles.recapPrediction}>
          <Text style={styles.recapPredictionText}>
            {crewPuzzle.completed
              ? `Your crew opened all ${crewPuzzle.total_stages} code gates together.`
              : `Your crew opened ${crewPuzzle.stage - 1} of ${crewPuzzle.total_stages} code gates.`}
            {' '}{crewPuzzle.participants} players shared clues.
          </Text>
        </View>
      )}

      {/* One message, never two that disagree: offline sync only applies when this wait could earn. */}
      {rewardsPending && rewardTrackingAvailable && (
        <Text style={styles.recapPending}>No internet. Your rewards will show up when you&apos;re back online.</Text>
      )}
      {rewardTrackingAvailable && !rewardsConfirmed && !rewardsPending && (
        <Text style={styles.recapPending}>Checking your time near the ride...</Text>
      )}
      {!rewardTrackingAvailable && (
        <Text style={styles.recapPending}>Games done! No Ride Parts this time. You only earn Parts near a ride that has them.</Text>
      )}

      {rewardsConfirmed && coinState === 'loading' && (
        <Text style={styles.recapPending}>Checking this ride&apos;s coin progress...</Text>
      )}

      {rewardsConfirmed && coinState === 'owned' && coin && (
        <Animated.View entering={enter(4)} style={styles.coinNextCard}>
          <Text style={styles.coinNextLabel}>YOUR NEXT COIN MOVE</Text>
          <Text style={styles.coinNextTitle}>{coin.ride_name} · Level {coin.current_level}/{coin.max_level}</Text>
          {coin.current_level >= coin.max_level ? (
            <Text style={styles.coinNextBody}>This coin is at its top level. Its Ride Parts stay with you.</Text>
          ) : (
            <>
              <Text style={styles.coinNextBody}>
                {coin.available_parts ?? 0}/{coin.parts_to_next_level} Ride Parts · {playerEnergy == null
                  ? energyUnavailable ? 'Can’t load your energy' : 'Checking your energy'
                  : `${playerEnergy}/${coin.energy_to_next_level} Energy`}
                {'\n'}{playerEnergy == null
                  ? energyUnavailable ? 'Check this coin when you are back online.' : 'Checking your next level up.'
                  : upgradeReady
                    ? 'Ready to level up now.'
                    : `Next level needs ${Math.max(0, coin.parts_to_next_level - (coin.available_parts ?? 0))} more Parts and ${Math.max(0, coin.energy_to_next_level - playerEnergy)} more energy.`}
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
            ? 'Win this ride’s coin to use the Parts you earned in line.'
            : 'Win this ride’s coin to start leveling it up. Your line games still count here.'}</Text>
          <GameButton label={parkAvailable ? 'Open ride checklist' : 'Open Coin Shelf'} icon="map" variant="secondary"
            onPress={onOpenPark} style={styles.coinNextButton} />
        </Animated.View>
      )}
      {rewardsConfirmed && coinState === 'unavailable' && (
        <Text style={styles.recapPending}>We can&apos;t load this coin right now. Check your Coin Shelf when you&apos;re back online.</Text>
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

      {rewardsConfirmed && snackSlot}
      {nextAdventure && <View style={styles.nextAdventure} accessible accessibilityLabel={`Next time in this line: ${nextAdventure}`}>
        <GameIcon name="map" size={22} />
        <Text style={styles.nextAdventureText} maxFontSizeMultiplier={1.3}>
          {`Next time in this line: ${nextAdventure}`}{adventuresFound && adventuresFound[0] > 0 ? `\n${adventuresFound[2] ? 'New adventure found! ' : 'Adventures found: '}${adventuresFound[0]} of ${adventuresFound[1]}` : ''}
        </Text>
      </View>}
      <GameButton label={doneLabel} onPress={onDone} fullWidth style={styles.recapBtn} />
    </ScrollView>
    {/* "Your ride's up!": the app cheers you onto the ride, then gets out of the way. */}
    {rideUp && <RideUpCelebration rideName={rideName} short={rideUpShort} />}
    </View>
  );
}

const styles = StyleSheet.create({
  nextAdventure: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: '#fff8e4', borderWidth: 2, borderColor: '#ffcf3b' },
  nextAdventureText: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: '#073b74' },
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
  recapTimeRoll: { textAlign: 'left', alignSelf: 'flex-start', minWidth: 160 },
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
