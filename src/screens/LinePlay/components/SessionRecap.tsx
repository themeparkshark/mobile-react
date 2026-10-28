/**
 * The queue recap, shown when a wait ends (core loop 5.5): one screen.
 * A confirmed boarding opens as "Your ride's up!" with "Sign said 20, you
 * waited 11" and the ride step's "Ride logged" row; leaving the queue area
 * opens as "Wait wrapped up" with a "Still in line?" way back in (the Undo).
 * Only what was earned shows (no "+0" rows), and the screen ends on one GO:
 * win this ride's coin (its Parts wait in its slot), level it up, or the
 * guide's next coin. The line Ticket shows only while queue_tickets is on.
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
import { FOOTER_CLEARANCE } from '../../../components/Wrapper';
import type { InventoryType } from '../../../models/inventory-type';
import { coinTierName } from '../../../constants/coinTiers';
import { parkDayLine, recapRows, type RecapRewardsInput } from '../../../services/lineplay/bonusRounds';
import type { RecapGo } from '../../../services/lineplay/rideStep';
import { UpperText } from '../../../ui/upper';

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

/**
 * The recap's stat tiles, zeros left out: a short wait never shows "0 / +0 / +0 / 0" (a row of zeros
 * reads like nothing happened). Empty when nothing was earned or played: the keepsake card shows instead.
 */
export function recapStats(r: { activityCount: number; earnedEnergy: number; experience: number; partsCount: number;
  ticketsEarned: number; rewardsConfirmed: boolean; showEnergy?: boolean; showXp?: boolean; showTickets?: boolean }):
  { key: string; icon: GameIconName; value: number; prefix: string; label: string }[] {
  const out: { key: string; icon: GameIconName; value: number; prefix: string; label: string }[] = [];
  // Energy follows the coin levels rung, XP the Daily 3 rung, the line Ticket the queue_tickets switch:
  // a reward whose system is still hidden is kept on the server, never shown as a chip here.
  if (r.activityCount > 0) out.push({ key: 'activities', icon: 'star', value: r.activityCount, prefix: '', label: r.activityCount === 1 ? 'game' : 'games' });
  if (r.rewardsConfirmed && r.partsCount > 0) out.push({ key: 'parts', icon: 'parts', value: r.partsCount, prefix: '+', label: r.partsCount === 1 ? 'part' : 'parts' });
  if (r.rewardsConfirmed && r.showEnergy !== false && r.earnedEnergy > 0) out.push({ key: 'energy', icon: 'energy', value: r.earnedEnergy, prefix: '+', label: 'energy' });
  if (r.rewardsConfirmed && r.showXp !== false && r.experience > 0) out.push({ key: 'xp', icon: 'xp', value: r.experience, prefix: '+', label: 'xp' });
  if (r.rewardsConfirmed && r.showTickets !== false && r.ticketsEarned > 0) out.push({ key: 'tickets', icon: 'ticket', value: r.ticketsEarned, prefix: '+', label: r.ticketsEarned === 1 ? 'ticket' : 'tickets' });
  return out;
}

function RecapStat({ icon, value, prefix = '', label, index, reducedMotion }: {
  icon: GameIconName; value: number; prefix?: string; label: string; index: number; reducedMotion: boolean;
}) {
  const shown = useCountUp(value, 260 + index * 110, reducedMotion);
  return <Animated.View entering={reducedMotion ? undefined : ZoomIn.delay(160 + index * 110).springify().damping(11)}
    style={styles.recapStat} accessible accessibilityLabel={`${prefix}${value} ${label}`}>
    <GameIcon name={icon} size={30} />
    <Text style={styles.recapStatValue}>{prefix}{shown}</Text>
    <UpperText style={styles.recapStatLabel}>{label}</UpperText>
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
  /** "Sign said 20, you waited 11" (only after the ride step). */
  signLine?: string | null;
  /** The ride step logged this ride (its timed wait in minutes, or null when unknown). */
  rideLogged?: { readonly waited: number | null } | null;
  /** Open the Ride Journal on this ride, the timed wait filled in. */
  onAddMemory?: () => void;
  /** The ride step stamped today's Adventure. */
  adventureStamped?: boolean;
  /** The recap's one GO, and what it does. */
  go?: RecapGo | null;
  onGo?: () => void;
  /** Reward chips follow the unlock ladder and the switches (Energy: coin levels, XP: Daily 3, Ticket: queue_tickets). */
  showEnergy?: boolean;
  showXp?: boolean;
  showTickets?: boolean;
  /** Who's in line was 2 or more: crew lines show. */
  crew?: boolean;
}

