import Lottie from 'lottie-react-native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, View, Text, StyleSheet, TouchableOpacity, Easing } from 'react-native';
import Modal from 'react-native-modal';
import redeemCoin from '../api/endpoints/me/coins/redeem-coin';
import redeemItem from '../api/endpoints/me/items/redeem-item';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
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
import { getStamps, type StampData } from '../api/endpoints/me/stamps';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import * as RootNavigation from '../RootNavigation';
import TicketPunch from './TicketPunch';
import ChallengeStatusCard from './rewards/ChallengeStatusCard';
import { challengeRibbon, outOfTicketsCopy, type TicketSources } from './rewards/challengeCopy';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH * 0.7, 260);

// Ticket cost by ride importance tier
function getTicketCost(redeemable: CurrentRedeemableType): number {
  const model = redeemable.model as TaskType | SecretTaskType;
  if (typeof model.ticket_cost === 'number') {
    return model.ticket_cost;
  }
  return 1;
}

// Challenges the server can assign when a Ticket is spent
const GAMES = [
  { id: 'tap' as const, name: 'WHACK-A-SHARK', color: CHALLENGE_GAME_COLORS.tap },
  { id: 'timing' as const, name: 'RHYTHM TAP', color: CHALLENGE_GAME_COLORS.timing },
  { id: 'memory' as const, name: 'MEMORY MATCH', color: CHALLENGE_GAME_COLORS.memory },
  { id: 'trivia' as const, name: 'QUICK TRIVIA', color: CHALLENGE_GAME_COLORS.trivia },
  { id: 'photo' as const, name: 'SNAP THE RIDE', color: CHALLENGE_GAME_COLORS.photo },
];

