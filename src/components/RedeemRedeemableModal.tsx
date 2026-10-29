import Lottie from 'lottie-react-native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, View, Text, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import redeemCoin from '../api/endpoints/me/coins/redeem-coin';
import redeemItem from '../api/endpoints/me/items/redeem-item';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { useStarRides } from '../services/liveEvents/useLiveEvent';
import { CurrencyContext } from '../context/CurrencyProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { CoinType } from '../models/coin-type';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { ItemType } from '../models/item-type';
import { ParkType } from '../models/park-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import Box from './RedeemModal/Box';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';
import MiniGameSelector from './MiniGameSelector';
import PostWinRewardsModal from './PostWinRewardsModal';
import { invalidateCoinCollection, loadCoin } from '../context/CoinCollection';
import { claimStampReward, getStamps, type StampData } from '../api/endpoints/me/stamps';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import * as RootNavigation from '../RootNavigation';
import TicketPunch from './TicketPunch';
import { serverPerkChips, type PerkChipData } from './coin/progressionModel';
import ChallengeStatusCard from './rewards/ChallengeStatusCard';
import { VIP_RETRY_ACTION, VIP_TRY_TOMORROW, lostTryCopy, vipTriesLeft } from './rewards/lostTryCard';
import { getAdSummary } from '../api/endpoints/me/ad-rewards';
import { markStandingsStale } from '../screens/LeaderboardsScreen/standingsCache';
import {
  challengeButtonLabel, challengeFreeSteps, challengeNextStep, challengeStepLine, challengeTitle,
  needTicketCopy, punchLines, stampClaimSources,
} from './rewards/challengeCopy';
import { adventureLineStoryNext, partsProgress, weekLine } from './rewards/postWinModel';
import { getTripGoal } from '../api/endpoints/me/trip-goal';
import { withNumberFont } from '../ui/numberText';
import TicketGift from './rewards/TicketGift';
import { markTeamOffered, teamOffered, wantsTeamStep, whenTeamStepShown } from './rewards/teamOffer';
import type { ClaimSource } from '../services/guide/freeTickets';
import { guide, type GuideTarget } from '../services/guide/nextCoin';
import { useRung } from '../services/reveal/revealLadder';
import { pictureOnlyFor, playFlagsNow, loadPlayFlags } from '../services/playPrefs';
import { takeRideTry, type RideTrySummary } from '../gamekit/results/rideTry';
import { resolveQueueStoryContext } from '../services/lineplay/resolveRide';
import { prefetchParkShelf } from '../services/collection/parkShelfPrefetch';
import getCollectionMilestones, { type CollectionMilestones } from '../api/endpoints/me/ride-coins/milestones';
import GameIcon from '../ui/GameIcon';
import { createEarnedShelfArrival } from '../services/collection/earnedShelf';
import { RideChallengeContext } from '../gamekit/RideChallengeContext';
import {
  TaskAttempt,
  TaskGameProof,
  type EarnedCoinEdition, type RideControlReward, type RushReward,
  getTaskAttempt,
  resolveTaskAttempt,
} from '../api/endpoints/me/task-attempts';
import {
  readTaskAttemptCheckpoint,
  removeTaskAttemptCheckpoint,
  writeTaskAttemptCheckpoint,
  type TaskAttemptCheckpoint,
} from '../services/task-attempt/checkpoint';
import { recoverTaskAttempt } from '../services/task-attempt/recovery';
import { CHALLENGE_GAME_COLORS } from '../constants/coinTiers';
import { storeAvailable } from '../services/purchases';
import { watchForReward } from '../services/ads';
import { useNativeModalLayer } from '../ui/modalLayers';
import { usePresentWatchdog } from './rewards/usePresentWatchdog';


// Ticket cost by ride importance tier
function getTicketCost(redeemable: CurrentRedeemableType): number {
  const model = redeemable.model as TaskType | SecretTaskType;
  if (typeof model.ticket_cost === 'number') {
    return model.ticket_cost;
  }
  return 1;
}

/**
 * The games the server deals when a Ticket is spent (TaskAttemptController::GAMES):
 * Whack-a-Shark, Memory Match and Beat the Buzzer. Parade Beat stays in practice
 * games and Snap the Ride stays retired, so neither is named here (blueprint 5.3).
 */
export const CHALLENGE_GAMES = [
  { id: 'tap' as const, name: 'Whack-a-Shark', color: CHALLENGE_GAME_COLORS.tap },
  { id: 'memory' as const, name: 'Memory Match', color: CHALLENGE_GAME_COLORS.memory },
  { id: 'trivia' as const, name: 'Beat the Buzzer', color: CHALLENGE_GAME_COLORS.trivia },
];

type FlowState = 'recovering' | 'auth-required' | 'preview' | 'retrying' | 'wheel' | 'spinning' | 'minigame' | 'postwin' | 'lost' | 'claim-error' | 'spend-error' | 'save-error' | 'expired';
type GameType = 'tap' | 'memory' | 'trivia';


/** After "See It On Your Shelf", the map behind refreshes once the coin has landed (the flight takes about 1 s). */
export const SHELF_MAP_REFRESH_DELAY_MS = 1800;
/** Every card that leads back to the map says it the same way, never a bare OK. */
export const BACK_TO_MAP = 'Back to Map';
/** Out of Tickets with no free way left: the big button takes the player back to the map. */
export const NEED_TICKET_BUTTON = BACK_TO_MAP;
/** "3 treats at home": the treat art from How to Play (the churro), never the compass. */
const TREAT_ART = require('../../assets/images/prep-items/churros/churro_18.png');
/** Taps beside the challenge card in its first moment on screen are queued PLAY! taps, not a close. */
export const SCRIM_GRACE_MS = 900;
/** The line story lookup gets this long while the win card waits; after it the template story opens. */
export const STORY_LOOKUP_MS = 2500;
function storyWithin<T>(lookup: Promise<T>, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), STORY_LOOKUP_MS);
    lookup.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