export default function SessionRecap({
  elapsedSeconds, activityCount, activityNames, earnedEnergy, experience, partsCount, ticketsEarned,
  masteryBonusParts, crewPuzzleBonusParts = 0, currentQuestBonusParts = 0, rewardsPending, rewardsConfirmed,
  rewardTrackingAvailable, queueStamp = null, onOpenStampBook, resolution, predictionUnscored, crewPuzzle,
  crewRelay, crewRouteNames, crewScoreNoun, coin, coinState, playerEnergy, energyUnavailable = false, rideName,
  onOpenCoin, onOpenPark, parkAvailable, feedbackEnabled = false, feedback = null, feedbackLoading = false,
  feedbackSaving = false, feedbackError = null, onRateWait, onFavoriteActivity, endReason = null, onStillInLine,
  doneLabel = 'Done', onDone, bonusRecap = null, heroInventory = null, onOpenInventory, groupSlot = null, snackSlot = null, nextAdventure = null, adventuresFound = null,
  signLine = null, rideLogged = null, onAddMemory, adventureStamped = false, go = null, onGo, showEnergy = true, showXp = true,
  showTickets = false, crew = false,
}: SessionRecapProps) {
  const bonusMode = rewardsConfirmed && bonusRecap != null;
  const rows = bonusMode ? recapRows(bonusRecap) : [];
  const parkDay = bonusMode ? parkDayLine(bonusRecap) : null;
  const reducedMotion = useReducedGameMotion();
  const minutes = useCountUp(Math.floor(elapsedSeconds / 60), 120, reducedMotion);
  const secs = elapsedSeconds % 60;
  const wholeMinutes = Math.floor(elapsedSeconds / 60);
  const rideUp = endReason === 'boarded';
  const leftQueue = endReason === 'left_queue';
  const enter = (index: number) => reducedMotion ? undefined : FadeInDown.delay(420 + index * 90).springify().damping(14);
  const upgradeReady = coin != null && coin.current_level < coin.max_level &&
    (coin.available_parts ?? 0) >= coin.parts_to_next_level && playerEnergy != null &&
    playerEnergy >= coin.energy_to_next_level;
  let stat = 0;
  const shownStats = recapStats({ activityCount, earnedEnergy, experience, partsCount, ticketsEarned, rewardsConfirmed,
    showEnergy, showXp, showTickets });

  return (
    // The bottom clearance keeps the last row above the footer's rising MAP compass (a tap there is never the map).
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.recapCard, { paddingBottom: FOOTER_CLEARANCE }]}>
      <LinearGradient colors={['#13a8e9', '#0879ca', '#0768b9']} style={styles.recapHero}>
        <View style={styles.recapHeroCopy}>
          <Text style={styles.recapKicker}>{rideUp ? 'YOUR RIDE’S UP!' : leftQueue ? 'WAIT WRAPPED UP' : 'LINEPLAY COMPLETE'}</Text>
          <Text style={styles.recapRide} numberOfLines={2}>{rideName}</Text>
          <Text style={styles.recapTime} accessibilityLabel={`${wholeMinutes} minutes`}>
            {minutes} min</Text>
          <Text style={styles.recapSub}>{signLine ?? (rideUp || leftQueue ? 'in line, all saved' : 'time played')}</Text>
        </View>
        {heroInventory && onOpenInventory ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Your shark. Open your closet"
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
            <GameIcon name="shark" size={34} />
            <View style={styles.stillInLineCopy}>
              <Text style={styles.stillInLineTitle}>Still in line?</Text>
              <Text style={styles.stillInLineBody}>Pick up where you left off. You keep what you earned.</Text>
            </View>
          </View>
          <GameButton label="Keep playing" icon="arrow" onPress={onStillInLine} fullWidth
            accessibilityLabel="Still in line. Keep playing this wait." />
        </Animated.View>
      )}

      {rideLogged && (
        <Animated.View entering={enter(0)}>
          <Pressable accessibilityRole="button" disabled={!onAddMemory} onPress={onAddMemory}
            accessibilityLabel={`Ride logged${rideLogged.waited != null ? `, ${rideLogged.waited} minute wait` : ''}. Add stars and a note.`}
            style={({ pressed }) => [styles.rideLoggedRow, pressed && styles.pressed]}>
            <GameIcon name="ride" size={30} />
            <View style={styles.rideLoggedCopy}>
              <Text style={styles.rideLoggedTitle}>Ride logged!</Text>
              <Text style={styles.rideLoggedBody}>{adventureStamped ? 'Today’s Adventure: all 3 stamps!'
                : rideLogged.waited != null ? `${rideLogged.waited} min in line, saved to your Ride Tracker` : 'Saved to your Ride Tracker'}</Text>
            </View>
            {onAddMemory && <Text style={styles.rideLoggedLink}>Add stars</Text>}
          </Pressable>
        </Animated.View>
      )}

      {crew ? groupSlot : null}

      <Text style={styles.recapSectionTitle}>{shownStats.some(t => t.key !== 'activities') ? 'WHAT YOU EARNED' : 'YOUR LINEPLAY ADVENTURE'}</Text>
      {shownStats.length ? <View style={styles.recapStats}>
        {shownStats.map(t => <RecapStat key={t.key} icon={t.icon} value={t.value} prefix={t.prefix} label={t.label}
          index={stat++} reducedMotion={reducedMotion} />)}
      </View> : (
        // Nothing played or earned yet (a short wait): a keepsake of the wait itself, never a row of zeros.
        <Animated.View entering={enter(0)} style={styles.keepsake} accessible
          accessibilityLabel={`Wait saved. ${Math.floor(elapsedSeconds / 60)} minutes ${secs} seconds in line at ${rideName}. Next time, play a clue while you wait.`}>
          <View style={styles.keepsakeBadge}><GameIcon name="ride" size={34} /></View>
          <View style={styles.keepsakeCopy}>
            <Text style={styles.keepsakeTitle}>Wait saved!</Text>
            <Text style={styles.keepsakeBody} numberOfLines={2}>{`${Math.floor(elapsedSeconds / 60)}m ${secs}s at ${rideName}`}</Text>
            <Text style={styles.keepsakeHint}>Next time, play a clue while you wait!</Text>
          </View>
        </Animated.View>
      )}

      {/* The one GO: win this ride's coin (its Parts wait in its slot), level it up, or the guide's next coin. */}
      {go && onGo && (
        <Animated.View entering={enter(4)} style={styles.goCard}>
          {coinState === 'owned' && coin && coin.current_level < coin.max_level && (
            <Text style={styles.coinNextBody}>{`${coin.available_parts ?? 0} of ${coin.parts_to_next_level} Parts to Level ${coin.current_level + 1}`}
              {playerEnergy != null && !upgradeReady && coin.energy_to_next_level > playerEnergy
                ? ` · ${coin.energy_to_next_level - playerEnergy} more Energy` : ''}</Text>
          )}
          <Text style={styles.goTitle}>{go.label}</Text>
          {coinState === 'unowned' && partsCount > 0 && (
            <Text style={styles.coinNextBody}>Parts are saved for this coin. Win it on your way out.</Text>
          )}
          <GameButton label={go.button} icon={go.kind === 'level_up' ? 'coin' : go.kind === 'shelf' ? 'map' : 'arrow'}
            fullWidth onPress={onGo} style={styles.goButton} accessibilityLabel={go.label} />
        </Animated.View>
      )}

      {/* A new stamp is one line (it waits in the Stamp Book); only a stamp earned on this wait shows. */}
      {rewardsConfirmed && queueStamp?.earned && queueStamp.new && (
        <Animated.View entering={enter(0)} style={styles.stampLine} accessible
          accessibilityLabel="New stamp: Queue Navigator. It is in your Stamp Book.">
          <Image source={QUEUE_STAMP_IMAGE} style={styles.stampLineImage} contentFit="contain" />
          <Text style={styles.recapPredictionText}>New stamp: Queue Navigator</Text>
        </Animated.View>
      )}

      {bonusMode && <View style={styles.tickRows}>
        {rows.map((row, index) => <TickRow key={row.key} icon={ROW_ICONS[row.key]} label={row.label}
          value={row.value} index={index} reducedMotion={reducedMotion} />)}
        {parkDay && <Text style={styles.parkDayLine}>{parkDay}</Text>}
      </View>}

      {!bonusMode && rewardsConfirmed && masteryBonusParts > 0 && (
        <BonusLine icon="star">{`Your coin level gave you ${masteryBonusParts} extra Ride Part.`}</BonusLine>
      )}
      {!bonusMode && rewardsConfirmed && crewPuzzleBonusParts > 0 && (
        <BonusLine icon="lock">{`Your Crew Codebreaker guess gave you ${crewPuzzleBonusParts} Ride Part.`}</BonusLine>
      )}
      {!bonusMode && rewardsConfirmed && currentQuestBonusParts > 0 && (
        <BonusLine icon="shark">{`Current Quest gave you ${currentQuestBonusParts} extra Ride Part.`}</BonusLine>
      )}

      {crew && crewRelay?.step === 'complete' && (
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

      {crew && crewPuzzle && (
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
          {`Next time in this line: ${nextAdventure}`}{adventuresFound && adventuresFound[0] > 0 ? `\n${adventuresFound[2] ? 'New line story found! ' : ''}Stories found ${adventuresFound[0]} of ${adventuresFound[1]}` : ''}
        </Text>
      </View>}
      {/* With a GO above, Done is the quiet second button (one gold button per screen). */}
      <GameButton label={doneLabel} onPress={onDone} fullWidth variant={go && onGo ? 'ghost' : undefined} style={styles.recapBtn} />
    </ScrollView>
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
    minHeight: 148, borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 3,
    borderColor: BRAND.navy, justifyContent: 'center', padding: spacing.lg,
  },
  recapHeroCopy: { width: '60%', zIndex: 1 },
  recapSharkWrap: { position: 'absolute', right: -5, bottom: -11 },
  recapShark: { width: 146, height: 146 },
  recapKicker: { color: '#fff4ac', fontFamily: 'Knockout', fontSize: 15, letterSpacing: 0.7 },
  recapRide: { color: '#ffffff', fontFamily: 'Shark', fontSize: 21, marginTop: 6, lineHeight: 25,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  recapTime: { color: '#ffffff', fontFamily: 'Shark', fontSize: 36, marginTop: spacing.xs,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  recapSub: { color: '#d6f4ff', fontFamily: 'Knockout', fontSize: 14 },
  keepsake: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.md,
    borderRadius: borderRadius.lg, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.cream },
  keepsakeBadge: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.navy },
  keepsakeCopy: { flex: 1, minWidth: 0 },
  keepsakeTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 20 },
  keepsakeBody: { color: '#073b74', fontFamily: 'Knockout', fontSize: 16, marginTop: 2 },
  keepsakeHint: { color: '#315d77', fontFamily: 'Knockout', fontSize: 14, lineHeight: 18, marginTop: 2 },
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
  recapBtn: { marginTop: spacing.lg, marginBottom: spacing.sm, alignSelf: 'center' },
  goCard: { marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 3,
    borderColor: '#ffd443', backgroundColor: '#ffffff', gap: spacing.sm },
  goButton: { alignSelf: 'stretch' },
  goTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 19, lineHeight: 24 },
  rideLoggedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md,
    borderRadius: borderRadius.lg, borderWidth: 3, borderColor: '#9fdc8c', backgroundColor: '#f2fff0' },
  rideLoggedCopy: { flex: 1, minWidth: 0 },
  rideLoggedTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 17 },
  rideLoggedBody: { color: '#315d77', fontFamily: 'Knockout', fontSize: 14, lineHeight: 18, marginTop: 2 },
  rideLoggedLink: { color: '#0874bb', fontFamily: 'Knockout', fontSize: 15, textDecorationLine: 'underline' },
  pressed: { transform: [{ scale: 0.98 }] },
  stampLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  stampLineImage: { width: 40, height: 40 },
});