type FlowState = 'recovering' | 'auth-required' | 'preview' | 'retrying' | 'wheel' | 'spinning' | 'minigame' | 'postwin' | 'lost' | 'claim-error' | 'spend-error' | 'save-error' | 'expired';
type GameType = 'tap' | 'timing' | 'memory' | 'trivia' | 'photo';

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
  const progress = useRef(new Animated.Value(0)).current;
  const doubleXP = !!player?.is_subscribed;
  const doubleCoins = !!player?.is_subscribed;
  const { currencies } = useContext(CurrencyContext);
  const { triggerFly } = useCurrencyFly();

  // Flow state
  // Dev preview only: open a sample-only modal straight on a status card.
  const devFlowEnv = __DEV__ && previewOnly ? process.env.EXPO_PUBLIC_CHALLENGE_FLOW_PREVIEW as FlowState | undefined : undefined;
  const devFlow = devFlowEnv && ['lost', 'expired', 'claim-error', 'spend-error', 'save-error'].includes(devFlowEnv)
    ? devFlowEnv : undefined;
  const [flowState, setFlowState] = useState<FlowState>(devFlow ?? 'preview');
  // iOS must finish dismissing the game presentation before showing rewards.
  const [challengeModalHidden, setChallengeModalHidden] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [selectedGameData, setSelectedGameData] = useState<typeof GAMES[0] | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  const flowStateRef = useRef<FlowState>('preview');

  // Keep ref in sync so callbacks always have current flowState
  useEffect(() => { flowStateRef.current = flowState; }, [flowState]);

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
  const [earnedFirstCoinStamp, setEarnedFirstCoinStamp] = useState<StampData | null>(null);
  const [nextRideTicketEarned, setNextRideTicketEarned] = useState(0);
  const [postWinCoin, setPostWinCoin] = useState<RideCoinLevelType | null>(null);
  const [postWinEnergy, setPostWinEnergy] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<CollectionMilestones | null>(null);
  const [firstCoinTicketReturned, setFirstCoinTicketReturned] = useState(false);
  const [lostTicketCost, setLostTicketCost] = useState(0);
  const [usedRescuePass, setUsedRescuePass] = useState(false);
  const [rescueRetryAvailable, setRescueRetryAvailable] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [rescueUnavailable, setRescueUnavailable] = useState(false);
  const [proofRejected, setProofRejected] = useState(false);
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
  const taskName = redeemable ? (redeemable.model as TaskType | SecretTaskType).name : '';
  const ribbon = challengeRibbon(taskType, (redeemable?.model as { coin_kind?: string | null } | undefined)?.coin_kind);
  const ticketSources = (redeemable as { ticket_sources?: TicketSources } | undefined)?.ticket_sources;
  const ticketHelp = outOfTicketsCopy({ sources: ticketSources, rescuePassUsedToday: !!redeemable?.rescue_pass_used_today });
  const rideRewardTask = isTaskType ? redeemable.model as TaskType | SecretTaskType : null;
  const previewRideRewards = rideRewardTask ? [
    { label: 'RIDE PARTS', amount: rideRewardTask.ride_parts_reward ?? (taskType === 'secret_task' ? 2 : 1),
      image: require('../../assets/images/ride-parts.png') },
    { label: 'ENERGY', amount: rideRewardTask.energy_reward ?? (taskType === 'secret_task' ? 15 : 10),
      image: require('../../assets/images/energy-reward.png') },
    { label: 'XP', amount: doubleXP ? rideRewardTask.experience * 2 : rideRewardTask.experience,
      image: require('../../assets/images/screens/explore/xp.png') },
  ] : [];

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
      setEarnedFirstCoinStamp(null);
      setPostWinCoin(null);
      setPostWinEnergy(null);
      setMilestones(null);
      setFirstCoinTicketReturned(false);
      setLostTicketCost(0);
      setUsedRescuePass(false);
      setRescueRetryAvailable(false);
      setStartError(null);
      setRescueUnavailable(false);
      setProofRejected(false);
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
      Animated.loop(
        Animated.timing(progress, { toValue: 1, duration: 2250, useNativeDriver: true })
      ).start();
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
      setNextRideTicketEarned(attempt.rewards.next_ride_ticket_earned ?? 0);
      setEarnedFirstCoinStamp(null);
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
      if (currencies[0]?.icon_url) {
        triggerFly({
          imageUrl: currencies[0].icon_url,
          amount: Math.min(attempt.rewards.coins_earned, 10),
          startX: SCREEN_WIDTH / 2,
          startY: Dimensions.get('window').height / 2,
          targetPosition: 'coins',
        });
      }
      setFlowState('postwin');
    } else if (attempt.status === 'lost') {
      setFlowState('lost');
    } else if (attempt.status === 'expired') {
      setFlowState('expired');
    } else if (attempt.status !== 'started') {
      setFlowState('claim-error');
    }
  }, [refreshPlayer, onTaskCompleted, currencies, triggerFly, player?.id, park.id]);

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
      setStartError('Could not refresh your Tickets. Try again when connected.');
    }
  }, [refreshPlayer]);

  // The server chooses the game when the Ticket is spent. The punch is a reveal,
  // not an extra gate for a guest whose group or line is ready to move.
  const selectAssignedGame = useCallback(() => {
    const gameIndex = GAMES.findIndex((game) => game.id === attemptRef.current?.game);
    if (gameIndex < 0) return false;
    const game = GAMES[gameIndex];
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
    // a new server-owned attempt; a returned Ticket or Rescue Pass retry funds it.
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

  const handlePostWinClose = useCallback(async () => {
    await clearAttemptCheckpoint().catch(error =>
      console.warn('Could not clear confirmed ride win:', error));
    onPress();
    close();
  }, [onPress, close, clearAttemptCheckpoint]);

  const handleViewCoin = useCallback(async (openMastery = false) => {
    const focusCoinAssetId = attemptRef.current?.rewards?.coin_asset_id;
    const earnedCoin = createEarnedShelfArrival(attemptRef.current);
    const ownerId = player?.id;
    await clearAttemptCheckpoint().catch(error =>
      console.warn('Could not clear confirmed ride win:', error));
    onPress();
    afterRewardsHidden.current = () => {
      if (earnedCoin && ownerId) RootNavigation.navigate('Park', {
        park: park.id, player: ownerId, earnedCoin, ...(openMastery ? { openMastery: true } : {}),
      });
      else RootNavigation.navigate('CoinShelf', {
        focusCoin: focusCoinAssetId ? { assetId: focusCoinAssetId } : undefined,
      });
    };
    close();
  }, [onPress, close, clearAttemptCheckpoint, player?.id, park.id]);

  const handleViewStampBook = useCallback(async () => {
    await clearAttemptCheckpoint().catch(error =>
      console.warn('Could not clear confirmed ride win:', error));
    onPress();
    afterRewardsHidden.current = () => RootNavigation.navigate('StampBook');
    close();
  }, [onPress, close, clearAttemptCheckpoint]);

  if (!redeemable) return null;

  // Determine what to show in the modal - keep it open during minigame too!
  const showModal = open && flowState !== 'postwin';

  return (
    <>
      <Modal
        animationIn="zoomIn"
        animationOut="zoomOut"
        swipeDirection={flowState === 'preview' ? 'down' : undefined}
        isVisible={showModal}
        onModalWillShow={() => setChallengeModalHidden(false)}
        onModalHide={() => setChallengeModalHidden(true)}
        onSwipeComplete={safeClose}
        onBackdropPress={safeClose}
        onBackButtonPress={safeClose}
        backdropColor="#05346e"
        backdropOpacity={flowState === 'preview' ? 0.5 : 0.88}
        useNativeDriverForBackdrop
        statusBarTranslucent={flowState === 'minigame'}
        style={flowState === 'spinning' || flowState === 'minigame' || flowState === 'postwin' ? { margin: 0 } : undefined}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {flowState === 'recovering' && <ChallengeStatusCard title="Checking" art="loading"
            message="Restoring any Ticket and game already in progress." />}
          {flowState === 'auth-required' && <ChallengeStatusCard title="Sign In to Play"
            message="Ride challenges and Tickets need a player account. Sign in from the map to start."
            primary={{ label: 'Return to Map', onPress: handleLostClose }} />}
          
          {/* PREVIEW STATE */}
          {flowState === 'preview' && (
            <>
              <Pressable
                style={{ width: '100%', height: '100%', position: 'absolute' }}
                onPress={() => {
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
              <View style={{ width: Dimensions.get('window').width - 40, position: 'relative', zIndex: 10, alignItems: 'center' }}>
                <Ribbon text={isTaskType ? canUseRescuePass ? 'Shark Rescue Pass' : ribbon.title : 'Congratulations'} />
                <View style={{
                  backgroundColor: backgrounds[redeemable.type as keyof typeof backgrounds],
                  borderRadius: 16, marginTop: '-10%', width: '85%', zIndex: 10,
                  paddingTop: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 8,
                  shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowRadius: 0, shadowOpacity: 0.4,
                  borderColor: 'rgba(0, 0, 0, .4)', borderWidth: 2,
                }}>
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
                        coin: `${(redeemable.model as CoinType).coins} Coins`,
                        item: (redeemable.model as ItemType).name,
                        pin: (redeemable.model as ItemType).name,
                      }[redeemable.type]}
                      type={redeemable.type}
                      pulse
                    />
                    {isTaskType && <Text style={styles.rideCoinPromise}>{ribbon.promise}</Text>}
                    <View style={{ marginLeft: -4, marginRight: -4, marginTop: 8, flexDirection: 'row', justifyContent: 'center' }}>
                      {isTaskType ? previewRideRewards.map(reward => (
                        <View key={reward.label} accessible accessibilityLabel={`${reward.amount} ${reward.label.toLowerCase()}`}
                          style={{ width: '33.3333%', paddingLeft: 4, paddingRight: 4 }}>
                          <Box image={reward.image} text={`+${reward.amount}`} small type={redeemable.type} />
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
                    </View>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    {isTaskType ? (
                      <>
                        {canUseRescuePass && <View style={styles.rescueCard}>
                          <View style={styles.rescueHead}>
                            <GameIcon name="gift" size={24} />
                            <Text style={styles.rescueEyebrow}>ONE FREE CHALLENGE TODAY</Text>
                          </View>
                          <Text style={styles.rescueCopy}>Out of Tickets? Play this new ride coin challenge free, with one retry if you miss. Win to earn a Ticket for your next ride.</Text>
                        </View>}
                        <YellowButton
                          text={hasEnoughTickets ? `Spend ${ticketCost} Ticket${ticketCost > 1 ? 's' : ''} to Play!`
                            : canUseRescuePass ? 'Use Rescue Pass to Play!' : 'Refresh Tickets'}
                          disabled={(hasEnoughTickets || canUseRescuePass) && !location}
                          onPress={previewOnly ? () => {} : hasEnoughTickets || canUseRescuePass
                            ? handleStartWheel : () => { void handleCheckRideAccess(); }}
                        />
                        {!hasEnoughTickets && !canUseRescuePass && <View style={styles.ticketHelpCard}>
                          <View style={styles.rescueHead}>
                            <GameIcon name="ticket" size={26} />
                            <Text style={styles.ticketHelpTitle}>{ticketHelp.title}</Text>
                          </View>
                          <Text style={styles.ticketHelpCopy}>{ticketHelp.body}</Text>
                        </View>}
                        {startError && <Text style={styles.ticketError}>{startError}</Text>}
                        <View style={styles.ticketCountRow} accessible accessibilityLabel={`You have ${playerTickets} Park Ticket${playerTickets === 1 ? '' : 's'}`}>
                          <GameIcon name="ticket" size={24} />
                          <Text style={styles.ticketCount}>{playerTickets} {playerTickets === 1 ? 'Ticket' : 'Tickets'}</Text>
                        </View>
                      </>
                    ) : (
                      <YellowButton
                        text="Collect"
                        onPress={async () => {
                          const screenCenterX = SCREEN_WIDTH / 2;
                          const screenCenterY = Dimensions.get('window').height / 2;
                          
                          if (redeemable.type === 'coin') {
                            await redeemCoin(redeemable.model as CoinType, doubleXP);
                            if (currencies[0]?.icon_url) {
                              triggerFly({
                                imageUrl: currencies[0].icon_url,
                                amount: Math.min((redeemable.model as CoinType).coins, 10),
                                startX: screenCenterX,
                                startY: screenCenterY,
                                targetPosition: 'coins',
                              });
                            }
                          } else if (redeemable.type === 'item' || redeemable.type === 'pin') {
                            await redeemItem(redeemable.model as ItemType, doubleXP, doubleCoins);
                          }
                          onPress();
                          playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
                          close();
                        }}
                      />
                    )}
                  </View>
                </View>
              </View>
            </>
          )}

          {/* TICKET PUNCH: the spent Ticket tears and the assigned game pops up. */}
          {flowState === 'spinning' && selectedGameData && (
            <TicketPunch
              gameName={selectedGameData.name}
              gameColor={selectedGameData.color}
              rideName={taskName}
              note={proofRejected ? 'Same challenge · no new Ticket'
                : attemptRef.current?.rescue_pass ? 'Shark Rescue Pass used' : undefined}
              onDone={() => setFlowState('minigame')}
            />
          )}
          {flowState === 'wheel' && <ChallengeStatusCard title="Challenge Ready"
            message="Your Ticket is spent and your game is waiting. Update the app if it does not start."
            primary={{ label: 'Play Now', onPress: handlePlayNow }} />}
          {flowState === 'spend-error' && <ChallengeStatusCard title="Reconnect" art="loading"
            message="We could not confirm whether this challenge started. Reconnect to resume it. No second Ticket is spent."
            primary={{ label: 'Reconnect', onPress: handleStartWheel }}
            quiet={{ label: 'Return to map', onPress: handleLostClose }} />}
          {flowState === 'save-error' && <ChallengeStatusCard title="Not Started"
            message="No Ticket was spent. This challenge could not be prepared safely. Try again."
            primary={{ label: 'Try Again', onPress: (firstCoinTicketReturned || rescueRetryAvailable) &&
              ['lost', 'expired'].includes(attemptRef.current?.status ?? '') ? handleProtectedRetry : handleStartWheel }}
            quiet={{ label: 'Return to map', onPress: handleLostClose }} />}
          {flowState === 'retrying' && <ChallengeStatusCard title="Setting Up" art="loading"
            message="Checking your Ticket and starting a fresh ride challenge." />}
          {flowState === 'expired' && <ChallengeStatusCard title="Time Ran Out"
            message={usedRescuePass
              ? rescueRetryAvailable
                ? 'This Rescue Pass try timed out. No Ticket was spent, and you have one more try here today.'
                : 'This Rescue Pass try timed out. No Ticket was spent.'
              : 'This challenge was not finished, so your Ticket came back to you.'}
            primary={rescueRetryAvailable ? { label: 'Try Again', onPress: handleProtectedRetry } : { label: 'Return to Map', onPress: handleLostClose }}
            quiet={rescueRetryAvailable ? { label: 'Return to map', onPress: handleLostClose } : undefined}
            guardRetry={rescueRetryAvailable} />}
          {flowState === 'claim-error' && <ChallengeStatusCard title={proofRejected ? 'Replay This Game' : 'Result Pending'}
            art={proofRejected ? 'none' : 'loading'}
            message={proofRejected
              ? 'This result did not pass the challenge check. Your attempt is still open. Replay the game, no new Ticket needed.'
              : 'We could not confirm your result yet. Reconnect to check the same attempt. No extra Ticket is spent.'}
            primary={{ label: proofRejected ? 'Replay Game' : 'Reconnect', onPress: () => {
              if (proofRejected) {
                proofRef.current = null;
                outcomeRef.current = null;
                setSelectedGame(null);
                setSelectedGameData(null);
                setFlowState('wheel');
              } else if (outcomeRef.current) resolveAttempt(outcomeRef.current);
            } }}
            quiet={{ label: 'Return to map', onPress: handleLostClose }} />}
          {flowState === 'lost' && <ChallengeStatusCard title="So Close!" art="soClose"
            message={usedRescuePass
              ? rescueRetryAvailable
                ? 'No Ticket spent. Your Rescue Pass gives you one more try at this ride today.'
                : 'Your Rescue Pass tries are used up. No Ticket was spent.'
              : firstCoinTicketReturned
              ? 'This coin is still out there, and your Ticket came back. Give it another go.'
              : lostTicketCost > 0 ? `This one got away. ${lostTicketCost} Ticket${lostTicketCost === 1 ? '' : 's'} spent.`
              : 'This one got away. No Ticket was spent.'}
            primary={firstCoinTicketReturned || rescueRetryAvailable
              ? { label: location ? 'Try Again' : 'Finding You', onPress: handleProtectedRetry, disabled: !location }
              : { label: 'Continue', onPress: handleLostClose }}
            quiet={firstCoinTicketReturned || rescueRetryAvailable ? { label: 'Return to map', onPress: handleLostClose } : undefined}
            guardRetry={firstCoinTicketReturned || rescueRetryAvailable} />}

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

      {/* Post-Win Rewards */}
      <PostWinRewardsModal
        visible={open === true && flowState === 'postwin' && challengeModalHidden}
        rideName={taskName}
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
        playerId={player?.id ?? null}
        earnedStamp={earnedFirstCoinStamp}
        nextRideTicketEarned={nextRideTicketEarned}
        coinProgress={postWinCoin}
        playerEnergy={postWinEnergy}
        milestones={milestones}
        onViewCoin={handleViewCoin}
        onViewStampBook={handleViewStampBook}
        onHidden={() => {
          const next = afterRewardsHidden.current;
          afterRewardsHidden.current = null;
          next?.();
        }}
        onClose={handlePostWinClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  rideCoinPromise: { color: '#fff', fontFamily: 'Shark', fontSize: 15,
    textAlign: 'center', marginTop: 8 },
  rideRewardLabel: { color: '#fff', fontFamily: 'Knockout', fontSize: 13,
    textAlign: 'center', marginTop: 3 },
  rescueCard: { backgroundColor: '#dff5ff', borderColor: '#ffd443', borderWidth: 3,
    borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 9 },
  rescueEyebrow: { color: '#075b9b', fontFamily: 'Shark', fontSize: 15 },
  rescueCopy: { color: '#17446c', fontFamily: 'Knockout', fontSize: 15,
    lineHeight: 20, marginTop: 3 },
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
  minigameContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