export default function RedeemRedeemableModal({
  open,
  close,
  park,
  redeemable,
  onPress,
  onTaskCompleted,
  previewOnly = false,
}: {
  readonly close: () => void;
  readonly open?: boolean;
  readonly park: ParkType;
  readonly redeemable: CurrentRedeemableType;
  readonly onPress: () => void;
  readonly onTaskFailed?: (taskId: number) => void;
  readonly onTaskCompleted?: (taskId: number, isSecretTask: boolean) => void;
  readonly previewOnly?: boolean;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const { player, refreshPlayer } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  // Shark Events: today's Star Rides at this park (empty while the event flag is off).
  const starRides = useStarRides(park?.id ?? null);
  const doubleXP = !!player?.is_subscribed;
  const doubleCoins = !!player?.is_subscribed;
  const { currencies } = useContext(CurrencyContext);
  const { getTarget } = useCurrencyFly();
  // Rewards on the challenge card follow the unlock ladder (blueprint 4.4): Shark Coins first,
  // Parts and Energy with coin levels (rung 3), XP with Daily 3 (rung 4).
  const coinLevelsOpen = useRung('coin_levels').open;
  const dailyOpen = useRung('daily').open;

  // Flow state
  // Dev preview only: open a sample-only modal straight on a status card.
  const devFlowEnv = __DEV__ && previewOnly ? process.env.EXPO_PUBLIC_CHALLENGE_FLOW_PREVIEW as FlowState | undefined : undefined;
  const devFlow = devFlowEnv && ['lost', 'expired', 'claim-error', 'spend-error', 'save-error'].includes(devFlowEnv)
    ? devFlowEnv : undefined;
  const [flowState, setFlowState] = useState<FlowState>(devFlow ?? 'preview');
  // iOS must finish dismissing the game presentation before showing rewards.
  const [challengeModalHidden, setChallengeModalHidden] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [selectedGameData, setSelectedGameData] = useState<typeof CHALLENGE_GAMES[0] | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  const collectingRef = useRef(false);
  const flowStateRef = useRef<FlowState>('preview');

  // Keep ref in sync so callbacks always have current flowState
  useEffect(() => { flowStateRef.current = flowState; }, [flowState]);
  // From rung 3, a coin already on the shelf shows its Parts ring on the card (blueprint 5.3, scope 3).
  const ownedAssetId = open === true && coinLevelsOpen && redeemable?.type === 'task'
    && ((redeemable.model as TaskType).times_completed ?? 0) > 0 ? (redeemable.model as TaskType).asset_id ?? null : null;
  const [cardCoin, setCardCoin] = useState<RideCoinLevelType | null>(null);
  useEffect(() => {
    setCardCoin(null);
    if (ownedAssetId == null || !player?.id) return undefined;
    let alive = true;
    void loadCoin(player.id, ownedAssetId).then(coin => { if (alive) setCardCoin(coin); }).catch(() => undefined);
    return () => { alive = false; };
  }, [ownedAssetId, player?.id]);
  // The guide's pick after this win (NEXT COIN on the win card); guide-map resolves it on the map.
  // Read only while the win card is up: the map re-resolves on every GPS step while the player
  // walks, and this card (and its hidden win card) must not re-render with each one.
  const [guideTarget, setGuideTarget] = useState<GuideTarget | null>(null);
  const watchGuide = open === true && flowState === 'postwin';
  useEffect(() => {
    if (!watchGuide) return undefined;
    setGuideTarget(guide.current());
    return guide.subscribe(() => setGuideTarget(guide.current()));
  }, [watchGuide]);

  // Safe close: only allows closing during preview state
  const safeClose = useCallback(() => {
    if (flowStateRef.current === 'preview') {
      close();
    }
  }, [close]);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [ridePartsEarned, setRidePartsEarned] = useState(0);
  const [energyEarned, setEnergyEarned] = useState(0);
  const [coinTimesCollected, setCoinTimesCollected] = useState<number | null>(null);
  const [earnedEdition, setEarnedEdition] = useState<EarnedCoinEdition | null>(null);
  const [rideControl, setRideControl] = useState<RideControlReward | null>(null);
  const [rush, setRush] = useState<RushReward | null>(null);
  const [perkChips, setPerkChips] = useState<PerkChipData[]>([]);
  const [earnedFirstCoinStamp, setEarnedFirstCoinStamp] = useState<StampData | null>(null);
  const [nextRideTicketEarned, setNextRideTicketEarned] = useState(0);
  const [postWinCoin, setPostWinCoin] = useState<RideCoinLevelType | null>(null);
  const [postWinEnergy, setPostWinEnergy] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<CollectionMilestones | null>(null);
  const [firstCoinTicketReturned, setFirstCoinTicketReturned] = useState(false);
  const [lostTicketCost, setLostTicketCost] = useState(0);
  const [usedRescuePass, setUsedRescuePass] = useState(false);
  const [rescueRetryAvailable, setRescueRetryAvailable] = useState(false);
  // The "one more try" ad offer, shown once per lost challenge.
  const [adBusy, setAdBusy] = useState(false);
  const [retryOffered, setRetryOffered] = useState(true);
  // A member's VIP tries left today (read while the game plays); null until the server answers.
  const [vipLeft, setVipLeft] = useState<number | null>(null);
  const [vipNote, setVipNote] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [rescueUnavailable, setRescueUnavailable] = useState(false);
  const [proofRejected, setProofRejected] = useState(false);
  // Out of Tickets: earned Tickets waiting in the Stamp Book are claimed right here, first (blueprint 4.1).
  const [claimable, setClaimable] = useState<ClaimSource[] | null>(null);
  const [claiming, setClaiming] = useState(false);
  // How the lost try went, from the game (one loss card: "8 of 13 bonks.").
  const [rideTry, setRideTry] = useState<RideTrySummary | null>(null);
  // "1 coin this week" (Standings count) for the win card.
  const [weekWins, setWeekWins] = useState<string | null>(null);
  // This win was today's Adventure coin, with its line story next (the win card's big button plays it).
  const [lineStoryNext, setLineStoryNext] = useState(false);
  // TRY AGAIN names the lost attempt, so the server deals the same game.
  const retryOfRef = useRef<number | null>(null);
  // First coin ever (team step after the win card): the player's coin count when the card opened.
  const rideCoinsBeforeRef = useRef<number | null>(null);
  const spendingRef = useRef(false);
  const protectedRetryRef = useRef(false);
  const claimingRef = useRef(false);
  const afterRewardsHidden = useRef<(() => void) | null>(null);
  const attemptRef = useRef<TaskAttempt | null>(null);
  const savedAttemptIdRef = useRef<number | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const outcomeRef = useRef<'win' | 'loss' | null>(null);
  const proofRef = useRef<TaskGameProof | null>(null);
  const startLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);


  const isTaskType = redeemable?.type === 'task' || redeemable?.type === 'secret_task';
  const taskType = isTaskType ? redeemable.type as 'task' | 'secret_task' : null;
  const taskId = isTaskType ? redeemable.model.id : null;
  const ticketCost = isTaskType ? getTicketCost(redeemable) : 0;
  const playerTickets = player?.tickets ?? 0;
  const hasEnoughTickets = playerTickets >= ticketCost;
  const canUseRescuePass = taskType === 'task' && !hasEnoughTickets && !rescueUnavailable &&
    redeemable?.rescue_pass_available === true;
  const vip = !!player?.is_subscribed;
  const taskName = redeemable ? (redeemable.model as TaskType | SecretTaskType).name : '';
  const title = challengeTitle(taskType, taskName);
  // The free ways to play, in the one fixed order (freeTickets contract): claim, free try, extra tries,
  // the line Ticket (only while Queue Tickets is on), treats at home. The grown-up shop comes last.
  const queueTicketsOn = playFlagsNow().queueTickets;
  const wallet = {
    tickets: playerTickets, ticketCost: Math.max(1, ticketCost),
    claimable: claimable ?? [],
    rescueAvailable: canUseRescuePass, rescueSource: redeemable?.rescue_pass_source,
    heldPasses: Number(redeemable?.rescue_passes ?? 0), queueTicketsOn,
  };
  const outOfTickets = isTaskType && !hasEnoughTickets;
  // Earned Tickets are looked up first, so the button never offers the free try before a claim.
  const stepReady = !outOfTickets || claimable !== null;
  const freeStep = outOfTickets && stepReady ? challengeNextStep(wallet) : null;
  const freeSteps = outOfTickets && stepReady ? challengeFreeSteps(wallet) : [];
  const playsNow = !outOfTickets || freeStep?.kind === 'free_try' || freeStep?.kind === 'extra_try';
  const needTicket = outOfTickets && stepReady && (freeStep?.kind === 'line_ticket' || freeStep?.kind === 'treats');
  const needCopy = needTicketCopy(queueTicketsOn, !!redeemable?.rescue_pass_used_today);
  const rideRewardTask = isTaskType ? redeemable.model as TaskType | SecretTaskType : null;
  // Before coin levels open the card promises Shark Coins only. From rung 3 a coin already on the shelf
  // shows its Parts ring (how close it is to its next level); a coin not won yet shows the Parts its
  // first win brings. A ride's Energy is spent on the coin card, so it never sits here; a secret coin's
  // first win is the one Energy promise on this card (5.13). XP joins at rung 4.
  const cardParts = cardCoin && coinLevelsOpen ? partsProgress(cardCoin, player?.energy ?? null, 0) : null;
  const previewRideRewards = rideRewardTask ? [
    // The ride's own Shark Coins; a member's double coins show on the win card as their own "+N VIP" chip.
    { label: 'SHARK COINS', amount: rideRewardTask.coins, icon: 'coins' as const, show: rideRewardTask.coins > 0 },
    { label: 'RIDE PARTS', amount: rideRewardTask.ride_parts_reward ?? (taskType === 'secret_task' ? 2 : 1), icon: 'parts' as const,
      show: coinLevelsOpen && !cardParts },
    // A secret coin's first win also brings Energy (blueprint 5.13: +2 Parts and +15 Energy after rung 3).
    { label: 'ENERGY', amount: rideRewardTask.energy_reward ?? 15, icon: 'energy' as const,
      show: coinLevelsOpen && !cardParts && taskType === 'secret_task' },
    { label: 'XP', amount: doubleXP ? rideRewardTask.experience * 2 : rideRewardTask.experience, icon: 'xp' as const, show: dailyOpen },
  ].filter(reward => reward.show && reward.amount > 0) : [];

  const backgrounds = {
    task: '#0788e4',
    coin: '#ffaa4a',
    item: '#0879ca',
    pin: '#0879ca',
    secret_task: '#0768b9',
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setChallengeModalHidden(false);
      setFlowState(devFlow ?? (isTaskType ? 'recovering' : 'preview'));
      setSelectedGame(null);
      setSelectedGameData(null);
      selectedIndexRef.current = null;
      setCoinsEarned(0);
      setXpEarned(0);
      setRidePartsEarned(0);
      setEnergyEarned(0);
      setCoinTimesCollected(null);
      setEarnedEdition(null);
      setRideControl(null);
      setRush(null);
      setPerkChips([]);
      setEarnedFirstCoinStamp(null);
      setPostWinCoin(null);
      setPostWinEnergy(null);
      setMilestones(null);
      setFirstCoinTicketReturned(false);
      setLostTicketCost(0);
      setRetryOffered(true);
      setVipLeft(null);
      setVipNote(null);
      setUsedRescuePass(false);
      setRescueRetryAvailable(false);
      setStartError(null);
      setRescueUnavailable(false);
      setProofRejected(false);
      setClaimable(null);
      setClaiming(false);
      setRideTry(null);
      setWeekWins(null);
      retryOfRef.current = null;
      rideCoinsBeforeRef.current = typeof player?.ride_coins_collected === 'number' ? player.ride_coins_collected : null;
      void loadPlayFlags();
      attemptRef.current = null;
      savedAttemptIdRef.current = null;
      requestIdRef.current = null;
      outcomeRef.current = null;
      proofRef.current = null;
      startLocationRef.current = null;
    }
  }, [open, isTaskType, taskType, taskId, player?.id]);

  useEffect(() => {
    if (open && flowState === 'preview') {
      playSound(require('../../assets/sounds/redeem_modal_open.mp3'));
    }
  }, [open, flowState]);

  const applyAttemptState = useCallback((attempt: TaskAttempt) => {
    attemptRef.current = attempt;
    savedAttemptIdRef.current = attempt.id;
    setFirstCoinTicketReturned(!!attempt.first_coin_ticket_returned);
    setLostTicketCost(attempt.ticket_cost);
    setUsedRescuePass(!!attempt.rescue_pass);
    setRescueRetryAvailable(!!attempt.rescue_retry_available);
    setStartError(null);
    refreshPlayer?.().then(fresh => {
      if (fresh && savedAttemptIdRef.current === attempt.id)
        setPostWinEnergy(fresh.energy ?? 0);
    }).catch(() => undefined);
    if (attempt.status === 'won' && attempt.rewards) {
      setProofRejected(false);
      setCoinsEarned(attempt.rewards.coins_earned);
      setXpEarned(attempt.rewards.xp_earned);
      setRidePartsEarned(attempt.rewards.ride_parts_earned);
      setEnergyEarned(attempt.rewards.energy_earned);
      setCoinTimesCollected(attempt.rewards.coin_times_collected ?? null);
      setEarnedEdition(attempt.rewards.coin_edition ?? null);
      setRideControl(attempt.rewards.ride_control ?? null);
      setRush(attempt.rewards.rush ?? null);
      setPerkChips(serverPerkChips(attempt.rewards.perks));
      setNextRideTicketEarned(attempt.rewards.next_ride_ticket_earned ?? 0);
      setEarnedFirstCoinStamp(null);
      setLineStoryNext(false);
      if (attempt.task_type !== 'secret_task') {
        // Best effort: whatever this lookup does, the win itself is already shown.
        void Promise.resolve().then(() => getTripGoal()).then(goal => {
          if (savedAttemptIdRef.current === attempt.id)
            setLineStoryNext(adventureLineStoryNext(goal.adventure_ticket, attempt.task_id, park.id));
        }).catch(() => undefined);
      }
      if (attempt.rewards.coin_times_collected === 1) {
        void getStamps().then(response => {
          if (savedAttemptIdRef.current !== attempt.id) return;
          const stamp = Object.values(response.stamps).flat()
            .find(item => item.slug === 'first-ride-coin');
          if (stamp?.is_earned && response.newly_earned.includes(stamp.id))
            setEarnedFirstCoinStamp(stamp);
        }).catch(() => undefined);
      }
      if (attempt.rewards.coin_asset_id && player?.id) {
        const assetId = attempt.rewards.coin_asset_id;
        invalidateCoinCollection();
        loadCoin(player.id, assetId, { force: true }).then(coin => {
          if (savedAttemptIdRef.current === attempt.id) setPostWinCoin(coin);
        }).catch(() => {
          if (savedAttemptIdRef.current === attempt.id) setPostWinCoin(null);
        });
        // The shelf the coin will fly to loads while the player reads the summary.
        prefetchParkShelf(park.id, player.id);
        if (attempt.rewards.coin_times_collected === 1) {
          getCollectionMilestones(attempt.id).then(result => {
            if (savedAttemptIdRef.current === attempt.id) setMilestones(result);
          }).catch(() => undefined);
        }
      }
      onTaskCompleted?.(attempt.task_id, attempt.task_type === 'secret_task');
      markStandingsStale();
      setWeekWins(weekLine((attempt.rewards as { standings?: unknown }).standings));
      // Shark Coins, Tickets and the rest fly to where they live as the win card closes (PostWinRewardsModal).
      setFlowState('postwin');
    } else if (attempt.status === 'lost') {
      setRideTry(takeRideTry());
      setFlowState('lost');
    } else if (attempt.status === 'expired') {
      setFlowState('expired');
    } else if (attempt.status !== 'started') {
      setFlowState('claim-error');
    }
  }, [refreshPlayer, onTaskCompleted, player?.id, park.id]);

  const applyAttemptStateRef = useRef(applyAttemptState);
  useEffect(() => { applyAttemptStateRef.current = applyAttemptState; }, [applyAttemptState]);

  // A Ticket can already be spent when iOS closes the app. Recover by attempt
  // ID, or replay the original request ID and coordinates if its response was
  // lost. The server returns the same attempt without charging again.
  useEffect(() => {
    if (!open || !taskType || !taskId || devFlow) return;
    if (!player?.id) {
      setFlowState('auth-required');
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const saved = await readTaskAttemptCheckpoint(player.id, taskType, taskId);
        if (!alive) return;
        if (!saved) {
          if (!spendingRef.current) setFlowState('preview');
          return;
        }
        requestIdRef.current = saved.requestId;
        savedAttemptIdRef.current = saved.attemptId;
        startLocationRef.current = { latitude: saved.latitude, longitude: saved.longitude };
        const result = await recoverTaskAttempt(saved);
        if (!alive) return;
        if (!spendingRef.current) {
          applyAttemptStateRef.current(result.attempt);
          if (result.attempt.status === 'started') setFlowState('wheel');
        }
      } catch (error) {
        if (alive && !spendingRef.current) {
          console.warn('Could not restore ride challenge:', error);
          setFlowState('spend-error');
        }
      }
    })();
    return () => { alive = false; };
  }, [open, player?.id, taskType, taskId]);

  const clearAttemptCheckpoint = useCallback(async () => {
    if (!player?.id || !taskType || !taskId) return;
    await removeTaskAttemptCheckpoint(player.id, taskType, taskId);
  }, [player?.id, taskType, taskId]);

  // The request ID and active attempt survive retries while this modal is open.
  const handleStartWheel = useCallback(async () => {
    if (spendingRef.current || !player?.id || !taskType || !taskId) return;
    setStartError(null);
    spendingRef.current = true;
    let saved: TaskAttemptCheckpoint | null;
    try {
      saved = await readTaskAttemptCheckpoint(player.id, taskType, taskId);
    } catch (error) {
      console.warn('Could not check saved ride challenge:', error);
      setFlowState('spend-error');
      spendingRef.current = false;
      return;
    }
    const startLocation = saved
      ? { latitude: saved.latitude, longitude: saved.longitude }
      : location ?? startLocationRef.current;
    if (!startLocation) {
      spendingRef.current = false;
      return;
    }
    startLocationRef.current = startLocation;
    // Picture games only (a child who cannot read yet): the server deals Whack or Memory, never trivia.
    const pictureOnly = saved ? saved.pictureOnly === true : await pictureOnlyFor(player.id).catch(() => false);
    const requestId = saved?.requestId ?? requestIdRef.current ??
      `tps-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    requestIdRef.current = requestId;
    const checkpoint: TaskAttemptCheckpoint = {
      version: 1,
      playerId: player.id,
      taskType,
      taskId,
      requestId,
      attemptId: saved?.attemptId ?? attemptRef.current?.id ?? savedAttemptIdRef.current,
      latitude: startLocation.latitude,
      longitude: startLocation.longitude,
      savedAt: saved?.savedAt ?? Date.now(),
      // TRY AGAIN after a loss: the same game (the server honors it after be-core-loop deploys).
      ...((saved?.retryOf ?? retryOfRef.current) ? { retryOf: saved?.retryOf ?? retryOfRef.current } : {}),
      ...(pictureOnly ? { pictureOnly: true } : {}),
    };
    try {
      await writeTaskAttemptCheckpoint(checkpoint);
    } catch (error) {
      console.warn('Could not save ride challenge before Ticket spend:', error);
      setFlowState('save-error');
      spendingRef.current = false;
      return;
    }
    try {
      const result = await recoverTaskAttempt(checkpoint);
      retryOfRef.current = null;
      applyAttemptState(result.attempt);
      if (result.attempt.status === 'started') {
        playSound(require('../../assets/sounds/redeem_modal_open.mp3'));
        setFlowState('wheel');
      }
    } catch (firstError) {
      // The first response may have been lost after the Ticket was spent.
      // Retry with exactly the same key; the server will return the same attempt.
      try {
        const result = await recoverTaskAttempt(checkpoint);
        applyAttemptState(result.attempt);
        if (result.attempt.status === 'started') setFlowState('wheel');
      } catch (retryError) {
        console.error('Could not confirm Ticket attempt:', retryError);
        if ((retryError as any)?.response?.status === 422) {
          if ((retryError as any)?.response?.data?.code === 'no_ride_access') {
            setRescueUnavailable(true);
          }
          setStartError((retryError as any)?.response?.data?.message ||
            'This ride challenge is unavailable right now. Check your location and Tickets.');
          try {
            await clearAttemptCheckpoint();
            attemptRef.current = null;
            savedAttemptIdRef.current = null;
            requestIdRef.current = null;
            refreshPlayer?.();
            setFlowState('preview');
          } catch (clearError) {
            console.warn('Could not clear rejected ride challenge:', clearError);
            setFlowState('spend-error');
          }
        } else {
          setFlowState('spend-error');
        }
      }
    } finally {
      spendingRef.current = false;
    }
  }, [location, redeemable, player?.id, taskType, taskId, applyAttemptState, playSound, refreshPlayer, clearAttemptCheckpoint]);

  const handleCheckRideAccess = useCallback(async () => {
    setStartError(null);
    try {
      await refreshPlayer?.();
    } catch {
      setStartError('Could not refresh your Tickets. Check your internet and try again.');
    }
  }, [refreshPlayer]);

  // The server chooses the game when the Ticket is spent. The punch is a reveal,
  // not an extra gate for a guest whose group or line is ready to move.
  const selectAssignedGame = useCallback(() => {
    const gameIndex = CHALLENGE_GAMES.findIndex((game) => game.id === attemptRef.current?.game);
    if (gameIndex < 0) return false;
    const game = CHALLENGE_GAMES[gameIndex];
    selectedIndexRef.current = gameIndex;
    setSelectedGame(game.id);
    setSelectedGameData(game);
    return true;
  }, []);

  const handlePlayNow = useCallback(() => {
    if (!selectAssignedGame()) return;
    setFlowState('minigame');
  }, [selectAssignedGame]);

  // A spent Ticket goes straight into the punch reveal of the server-assigned
  // game; 'wheel' only lingers if that game is unknown to this build.
  useEffect(() => {
    if (!open || flowState !== 'wheel') return;
    if (selectAssignedGame()) setFlowState('spinning');
  }, [open, flowState, selectAssignedGame]);

  const resolveAttempt = useCallback(async (outcome: 'win' | 'loss', proof?: TaskGameProof) => {
    if (claimingRef.current || !attemptRef.current) return;
    claimingRef.current = true;
    outcomeRef.current = outcome;
    if (outcome === 'win' && proof) proofRef.current = proof;
    const id = attemptRef.current.id;
    try {
      const result = await resolveTaskAttempt(id, outcome, proofRef.current ?? undefined);
      applyAttemptState(result.attempt);
    } catch (error) {
      // A lost response is reconciled against the durable attempt record.
      try {
        const result = await getTaskAttempt(id);
        applyAttemptState(result.attempt);
        if (result.attempt.status === 'started') {
          setProofRejected((error as any)?.response?.status === 422);
          setFlowState('claim-error');
        }
      } catch (readError) {
        console.error('Could not confirm challenge result:', readError);
        setFlowState('claim-error');
      }
    } finally {
      claimingRef.current = false;
    }
  }, [applyAttemptState]);

  const handleGameWin = useCallback(async (proof?: TaskGameProof) => {
    await resolveAttempt('win', proof);
  }, [resolveAttempt]);

  const handleGameLose = useCallback(async () => {
    await resolveAttempt('loss');
  }, [resolveAttempt]);

  const handleLostClose = useCallback(async () => {
    if (flowStateRef.current === 'lost' || flowStateRef.current === 'expired') {
      await clearAttemptCheckpoint().catch(error =>
        console.warn('Could not clear resolved ride challenge:', error));
    }
    refreshPlayer?.(); // Refresh to show updated ticket count
    onPress(); // Refresh explore screen
    close();
  }, [refreshPlayer, onPress, close, clearAttemptCheckpoint]);

  const handleProtectedRetry = useCallback(async () => {
    if (!location || protectedRetryRef.current) return;
    protectedRetryRef.current = true;
    setFlowState('retrying');
    // A resolved loss is final. The next try needs a fresh request ID and
    // a new server-owned attempt; a returned Ticket or a free-try retry funds it.
    // It names the lost attempt, so TRY AGAIN deals the same game.
    retryOfRef.current = attemptRef.current?.id ?? retryOfRef.current;
    try {
      await clearAttemptCheckpoint();
      attemptRef.current = null;
      savedAttemptIdRef.current = null;
      requestIdRef.current = null;
      outcomeRef.current = null;
      proofRef.current = null;
      setSelectedGame(null);
      setSelectedGameData(null);
      await handleStartWheel();
    } catch (error) {
      console.warn('Could not prepare protected ride retry:', error);
      setFlowState('save-error');
    } finally {
      protectedRetryRef.current = false;
    }
  }, [handleStartWheel, location, clearAttemptCheckpoint]);

  // Out of Tickets: the Supplies tab of the Shark Shop, opened on Tickets.
  const openSupplies = useCallback(() => {
    close();
    RootNavigation.navigate('Store', { store: 'shark-shop', tab: 'supplies', focus: 'tickets' });
  }, [close]);

  // A VIP member's retry (blueprint 5.13): once the free refund is used, TRY AGAIN carries a quiet
  // "VIP try" through the existing One More Try grant. Non-members see no VIP line and no ad.
  const vipRetryCase = taskType !== null && lostTicketCost > 0 && !usedRescuePass
    && !firstCoinTicketReturned && !rescueRetryAvailable && vip;
  // Today's VIP tries are read while the game plays, so the loss card never offers a try that is not
  // there and never swaps its big button under a finger. With none left it says so kindly instead.
  useEffect(() => {
    if (!vip || flowState !== 'minigame') return undefined;
    let alive = true;
    void getAdSummary().then(summary => { if (alive) setVipLeft(vipTriesLeft(summary)); })
      .catch(() => { if (alive) setVipLeft(null); });
    return () => { alive = false; };
  }, [vip, flowState]);
  const vipOutToday = vipRetryCase && vipLeft === 0;
  const canOfferRetry = retryOffered && vipRetryCase && !vipOutToday;
  // One loss card per miss (the game's own card is skipped in a ride challenge, GameShellV2): its title,
  // one honest line from the game, the Ticket picture and the one way on.
  const lostCopy = lostTryCopy({ usedRescuePass, rescueRetryAvailable, firstCoinTicketReturned, lostTicketCost,
    retryOffered: canOfferRetry, near: rideTry?.near === true });
  const handleVipRetry = useCallback(async () => {
    const attemptId = attemptRef.current?.id;
    if (adBusy || !attemptId) return;
    setAdBusy(true);
    const outcome = await watchForReward('retry', attemptId, true).catch(() => ({ status: 'failed' as const }));
    setAdBusy(false);
    if (outcome.status === 'granted') {
      setRetryOffered(false);
      await refreshPlayer?.();
      await handleProtectedRetry();
      return;
    }
    setRetryOffered(false);
    setVipNote(outcome.status === 'checking' ? 'Your Ticket comes back in a moment. Tap PLAY! again.'
      : outcome.status === 'capped' ? VIP_TRY_TOMORROW : 'No VIP try for this coin right now.');
  }, [adBusy, refreshPlayer, handleProtectedRetry]);

  // Claim earned Tickets in place, then PLAY! spends one (blueprint 4.1: claim before the free try).
  useEffect(() => {
    if (!open || !isTaskType || flowState !== 'preview' || hasEnoughTickets || claimable !== null || previewOnly) return;
    let alive = true;
    void getStamps().then(response => {
      if (alive) setClaimable(stampClaimSources(Object.values(response.stamps).flat()));
    }).catch(() => { if (alive) setClaimable([]); });
    return () => { alive = false; };
  }, [open, isTaskType, flowState, hasEnoughTickets, claimable, previewOnly]);
  const handleClaimTickets = useCallback(async () => {
    if (claiming || !claimable?.length) return;
    setClaiming(true);
    setStartError(null);
    let failed = false;
    for (const source of claimable) {
      if (source.kind !== 'stamp' || typeof source.id !== 'number') continue;
      try { await claimStampReward(source.id); } catch { failed = true; }
    }
    try { await refreshPlayer?.(); } catch { failed = true; }
    setClaimable(null);
    setClaiming(false);
    if (failed) setStartError('Some Tickets did not claim. Check your internet and try again.');
  }, [claiming, claimable, refreshPlayer]);

  // The first coin has one fixed order (blueprint 4.3 rule 3): the win card, then (first coin ever,
  // no team yet) the team offer as its own one-tap step, then the map with nothing else.
  const firstCoinEver = coinTimesCollected === 1 && (rideCoinsBeforeRef.current === 0 || earnedFirstCoinStamp != null);
  // Whether this win opens the team step is read when the win card opens, not after it fades, so the
  // step slides in under the fading card: win card, team step, map, with no map frames in between
  // (the map's own cards never get a moment to show first).
  const teamStepReady = useRef<Promise<boolean>>(Promise.resolve(false));
  const postWinOpen = open === true && flowState === 'postwin';
  const needsTeamNow = !!(rideControl as { needs_team?: boolean } | null)?.needs_team;
  useEffect(() => {
    if (!postWinOpen) { teamStepReady.current = Promise.resolve(false); return; }
    const isNewCoin = coinTimesCollected === 1;
    teamStepReady.current = (needsTeamNow ? teamOffered(player?.id) : Promise.resolve(true))
      .then(offeredBefore => wantsTeamStep({ needsTeam: needsTeamNow, isNewCoin, firstCoinEver, offeredBefore }))
      .catch(() => false);
  }, [postWinOpen, needsTeamNow, player?.id, coinTimesCollected, firstCoinEver]);
  // One way out of the win card per win: a second tap while it fades does nothing.
  const leavingWinRef = useRef(false);
  // The win card's rewards fly to the map's pills, unless the card handed off to another screen.
  const flyAfterHideRef = useRef(true);
  useEffect(() => { if (postWinOpen) { leavingWinRef.current = false; flyAfterHideRef.current = true; } }, [postWinOpen]);

  /**
   * The first coin's team step, opened right now under the win card, then on to `then` (the shelf, or
   * the line story). Resolves once the step is on screen (the card then fades into it); false when this
   * win has no team step.
   */
  const openTeamStep = useCallback(async (then: { name: string; params?: object } | null): Promise<boolean> => {
    const wanted = await teamStepReady.current;
    if (!wanted) return false;
    teamStepReady.current = Promise.resolve(false);
    flyAfterHideRef.current = false;
    void markTeamOffered(player?.id);
    // The card stays on top until the team step has slid in under it, then fades into it (no map between).
    const shown = whenTeamStepShown();
    RootNavigation.navigate('TeamSelection', { firstCoin: true, ...(then ? { next: then } : {}) });
    await shown;
    return true;
  }, [player?.id]);

  const handlePostWinClose = useCallback(async () => {
    if (leavingWinRef.current) return;
    leavingWinRef.current = true;
    await clearAttemptCheckpoint().catch(error =>
      console.warn('Could not clear confirmed ride win:', error));
    afterRewardsHidden.current = null;
    await openTeamStep(null);
    onPress();
    close();
  }, [onPress, close, clearAttemptCheckpoint, openTeamStep]);

  // NEXT COIN: point the guide (the one owner, guide.setTarget), close, and the map draws the path.
  // On today's Adventure ride the big button plays its line story instead.
  const handleNextCoin = useCallback(async (button: { kind: 'next' | 'line_story' | 'map' }) => {
    if (leavingWinRef.current) return;
    leavingWinRef.current = true;
    await clearAttemptCheckpoint().catch(error =>
      console.warn('Could not clear confirmed ride win:', error));
    const target = guide.current();
    if (button.kind === 'next' && target) guide.setTarget(target.taskId, 'win_card');
    afterRewardsHidden.current = null;
    if (button.kind === 'line_story') {
      // The story is found while the card is still up (a short wait, never a blank map), then the first
      // coin ever still goes through the team step first (blueprint 4.3 rule 3), then on to the story.
      const wonTaskId = attemptRef.current?.task_id ?? taskId ?? 0;
      const ride = await storyWithin(resolveQueueStoryContext(park.id, 0, taskName, wonTaskId),
        { rideId: 0, rideName: taskName, parkId: park.id, postedWaitMinutes: null, imageUrl: null });
      // LinePlay opens its own sheets, so without a team step it waits until the card is gone.
      if (!(await openTeamStep({ name: 'LinePlay', params: { ride } }))) {
        afterRewardsHidden.current = () => RootNavigation.navigate('LinePlay', { ride });
      }
    } else {
      await openTeamStep(null);
    }
    onPress();
    close();
  }, [clearAttemptCheckpoint, onPress, close, park.id, taskName, taskId, openTeamStep]);

  const handleViewCoin = useCallback(async (openMastery = false) => {
    if (leavingWinRef.current) return;
    leavingWinRef.current = true;
    const focusCoinAssetId = attemptRef.current?.rewards?.coin_asset_id;
    const earnedCoin = createEarnedShelfArrival(attemptRef.current);
    const ownerId = player?.id;
    void clearAttemptCheckpoint().catch(error =>
      console.warn('Could not clear confirmed ride win:', error));
    // Coin to shelf in one move: the shelf (already loaded during the win card) opens right now
    // under the fading card, never after the card has faded and the map has held still. The
    // map's own refresh waits until the coin has landed, so it never competes with the flight.
    // The first coin ever goes through the team step first, then on to the shelf.
    const shelf = earnedCoin && ownerId
      ? { name: 'Park', params: { park: park.id, player: ownerId, earnedCoin, ...(openMastery ? { openMastery: true } : {}) } }
      : { name: 'CoinShelf', params: { focusCoin: focusCoinAssetId ? { assetId: focusCoinAssetId } : undefined } };
    if (!(await openTeamStep(shelf))) RootNavigation.navigate(shelf.name as never, shelf.params as never);
    close();
    setTimeout(onPress, SHELF_MAP_REFRESH_DELAY_MS);
  }, [onPress, close, clearAttemptCheckpoint, player?.id, park.id, openTeamStep]);

  // One door for every sheet (blueprint 4.3 rule 10, the PLAY RIDE freeze): the
  // challenge card waits until every sheet before it (a swipe-closed Ride
  // Control sheet still sliding away) is really gone, and holds its own layer
  // until UIKit reports it dismissed, so the win card never presents into it.
  const challengeLayer = useNativeModalLayer(open === true && flowState !== 'postwin' && !!redeemable, 'wait');
  // A sheet not on the layer list (or still dismissing) can make UIKit refuse the card: present it again.
  const challengeWatch = usePresentWatchdog(challengeLayer.present);
  // A kid mashing PLAY! while a sheet slides away: the card waits its turn, then zooms in under the
  // next taps. Those taps land beside the card, and must not close the card they just opened, so the
  // scrim only closes it once the card has been up for a moment.
  const cardShownAt = useRef(0);
  const closeFromScrim = useCallback(() => {
    if (Date.now() - cardShownAt.current < SCRIM_GRACE_MS) return;
    safeClose();
  }, [safeClose]);

  if (!redeemable) return null;

  const ticketTarget = flowState === 'lost' && firstCoinTicketReturned ? getTarget?.('tickets') ?? null : null;
  const freeBadge = freeStep?.kind === 'free_try' ? 'free' : freeStep?.kind === 'extra_try' ? 'extra' : null;
  const buttonLabel = !stepReady ? 'One moment' : claiming ? 'Claiming...' : needTicket ? NEED_TICKET_BUTTON : challengeButtonLabel(freeStep, ticketCost);
  const pressChallenge = () => {
    if (previewOnly || !stepReady || claiming) return;
    if (freeStep?.kind === 'claim') { void handleClaimTickets(); return; }
    if (needTicket) { safeClose(); return; }
    void handleStartWheel();
  };
  const coinUri = isTaskType ? (redeemable.model as TaskType).coin_url : undefined;

  return (
    <>
      <Modal
        key={`challenge-${challengeWatch.key}`}
        onShow={challengeWatch.onShow}
        animationIn="zoomIn"
        animationOut="zoomOut"
        swipeDirection={flowState === 'preview' ? 'down' : undefined}
        isVisible={challengeLayer.present}
        onModalWillShow={() => { cardShownAt.current = Date.now(); setChallengeModalHidden(false); }}
        onModalHide={() => { setChallengeModalHidden(true); challengeLayer.onDismissed(); }}
        onSwipeComplete={safeClose}
        onBackdropPress={closeFromScrim}
        onBackButtonPress={safeClose}
        backdropColor="#05346e"
        backdropOpacity={flowState === 'preview' ? 0.5 : 0.88}
        useNativeDriverForBackdrop
        statusBarTranslucent={flowState === 'minigame'}
        style={flowState === 'spinning' || flowState === 'minigame' || flowState === 'postwin' ? { margin: 0 } : undefined}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {flowState === 'recovering' && <ChallengeStatusCard title="Checking" art="loading"
            message="Getting back your ticket and any game you started." />}
          {flowState === 'auth-required' && <ChallengeStatusCard title="Sign In to Play"
            message="Sign in to play for ride coins. Go back to the map to sign in."
            primary={{ label: BACK_TO_MAP, onPress: handleLostClose }} />}

          {/* PREVIEW STATE */}
          {flowState === 'preview' && (
            <>
              <Pressable
                style={{ width: '100%', height: '100%', position: 'absolute' }}
                onPress={() => {
                  if (Date.now() - cardShownAt.current < SCRIM_GRACE_MS) return;
                  playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
                  safeClose();
                }}
              >
                {!isTaskType && <Lottie
                  source={require('../../assets/animations/confetti.json')}
                  autoPlay
                  loop
                  style={{ position: 'absolute', width: 900, height: 400, top: 15, zIndex: 20, left: -80 }}
                />}
              </Pressable>
              {/* box-none: a tap on the scrim beside the card (inside this wide row) reaches the close
                  Pressable under it instead of the swipe handler, so tapping anywhere off the card closes it. */}
              <View pointerEvents="box-none"
                style={{ width: Dimensions.get('window').width - 40, position: 'relative', zIndex: 10, alignItems: 'center' }}>
                <Ribbon text={isTaskType ? title : 'Congratulations'} />
                <View style={{
                  backgroundColor: backgrounds[redeemable.type as keyof typeof backgrounds],
                  borderRadius: 16, marginTop: '-10%', width: '85%', zIndex: 10,
                  paddingTop: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 8,
                  shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowRadius: 0, shadowOpacity: 0.4,
                  borderColor: 'rgba(0, 0, 0, .4)', borderWidth: 2,
                }}>
                  {/* How it works, as one picture strip in the card's header (a Ticket, a game, the coin), so
                      the button below never moves (the old tip pushed SPEND down the first time). */}
                  {isTaskType && <View style={styles.howStrip} accessible
                    accessibilityLabel="One Ticket buys one game. Win the game to win this coin.">
                    {freeBadge === 'free' ? <GameIcon name="gift" size={30} /> : freeBadge === 'extra' ? <TicketGift size={30} />
                      : <GameIcon name="ticket" size={30} />}
                    <GameIcon name="arrow" size={18} />
                    <GameIcon name="play" size={30} />
                    <GameIcon name="arrow" size={18} />
                    {coinUri ? <Image source={{ uri: coinUri }} style={styles.howCoin} contentFit="contain" />
                      : <GameIcon name="coin" size={30} />}
                  </View>}
                  <View style={{
                    paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderColor: 'rgba(0, 0, 0, .6)', borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2,
                    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                  }}>
                    <Box
                      background={require('../../assets/images/screens/explore/starburst.png')}
                      image={({
                        task: { uri: (redeemable.model as TaskType).coin_url },
                        secret_task: { uri: (redeemable.model as SecretTaskType).coin_url },
                        item: { uri: (redeemable.model as ItemType).icon_url },
                        pin: { uri: (redeemable.model as ItemType).icon_url },
                        coin: { uri: currencies[0]?.icon_url ?? park.coin_url },
                      } as Record<string, { uri: string }>)[redeemable.type] ?? { uri: park.coin_url }}
                      text={{
                        task: (redeemable.model as TaskType).name,
                        secret_task: (redeemable.model as SecretTaskType).name,
                        coin: `${(redeemable.model as CoinType).coins} Shark Coins`,
                        item: (redeemable.model as ItemType).name,
                        pin: (redeemable.model as ItemType).name,
                      }[redeemable.type]}
                      type={redeemable.type}
                      pulse
                    />
                    {/* Out of Tickets with no free way left, the help card takes the reward tiles' room, so the
                        card stays inside the screen on an iPhone SE (the title says what this coin is). */}
                    {!needTicket && <View style={{ marginLeft: -4, marginRight: -4, marginTop: 8, flexDirection: 'row', justifyContent: 'center' }}>
                      {isTaskType ? previewRideRewards.map(reward => (
                        <View key={reward.label} accessible accessibilityLabel={`${reward.amount} ${reward.label.toLowerCase()}`}
                          style={styles.rewardTile}>
                          <View style={styles.rewardIcon}><GameIcon name={reward.icon} size={34} /></View>
                          <Text style={styles.rewardAmount}>+{reward.amount}</Text>
                          <Text style={styles.rideRewardLabel}>{reward.label}</Text>
                        </View>
                      )) : <>
                        <View style={{ width: '33.3333%', paddingLeft: 4, paddingRight: 4 }}>
                          <Box
                            backgroundColor="#4cdcff"
                            image={require('../../assets/images/screens/explore/xp.png')}
                            text={doubleXP ? (redeemable.model as TaskType).experience * 2 : (redeemable.model as TaskType).experience}
                            small
                            type={redeemable.type}
                          />
                        </View>
                        {redeemable.type !== 'coin' && (
                          <View style={{ width: '33.3333%', paddingLeft: 4, paddingRight: 4 }}>
                            <Box backgroundColor="#4cdcff" image={{ uri: currencies[0].icon_url }}
                              text={doubleCoins ? (redeemable.model as TaskType).coins * 2 : (redeemable.model as TaskType).coins}
                              small type={redeemable.type} />
                          </View>
                        )}
                        <View style={{ width: '33.3333%', paddingLeft: 4, paddingRight: 4 }}>
                          <Box backgroundColor="#4cdcff" image={{ uri: park.coin_url }} text={1} small type={redeemable.type} />
                        </View>
                      </>}
                    </View>}
                    {/* The coin's Parts ring after rung 3: one line, the same as on the win card. */}
                    {!needTicket && cardParts && !cardParts.maxed && <View style={styles.partsLine} accessible
                      accessibilityLabel={cardParts.ready ? 'This coin is ready to level up'
                        : `${cardParts.have} of ${cardParts.need} Ride Parts for level ${cardParts.nextLevel}`}>
                      <GameIcon name="parts" size={22} />
                      <View style={styles.partsTrack}><View style={[styles.partsFill, { width: `${Math.round(cardParts.after * 100)}%` }]} /></View>
                      <Text style={styles.partsText}>{cardParts.ready ? 'Level up!' : `${cardParts.have}/${cardParts.need}`}</Text>
                    </View>}
                  </View>
                  <View style={{ marginTop: 8 }}>
                    {isTaskType ? (
                      <>
                        {/* Out of Tickets: the free way that plays now, in one short line above the same button. */}
                        {playsNow && outOfTickets && challengeStepLine(freeStep) && <Text style={styles.stepLine}>{withNumberFont(challengeStepLine(freeStep) ?? '')}</Text>}
                        {freeStep?.kind === 'claim' && <Text style={styles.stepLine}>{withNumberFont(challengeStepLine(freeStep) ?? '')}</Text>}
                        <YellowButton
                          text={buttonLabel}
                          disabled={!stepReady || claiming || (playsNow && !needTicket && freeStep?.kind !== 'claim' && !location)}
                          onPress={pressChallenge}
                        />
                        {needTicket && <View style={styles.ticketHelpCard}>
                          <View style={styles.rescueHead}>
                            <GameIcon name="ticket" size={26} />
                            <Text style={styles.ticketHelpTitle}>{needCopy.title}</Text>
                          </View>
                          {freeSteps.filter(step => step.kind === 'line_ticket' || step.kind === 'treats').map(step => (
                            <View key={step.kind} style={styles.wayRow}>
                              {/* The pocket watch means Wait Times only (ledger 37): the line Ticket wears the ride picture. */}
                              {step.kind === 'line_ticket' ? <GameIcon name="ride" size={22} />
                                : <Image source={TREAT_ART} style={styles.treatArt} contentFit="contain" />}
                              <Text style={styles.ticketHelpCopy}>{withNumberFont(step.kind === 'line_ticket'
                                ? 'Your first wait at a ride earns a Ticket.' : '3 treats at home = 1 Ticket.')}</Text>
                            </View>
                          ))}
                          {!!redeemable.rescue_pass_used_today && <View style={styles.wayRow}>
                            <GameIcon name="gift" size={22} />
                            <Text style={styles.ticketHelpCopy}>Tomorrow brings a new free try.</Text>
                          </View>}
                          {/* The grown-up shop comes last, under every free way: one small row that opens Supplies on
                              Tickets, where every purchase sits behind the grown-up gate. No price inside the card. */}
                          {storeAvailable() && !previewOnly && (
                            <Pressable onPress={openSupplies} accessibilityRole="button"
                              accessibilityLabel="Ask a grown-up. Opens the Shark Shop on Tickets."
                              style={({ pressed }) => [styles.shopRow, pressed && { opacity: 0.7 }]}>
                              <GameIcon name="ticket" size={20} />
                              <Text style={styles.shopRowText} numberOfLines={1} adjustsFontSizeToFit>Ask a grown-up: Shark Shop</Text>
                              <GameIcon name="arrow" size={14} />
                            </Pressable>
                          )}
                        </View>}
                        {startError && <Text style={styles.ticketError}>{startError}</Text>}
                        <View style={styles.ticketCountRow} accessible accessibilityLabel={`You have ${playerTickets} ticket${playerTickets === 1 ? '' : 's'}`}>
                          <GameIcon name="ticket" size={24} />
                          <Text style={styles.ticketCount}>{playerTickets} {playerTickets === 1 ? 'Ticket' : 'Tickets'}</Text>
                        </View>
                      </>
                    ) : (
                      <YellowButton
                        text="Collect"
                        onPress={async () => {
                          // One collect per tap: a double tap must not send two redeems or two coin flights.
                          if (collectingRef.current) return;
                          collectingRef.current = true;
                          try {
                          if (redeemable.type === 'coin') {
                            await redeemCoin(redeemable.model as CoinType, doubleXP);
                          } else if (redeemable.type === 'item' || redeemable.type === 'pin') {
                            await redeemItem(redeemable.model as ItemType, doubleXP, doubleCoins);
                          }
                          } catch {
                            collectingRef.current = false;
                            setStartError('That didn’t work. Check your internet, then tap Collect again.');
                            return;
                          }
                          collectingRef.current = false;
                          onPress();
                          playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
                          close();
                        }}
                      />
                    )}
                    {!isTaskType && startError && <Text style={styles.ticketError}>{startError}</Text>}
                  </View>
                </View>
              </View>
            </>
          )}

          {/* TICKET PUNCH: the spent Ticket tears and this ride's game pops up. */}
          {flowState === 'spinning' && selectedGameData && (
            <TicketPunch
              gameName={selectedGameData.name}
              gameColor={selectedGameData.color}
              rideName={taskName}
              kicker={punchLines(taskName).kicker}
              winLine={punchLines(taskName).win}
              note={proofRejected ? 'Same game. No new Ticket.'
                : attemptRef.current?.rescue_pass ? (redeemable?.rescue_pass_source === 'daily' ? 'Today’s free try' : 'An extra try') : undefined}
              onDone={() => setFlowState('minigame')}
            />
          )}
          {flowState === 'wheel' && <ChallengeStatusCard title="Game Ready"
            message="Your Ticket is used and your game is ready. If it does not start, update the app."
            primary={{ label: 'Play Now', onPress: handlePlayNow }} />}
          {flowState === 'spend-error' && <ChallengeStatusCard title="Reconnect" art="loading"
            message="We could not tell if this game started. Check your internet and tap Reconnect. You will not pay another Ticket."
            primary={{ label: 'Reconnect', onPress: handleStartWheel }}
            quiet={{ label: BACK_TO_MAP, onPress: handleLostClose }} />}
          {flowState === 'save-error' && <ChallengeStatusCard title="Not Started"
            message="This game did not start. No Ticket was used. Tap Try Again."
            primary={{ label: 'Try Again', onPress: (firstCoinTicketReturned || rescueRetryAvailable) &&
              ['lost', 'expired'].includes(attemptRef.current?.status ?? '') ? handleProtectedRetry : handleStartWheel }}
            quiet={{ label: BACK_TO_MAP, onPress: handleLostClose }} />}
          {flowState === 'retrying' && <ChallengeStatusCard title="Setting Up" art="loading"
            message="Checking your Ticket and starting the same game again." />}
          {flowState === 'expired' && <ChallengeStatusCard title="Time Ran Out"
            message={usedRescuePass
              ? rescueRetryAvailable
                ? 'This free try timed out. No Ticket was used, and you have one more go here today.'
                : 'This free try timed out. No Ticket was used.'
              : 'This game was not finished, so your Ticket came back to you.'}
            primary={rescueRetryAvailable ? { label: 'Try Again', onPress: handleProtectedRetry } : { label: BACK_TO_MAP, onPress: handleLostClose }}
            quiet={rescueRetryAvailable ? { label: BACK_TO_MAP, onPress: handleLostClose } : undefined}
            guardRetry={rescueRetryAvailable} />}
          {flowState === 'claim-error' && <ChallengeStatusCard title={proofRejected ? 'Replay This Game' : 'Checking Your Score'}
            art={proofRejected ? 'none' : 'loading'}
            message={proofRejected
              ? 'We could not count that game. Your try is still open. Play it again. It costs no new Ticket.'
              : 'We could not check your score yet. Check your internet and tap Reconnect. You will not pay another Ticket.'}
            primary={{ label: proofRejected ? 'Replay Game' : 'Reconnect', onPress: () => {
              if (proofRejected) {
                proofRef.current = null;
                outcomeRef.current = null;
                setSelectedGame(null);
                setSelectedGameData(null);
                setFlowState('wheel');
              } else if (outcomeRef.current) resolveAttempt(outcomeRef.current);
            } }}
            quiet={{ label: BACK_TO_MAP, onPress: handleLostClose }} />}
          {/* The one loss card: a kind title, one honest line from the game, the Ticket (it flies home when it
              came back) and one way on. A member's VIP try lives inside TRY AGAIN; nobody else sees a VIP line. */}
          {flowState === 'lost' && <ChallengeStatusCard title={lostCopy.title} art="soClose"
            message={vipNote ?? (vipOutToday ? VIP_TRY_TOMORROW : lostCopy.message)} ticket={lostCopy.ticket} line={rideTry?.line ?? null} ticketFlyTo={ticketTarget}
            primary={firstCoinTicketReturned || rescueRetryAvailable
              ? { label: location ? 'Try Again' : 'Finding You', icons: ['retry'], onPress: handleProtectedRetry, disabled: !location }
              : canOfferRetry
              ? { ...VIP_RETRY_ACTION, icons: [...VIP_RETRY_ACTION.icons], label: adBusy ? 'One Moment' : VIP_RETRY_ACTION.label,
                onPress: () => { void handleVipRetry(); }, disabled: adBusy || !location }
              : { label: BACK_TO_MAP, onPress: handleLostClose }}
            quiet={firstCoinTicketReturned || rescueRetryAvailable || canOfferRetry ? { label: BACK_TO_MAP, onPress: handleLostClose } : undefined}
            guardRetry={firstCoinTicketReturned || rescueRetryAvailable || canOfferRetry} />}

          {/* MINIGAME STATE - rendered inside the same modal */}
          {selectedGame && flowState === 'minigame' && (
            <View style={styles.minigameContainer}>
              <RideChallengeContext.Provider value={true}>
              <MiniGameSelector
                visible={true}
                taskId={(redeemable?.model as TaskType)?.id ?? 0}
                taskName={taskName}
                preferredGame={selectedGame}
                attemptSeed={attemptRef.current?.seed}
                rewardMode="task-attempt"
                parkId={park.id}
                onClose={handleGameLose}
                onComplete={(_mult, _rewards, proof) => handleGameWin(proof)}
              />
              </RideChallengeContext.Provider>
            </View>
          )}
        </View>
      </Modal>

      {/* The win card */}
      <PostWinRewardsModal
        visible={open === true && flowState === 'postwin' && challengeModalHidden}
        rideName={taskName}
        limited={redeemable?.type === 'task' ? (redeemable.model as TaskType)?.limited ?? null : null}
        taskCoinUrl={
          redeemable?.type === 'task'
            ? (redeemable.model as TaskType)?.coin_url
            : redeemable?.type === 'secret_task'
              ? (redeemable.model as SecretTaskType)?.coin_url
              : undefined
        }
        coinsEarned={coinsEarned}
        xpEarned={xpEarned}
        ridePartsEarned={ridePartsEarned}
        energyEarned={energyEarned}
        coinTimesCollected={coinTimesCollected}
        earnedEdition={earnedEdition}
        rideControl={rideControl}
        rush={rush}
        perks={perkChips}
        playerId={player?.id ?? null}
        earnedStamp={earnedFirstCoinStamp}
        nextRideTicketEarned={nextRideTicketEarned}
        coinProgress={postWinCoin}
        playerEnergy={postWinEnergy}
        milestones={milestones}
        weekLine={weekWins}
        nextTarget={guideTarget}
        wonTaskId={attemptRef.current?.task_id ?? taskId}
        adventureLineStory={lineStoryNext}
        onNextCoin={button => { void handleNextCoin(button); }}
        onViewCoin={handleViewCoin}
        onHidden={() => {
          const next = afterRewardsHidden.current;
          afterRewardsHidden.current = null;
          next?.();
        }}
        shouldFly={() => flyAfterHideRef.current}
        onClose={handlePostWinClose}
        starRide={redeemable?.type === 'task' && starRides.has((redeemable.model as TaskType)?.id)}
        attemptId={attemptRef.current?.status === 'won' ? attemptRef.current.id : null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  howStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, marginTop: -6, marginBottom: 6 },
  howCoin: { width: 30, height: 30 },
  rewardTile: { minWidth: 82, paddingHorizontal: 4, alignItems: 'center' },
  rewardIcon: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#bfe5ff', borderWidth: 3, borderColor: '#05346e',
    alignItems: 'center', justifyContent: 'center' },
  rewardAmount: { color: '#fff', fontFamily: 'Shark', fontSize: 18, textAlign: 'center', marginTop: 2,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  partsLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: '#fff8e4', borderRadius: 14,
    borderWidth: 2, borderColor: '#ffffff', paddingVertical: 5, paddingHorizontal: 10 },
  partsTrack: { flex: 1, height: 12, borderRadius: 7, backgroundColor: '#bfe5ff', borderWidth: 2, borderColor: '#ffffff', overflow: 'hidden' },
  partsFill: { height: '100%', borderRadius: 7, backgroundColor: '#ffcf3b' },
  partsText: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
  treatArt: { width: 24, height: 24 },
  stepLine: { color: '#ffffff', fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, textAlign: 'center', marginBottom: 6 },
  wayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  rideRewardLabel: { color: '#fff', fontFamily: 'Knockout', fontSize: 13,
    textAlign: 'center', marginTop: 1 },
  ticketError: { color: '#ffe07a', fontFamily: 'Knockout', fontSize: 15,
    textAlign: 'center', marginTop: 8 },
  ticketHelpCard: { backgroundColor: '#e4f7ff', borderColor: '#ffd443', borderWidth: 2,
    borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, marginTop: 8 },
  ticketHelpTitle: { color: '#075b9b', fontFamily: 'Shark', fontSize: 15 },
  ticketHelpCopy: { color: '#17446c', fontFamily: 'Knockout', fontSize: 15,
    lineHeight: 19, marginTop: 3 },
  ticketCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  ticketCount: { color: '#ffffff', fontFamily: 'Shark', fontSize: 18, textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  rescueHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  shopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 9,
    paddingTop: 7, borderTopWidth: 1, borderTopColor: 'rgba(7, 91, 155, 0.2)' },
  shopRowText: { color: '#075b9b', fontFamily: 'Knockout', fontSize: 15, flexShrink: 1 },
  minigameContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
