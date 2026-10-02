/**
 * LinePlayScreen: the in-queue session UI.
 *
 * Layout (portrait, one-thumb):
 *   - Top: compact WaitCard (ride name, posted wait, elapsed, accrual, art).
 *   - Bottom: horizontal activity carousel (one activity per page).
 *   - The line is always moving: movement never pauses play. A big jump
 *     forward shows a non-blocking heads-up toast; a manual pause resumes
 *     with a quick 3-2-1.
 *   - Leaving the queue area or boarding opens the "Your ride's up!" wrap-up,
 *     which saves progress and wait credit, then the recap.
 *
 * Notably: NO keep-awake (games/queue must be battery-light and the timer is
 * server-side). The session controller lives in useLinePlaySession, which feeds
 * the shared LocationContext stream in; no new GPS watcher.
 *
 * Route params: { ride: RideContext }. Wire via Root.tsx Stack.Screen "LinePlay".
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import Topbar from '../../components/Topbar';
import TopbarText from '../../components/Topbar/TopbarText';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import Wrapper from '../../components/Wrapper';
import * as Haptics from 'expo-haptics';
import { StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../design-system';
import { GameDialog, gameAlert } from '../../ui';
import { rideDetectionEmitter } from '../../services/RideDetectionEmitter';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { useLinePlaySession } from '../../services/lineplay/useLinePlaySession';
import { isRecentQueueSample, MAX_SESSION_ACTIVITY_SLOTS } from '../../services/lineplay/LinePlaySession';
import { crewLivePrompt } from '../../services/lineplay/livePrompt';
import LinePlayLiveRail from './components/LinePlayLiveRail';
import getWikiTimes from '../../api/endpoints/parks/queue-times/getWikiTimes';
import { LocationContext, LocationStatusContext } from '../../context/LocationProvider';
import { AuthContext } from '../../context/AuthProvider';
import getRideCoins from '../../api/endpoints/me/ride-coins';
import { getStamps } from '../../api/endpoints/me/stamps';
import { getLinePlayFeedback, saveLinePlayFeedback, type LinePlayFeedback, type WaitRating, type FavoriteLinePlayActivity } from '../../api/endpoints/me/inline-timer/feedback';
import type { RideCoinLevelType } from '../../models/ride-coin-level-type';
// Wave 3 (2026-07-06): real GameKit games mount in the playlist slots.
import { WhackAShark } from '../../games/whack';
import { RhythmTapGame } from '../../games/rhythm';
import { MemoryGame } from '../../games/memory';
import { TriviaGame, createLinePlayTriviaSource } from '../../games/trivia';
import { SharkySwim } from '../../games/sharky';
import { BananaBasketGame } from '../../games/banana-basket';
import { CurrentQuestQueueGame } from '../../games/current-quest';
import SharkShowdown from '../../games/showdown/SharkShowdown';
import { showdownReplaySeed } from '../../games/showdown/logic';
import type { RideContext, ActivityItem } from '../../services/lineplay/LinePlaySession';
import { starsFromMultiplier, type QueueDifficulty } from '../../services/lineplay/replay';
import {
  PredictionCard,
  PredictionResolution,
  resolvePrediction,
} from '../../services/lineplay/content';
import { circuitThemeFor } from '../../services/lineplay/circuitTheme';
import SessionRecap from './components/SessionRecap';
import LineSnackOffer from './components/LineSnackOffer';
import QueueToast, { type QueueToastMessage } from './components/QueueToast';
import ResumeCountdown from './components/ResumeCountdown';
import { LINEPLAY_TOUR_STEP_MS, linePlayTourEnabled, linePlayTourSteps } from './devTour';
import WaitCard from './components/WaitCard';
import WaitCoinHero from './components/waitscreen/WaitCoinHero';
import NewRoundsBanner from './components/NewRoundsBanner';
import ActivitySlot from './components/ActivitySlot';
import ActivityPageRail from './components/ActivityPageRail';
import CrewGridCard from './components/CrewGridCard';
import SignalCard from './components/SignalCard';
import CrewPuzzleCard from './components/CrewPuzzleCard';
import ChapterCard from './components/ChapterCard';
import CrewRelayCard from './components/CrewRelayCard';
import ProjectMissionModal from './components/ProjectMissionModal';
import QueueArcadeSheet from './components/QueueArcadeSheet';
import BonusPicker from './components/BonusPicker';
import BonusPartFlight, { type FlightPoint } from './components/BonusPartFlight';
import type { RailChip } from './components/LinePlayLiveRail';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RootNavigation from '../../RootNavigation';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { MovementFxGate, MOVING_CHIP_LINGER_MS, nextBonusSeconds } from '../../services/lineplay/bonusRounds';
import { playBonusCue, type BonusCue } from '../../services/lineplay/bonusCues';
import type { CurrentTier } from '../../games/current-quest/v1/logic';

/** Shown once per install, before the first queue game. */
const EYES_UP_KEY = 'lineplay_eyes_up_seen_v1';
import { resolveProjectMission } from '../../services/lineplay/projectMission';
import { crewRelayEpilogue } from '../../services/lineplay/crewRelay';
import type { LinePlayChapter } from '../../services/lineplay/chapters';
import { linePlayPages, queueArcadeDestinations } from '../../services/lineplay/presentation';
import { personalizeChapterFinale, resolveChapterClue } from '../../services/lineplay/chapterClue';
import { useGroupPlay, type GroupTurnLaunch } from './group/useGroupPlay';

const { width: SCREEN_W } = Dimensions.get('window');
/** Returning after this long away gets a quick "welcome back" heads up. */
const WELCOME_BACK_AFTER_MS = 20_000;
const QUEUE_RECAP_SHARK = require('../../../assets/images/screens/lineplay/queue-recap-shark.png');

const GAME_NAMES: Record<string, string> = {
  tap: 'Whack-a-Shark', timing: 'Rhythm Tap', memory: 'Memory Match',
  trivia: 'Ride Trivia', shark: 'Sharky Swim', banana: 'Banana Basket', current: 'Current Quest',
  showdown: 'Shark Showdown',
};

function playedActivityName(id: string, playlist: readonly ActivityItem[], chapter: LinePlayChapter | null): string {
  const item = playlist.find(entry => entry.id === id);
  if (item?.kind === 'minigame') return GAME_NAMES[item.gameId] ?? 'Mini-game';
  if (item?.kind === 'crew_grid') return 'Crew Prompts';
  if (item?.kind === 'circuit') return 'Signal Repair';
  if (item?.kind === 'trivia') return chapter?.navigationPanel && id === `${chapter.id}-trivia`
    ? 'Starport navigation repair' : 'Ride trivia';
  if (item?.kind === 'lore') return chapter?.fieldNotes[item.seed % chapter.fieldNotes.length]?.title ?? 'Queue clue';
  if (item?.kind === 'prediction') return 'Wait prediction';
  if (id.startsWith('pred-')) return 'Wait prediction';
  if (item?.kind === 'crew_relay') return 'Crew relay';
  if (id.endsWith('-route-alpha')) return chapter?.relay.routeNames[0] ?? 'Crew route';
  if (id.endsWith('-route-omega')) return chapter?.relay.routeNames[1] ?? 'Crew route';
  if (id.startsWith('signal-bonus-')) return id.endsWith('route_a') ? 'Crew Memory Match' : 'Crew Whack-a-Shark';
  if (id.startsWith('project-')) return `Park chapter ${GAME_NAMES[id.split('-').at(-1) ?? ''] ?? 'round'}`;
  return 'Bonus round';
}

function pageName(item: ActivityItem | { kind: 'signal' | 'puzzle'; id: string }, chapter?: LinePlayChapter | null): string {
  switch (item.kind) {
    case 'chapter_intro': return 'Ride chapter';
    case 'crew_grid': return 'Crew Prompts';
    case 'circuit': return 'Signal Repair';
    case 'crew_relay': return 'Crew Relay';
    case 'signal': return 'Crew Route';
    case 'puzzle': return 'Codebreaker';
    case 'trivia': return chapter?.navigationPanel && item.id === `${chapter.id}-trivia` ? 'Signal repair' : 'Shark Trivia';
    case 'lore': return 'Field Note';
    case 'prediction': return 'Wait Prediction';
    case 'minigame': return item.title ?? GAME_NAMES[item.gameId] ?? 'Arcade round';
  }
}

function tabLabel(screen: string): string {
  return screen === 'Leaderboard' ? 'Standings' : screen;
}

import { useLinePlayLiveActivity } from '../../services/lineplay/useLinePlayLiveActivity';

import OneTimeTip from '../../components/help/OneTimeTip';
import { useHelp } from '../../components/help/HelpProvider';
import { linePlayTipReady } from '../../services/help/tipGate';

export default function LinePlayScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const ride: RideContext | undefined = route.params?.ride;

  const { session, snapshot } = useLinePlaySession();
  const { latestLocationSampleRef } = useContext(LocationStatusContext);
  const { player, refreshPlayer } = useContext(AuthContext);
  const prediction = snapshot.prediction;
  const completedActivityIds = useMemo(() => new Set(snapshot.completedActivityIds), [snapshot.completedActivityIds]);
  const [projectOpen, setProjectOpen] = useState(false);
  const [recapCoin, setRecapCoin] = useState<RideCoinLevelType | null>(null);
  const [recapCoinState, setRecapCoinState] = useState<'idle' | 'loading' | 'owned' | 'unowned' | 'unavailable'>('idle');
  const [recapEnergy, setRecapEnergy] = useState<number | null>(null);
  const [recapEnergyUnavailable, setRecapEnergyUnavailable] = useState(false);
  const [queueStamp, setQueueStamp] = useState<{ earned: boolean; new: boolean } | null>(null);
  const [feedback, setFeedback] = useState<LinePlayFeedback | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [backgroundPermissionBusy, setBackgroundPermissionBusy] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const queuedArcadeGame = useRef<Extract<ActivityItem, { kind: 'minigame' }> | null>(null);
  const activityListRef = useRef<FlatList<any>>(null);
  const pendingEncoreId = useRef<string | null>(null);
  const tabAfterRecap = useRef<string | null>(null);
  const manualEncoreRequested = useRef(false);
  const lastExtraRounds = useRef(0);
  const [newRoundNotice, setNewRoundNotice] = useState<{ id: string; count: number } | null>(null);
  const queuedProjectGame = useRef<Extract<ActivityItem, { kind: 'minigame' }> | null>(null);
  const startedRef = useRef<{ session: typeof session; playerId: number; rideId: number } | null>(null);
  /** The "How did your wait end?" sheet; `tab` continues to that tab after the recap. */
  const [waitEndPrompt, setWaitEndPrompt] = useState<{ tab: string | null } | null>(null);
  const [resuming, setResuming] = useState(false);
  const [toast, setToast] = useState<QueueToastMessage | null>(null);
  const toastKey = useRef(0);
  const showToastRef = useRef<((message: Omit<QueueToastMessage, 'key'>) => void) | null>(null);
  const showToast = useCallback((message: Omit<QueueToastMessage, 'key'>) => {
    toastKey.current += 1;
    setToast({ ...message, key: toastKey.current });
  }, []);

  const enableLockedScreenPlay = async () => {
    if (backgroundPermissionBusy) return;
    setBackgroundPermissionBusy(true);
    try {
      let permission = await Location.getBackgroundPermissionsAsync();
      if (!permission.granted && !permission.canAskAgain) {
        gameAlert('Play while locked',
          'Allow Always location in iPhone Settings so verified queue time can continue while LinePlay is in the background.',
          [{ text: 'Keep app open', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } }], { icon: 'settings' });
        return;
      }
      if (!permission.granted) permission = await Location.requestBackgroundPermissionsAsync();
      if (permission.granted) {
        const ready = await session.retryBackgroundTracking();
        if (!ready) gameAlert('Keep LinePlay open',
          'Background tracking could not start. Keep the app open while you wait to earn verified queue progress.');
      }
    } catch {
      gameAlert('Keep LinePlay open',
        'Background tracking is unavailable right now. You can still play and earn verified queue progress with the app open.');
    } finally {
      setBackgroundPermissionBusy(false);
    }
  };

  useEffect(() => {
    if (!snapshot.serverSessionId || snapshot.backgroundTrackingAvailable !== false) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      void Location.getBackgroundPermissionsAsync()
        .then(permission => {
          if (permission.granted) return session.retryBackgroundTracking();
        })
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [session, snapshot.serverSessionId, snapshot.backgroundTrackingAvailable]);

  useEffect(() => {
    if (!snapshot.rewards) return;
    let alive = true;
    setRecapEnergy(null);
    setRecapEnergyUnavailable(false);
    void refreshPlayer().then(updated => {
      if (alive) {
        setRecapEnergy(updated.energy ?? null);
        setRecapEnergyUnavailable(updated.energy == null);
      }
    }).catch(() => {
      if (alive) setRecapEnergyUnavailable(true);
    });
    return () => { alive = false; };
  }, [snapshot.rewards]);

  useEffect(() => {
    if (snapshot.state === 'active' && snapshot.creditedParts != null && snapshot.creditedParts > 0)
      void refreshPlayer().catch(() => undefined);
  }, [snapshot.creditedParts, snapshot.state]);

  // First Ride Part ever: Finn explains what it is for, once, between games.
  const { hasSeenTip, tipsReady } = useHelp();
  const [partTipPending, setPartTipPending] = useState(false);
  useEffect(() => {
    if (tipsReady && (snapshot.creditedParts ?? 0) > 0 && !hasSeenTip('first_ride_part')) setPartTipPending(true);
  }, [snapshot.creditedParts, tipsReady, hasSeenTip]);

  useEffect(() => {
    if (snapshot.state !== 'complete' || !snapshot.rewards ||
        snapshot.verifiedEligibleSeconds < 600 || !player?.id) return;
    let alive = true;
    void getStamps().then(response => {
      const stamp = Object.values(response.stamps).flat()
        .find(item => item.slug === 'queue-navigator');
      if (alive) setQueueStamp(stamp?.is_earned
        ? { earned: true, new: response.newly_earned.includes(stamp.id) }
        : null);
    }).catch(() => {
      if (alive) setQueueStamp(null);
    });
    return () => { alive = false; };
  }, [snapshot.state, snapshot.rewards != null, snapshot.verifiedEligibleSeconds, player?.id]);

  useEffect(() => {
    const id = snapshot.serverSessionId;
    if (!id || snapshot.state !== 'complete' || !snapshot.rewards) return;
    let alive = true;
    setFeedback(null);
    setFeedbackLoading(true);
    void getLinePlayFeedback(id).then(value => {
      if (alive) setFeedback(value);
    }).catch(() => {
      // The optional question remains available if the read fails.
    }).finally(() => {
      if (alive) setFeedbackLoading(false);
    });
    return () => { alive = false; };
  }, [snapshot.serverSessionId, snapshot.state, snapshot.rewards != null]);

  const submitFeedback = useCallback(async (rating: WaitRating, favorite?: FavoriteLinePlayActivity | null) => {
    const id = snapshot.serverSessionId;
    if (!id || feedbackSaving) return;
    setFeedbackSaving(true);
    setFeedbackError(null);
    try {
      const saved = await saveLinePlayFeedback(id, rating, completedActivityIds.size, favorite);
      setFeedback(saved);
    } catch {
      setFeedbackError('Could not save your answer. Tap again when connected.');
    } finally {
      setFeedbackSaving(false);
    }
  }, [snapshot.serverSessionId, feedbackSaving, completedActivityIds.size]);

  useEffect(() => {
    const assetId = snapshot.rewards?.coinAssetId;
    if (snapshot.state !== 'complete' || !assetId || !player?.id) return;
    let alive = true;
    setRecapCoinState('loading');
    void getRideCoins().then(response => {
      if (!alive) return;
      const coin = response.data.find(item => item.id === assetId) ?? null;
      setRecapCoin(coin);
      setRecapCoinState(coin ? 'owned' : 'unowned');
    }).catch(() => {
      if (alive) setRecapCoinState('unavailable');
    });
    return () => { alive = false; };
  }, [snapshot.state, snapshot.rewards?.coinAssetId, player?.id]);

  // Start the session once, on mount, if we have a ride.
  useEffect(() => {
    const previewPlayerId = __DEV__ && process.env.EXPO_PUBLIC_LINEPLAY_FLOW_PREVIEW === '1'
      ? 99999999 : undefined;
    const playerId = player?.id ?? previewPlayerId;
    if (!ride || !playerId) return;
    if (startedRef.current?.session === session && startedRef.current.playerId === playerId &&
        startedRef.current.rideId === ride.rideId) return;
    startedRef.current = { session, playerId, rideId: ride.rideId };
    const freshSample = latestLocationSampleRef.current;
    void session.start(ride, isRecentQueueSample(freshSample) ? freshSample : undefined, playerId);
  }, [ride, session, player?.id]);

  // The existing queue feed supplies an entrance-board signal. Poll only
  // while this screen is foregrounded; it never estimates the guest's place.
  useEffect(() => {
    if (!ride?.waitFeedRideId || !ride.parkId ||
        (snapshot.state !== 'active' && snapshot.state !== 'paused')) return;
    let alive = true;
    let inFlight = false;
    let controller: AbortController | null = null;
    const check = async () => {
      if (!alive || inFlight || AppState.currentState !== 'active') return;
      inFlight = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      try {
        const entries = await getWikiTimes(ride.parkId!, controller.signal);
        if (!alive) return;
        const entry = entries.find(item => item.id === ride.waitFeedRideId);
        const minutes = entry?.status === 'OPERATING' ? entry.queue?.STANDBY?.waitTime : null;
        if (minutes != null) session.updateEntranceWait(minutes, Date.now());
      } catch {
        // Local activities continue while the feed is unavailable.
      } finally {
        clearTimeout(timeout);
        controller = null;
        inFlight = false;
      }
    };
    // The return to the app checks at once (below); no feed downloads in a pocket.
    const interval = setInterval(() => { if (AppState.currentState === 'active') void check(); }, 120_000);
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => {
      alive = false;
      clearInterval(interval);
      appStateSubscription.remove();
      controller?.abort();
    };
  }, [session, ride?.parkId, ride?.waitFeedRideId, snapshot.state]);

  // The line jumped well ahead: a gentle heads up. It never pauses anything.
  useEffect(() => {
    if (snapshot.queueAdvanceAt == null || snapshot.state !== 'active') return;
    // Bonus rounds show the "Line moving. Eyes up." rail chip instead.
    if (snapshot.bonus?.enabled) { session.acknowledgeQueueAdvance(); return; }
    showToast({ icon: 'ride', title: 'The line is moving!', body: 'Keep playing as you walk. Your round is safe.' });
    session.acknowledgeQueueAdvance();
  }, [snapshot.queueAdvanceAt, snapshot.state, session, showToast]);

  // Phone pocketed or app switched: everything is saved. On return, say so.
  useEffect(() => {
    if (snapshot.state !== 'active' && snapshot.state !== 'paused') return;
    let awayAt: number | null = null;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { awayAt ??= Date.now(); return; }
      if (awayAt != null && Date.now() - awayAt >= WELCOME_BACK_AFTER_MS) {
        showToast({ icon: 'timer', title: 'Welcome back!', body: 'Your wait kept counting and your games are saved.' });
      }
      awayAt = null;
    });
    return () => subscription.remove();
  }, [snapshot.state === 'active' || snapshot.state === 'paused', showToast]);

  // Boarding detection: the ride tracker thinks this guest rode. One fix
  // outside the ride radius can fake that in an indoor queue, so it only asks.
  useEffect(() => {
    if (!ride) return;
    return rideDetectionEmitter.on('rideDetected', detection => {
      if (detection.rideId === ride.rideId) session.suggestBoarded();
    });
  }, [ride?.rideId, session]);

  useEffect(() => {
    if (!snapshot.parkProject) {
      queuedProjectGame.current = null;
      setProjectOpen(false);
    }
  }, [snapshot.parkProject?.id]);

  const handlePredict = useCallback((card: PredictionCard, guess: 'beat' | 'miss') => {
    session.choosePrediction(card, guess);
    void Haptics.selectionAsync();
  }, [session]);

  const [activeGame, setActiveGame] =
    useState<(Extract<ActivityItem, { kind: 'minigame' }> & { difficulty: QueueDifficulty; tier?: CurrentTier;
      /** Play together: this game is one player's pass-and-play turn (L3). */
      groupTurn?: boolean; kidRound?: boolean }) | null>(null);
  const groupPlayRef = useRef<ReturnType<typeof useGroupPlay> | null>(null);

  // A full-screen game hides every sheet: hold the wrap-up countdown for it.
  useEffect(() => { session.setGameOpen(activeGame != null); }, [activeGame != null, session]);

  // Leaving the queue area starts a wrap-up; it shows once no game covers it.
  const lineDone = snapshot.state === 'ending' && snapshot.endReason === 'left_queue' && activeGame == null;
  const boardingAsk = snapshot.boardingSuggested && activeGame == null &&
    (snapshot.state === 'active' || snapshot.state === 'paused');
  useEffect(() => {
    if (lineDone || boardingAsk) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [lineDone, boardingAsk]);

  // TriviaGame holds its question cursor in the source. Keep one source for
  // the whole round even while LinePlay emits a new timer snapshot each second.
  const lineTriviaSource = useMemo(() =>
    activeGame?.gameId === 'trivia' && ride
      ? createLinePlayTriviaSource({
          rideId: ride.rideId,
          parkId: ride.parkId,
          chapterId: snapshot.chapter?.id,
          seed: activeGame.seed,
          // A kid's turn deals the kids deck and easy cards first.
          kids: activeGame.kidRound === true,
        })
      : null,
  [activeGame?.id, activeGame?.seed, activeGame?.gameId, activeGame?.kidRound, ride?.rideId, ride?.parkId, snapshot.chapter?.id]);

  const handlePlayGame = useCallback((item: Extract<ActivityItem, { kind: 'minigame' }>) => {
    if (session.getState() !== 'active') return;
    // A crew on one phone: the same game becomes a pass-and-play round (L3).
    if (groupPlayRef.current?.wantsRound(item)) { groupPlayRef.current.startRound(item); return; }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // The session owns replay variety: the first play keeps the saved board,
    // each replay deals a new one, and the count survives a restart.
    const open = () => {
      if (session.getState() !== 'active') return;
      const launch = session.beginGame(item);
      setActiveGame({ ...item, seed: item.gameId === 'showdown'
        ? showdownReplaySeed(item.seed, launch.plays) : launch.seed, difficulty: launch.difficulty, tier: launch.tier });
    };
    // First game this install: a one-time safety line. Walking never pauses play.
    void AsyncStorage.getItem(EYES_UP_KEY).then(seen => {
      if (seen) return;
      void AsyncStorage.setItem(EYES_UP_KEY, '1');
      showToastRef.current?.({ icon: 'queue', title: 'Eyes up in line.', body: 'Games never pause for walking.' });
    }).catch(() => undefined);
    // Bonus rounds: Current Quest plays the server's own seed and tier.
    if (item.gameId === 'current' && session.snapshot().bonus?.enabled) {
      void session.prepareBonusQuest().finally(open);
      return;
    }
    open();
  }, [session]);

  const handleGameDone = useCallback(() => {
    // Games show their own GameShellV2 results screen; session rewards stay
    // server-side via the inline timer: nothing is granted per round here.
    setActiveGame(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleActivityCompleted = useCallback((id: string) => {
    session.markActivityCompleted(id);
  }, [session]);

  const renderActiveGame = () => {
    if (!activeGame || !ride) return null;
    const groupTurn = activeGame.groupTurn === true;
    const finishTurn = (multiplier: number, meta?: Record<string, unknown>) => {
      const score = typeof meta?.score === 'number' ? meta.score : null;
      groupPlayRef.current?.finishTurn(starsFromMultiplier(multiplier), score);
      handleGameDone();
    };
    const common = {
      visible: true,
      seed: activeGame.seed,
      onClose: groupTurn ? () => finishTurn(0) : handleGameDone,
      onComplete: groupTurn ? finishTurn : (multiplier: number, meta?: Record<string, unknown>) => {
        if (activeGame.gameId === 'current') session.recordCurrentQuest(meta);
        session.recordGameResult(activeGame.gameId, starsFromMultiplier(multiplier));
        handleActivityCompleted(activeGame.id);
        handleGameDone();
      },
    };
    switch (activeGame.gameId) {
      case 'tap': return <WhackAShark {...common} difficulty={activeGame.difficulty} taskName={ride.rideName} />;
      case 'timing': return <RhythmTapGame visible seed={activeGame.seed}
        onClose={common.onClose} onComplete={common.onComplete} />;
      case 'memory': return <MemoryGame {...common} deckId={snapshot.chapter?.finale.memoryDeckId} taskName={ride.rideName}
        difficulty={activeGame.kidRound ? 0 : undefined} />;
      case 'shark': return <SharkySwim {...common} difficulty={activeGame.difficulty} />;
      case 'banana': return <BananaBasketGame {...common}
        difficulty={(activeGame.kidRound ? 1 : Math.max(2, activeGame.difficulty)) as QueueDifficulty} />;
      case 'current': return <CurrentQuestQueueGame {...common} taskName={ride.rideName} tier={activeGame.tier} />;
      case 'showdown': return <SharkShowdown {...common} rideId={ride.rideId} parkId={ride.parkId}
        chapterId={snapshot.chapter?.id} rideName={ride.rideName} />;
      case 'trivia':
        return lineTriviaSource ? (
          <TriviaGame
            {...common}
            title="Line Trivia"
            source={lineTriviaSource}
            readableFacts
          />
        ) : null;
      default: return null;
    }
  };

  const finishFailed = useCallback(() =>
    gameAlert('Could not finish', 'Stay on this recap and try again.'), []);

  /** One branded sheet for every way a guest can end a wait by hand. */
  const handleEndSession = useCallback(() => setWaitEndPrompt({ tab: null }), []);

  const answerWaitEnd = useCallback((boarded: boolean | null) => {
    const tab = waitEndPrompt?.tab ?? null;
    setWaitEndPrompt(null);
    if (boarded == null) return;
    if (tab) tabAfterRecap.current = tab;
    void session.endNow(boarded).catch(finishFailed);
  }, [session, waitEndPrompt, finishFailed]);

  const handleExit = useCallback(async () => {
    try {
      await session.complete();
      if (!session.snapshot().rewardsPending) await session.forgetCheckpoint();
      navigation.goBack();
    } catch {
      finishFailed();
    }
  }, [navigation, session, finishFailed]);

  const handleNavigateTab = useCallback((screen: string) => {
    const state = session.getState();
    if (state === 'active' || state === 'paused') {
      setWaitEndPrompt({ tab: screen });
      return;
    }
    if (state === 'ending') {
      tabAfterRecap.current = screen;
      void session.complete().catch(finishFailed);
      return;
    }
    void (async () => {
      try {
        await session.complete();
        if (!session.snapshot().rewardsPending) await session.forgetCheckpoint();
        navigation.dispatch(StackActions.replace(screen));
      } catch {
        finishFailed();
      }
    })();
  }, [navigation, session, finishFailed]);

  const handleOpenCoin = useCallback(async () => {
    if (!snapshot.rewardsPending) await session.forgetCheckpoint();
    navigation.dispatch(StackActions.replace('CoinShelf', recapCoin
      ? { focusCoin: { assetId: recapCoin.id } } : {}));
  }, [navigation, session, snapshot.rewardsPending, recapCoin?.id]);

  const handleOpenPark = useCallback(async () => {
    if (!ride?.parkId || !player?.id) {
      await handleOpenCoin();
      return;
    }
    if (!snapshot.rewardsPending) await session.forgetCheckpoint();
    navigation.dispatch(StackActions.replace('Park', { park: ride.parkId, player: player.id }));
  }, [navigation, session, snapshot.rewardsPending, ride?.parkId, player?.id, handleOpenCoin]);

  const handleOpenStampBook = useCallback(async () => {
    if (!snapshot.rewardsPending) await session.forgetCheckpoint();
    navigation.dispatch(StackActions.replace('StampBook'));
  }, [navigation, session, snapshot.rewardsPending]);

  useEffect(() => {
    const added = snapshot.extraRoundsAdded - lastExtraRounds.current;
    lastExtraRounds.current = snapshot.extraRoundsAdded;
    if (added <= 0) return;
    if (manualEncoreRequested.current) {
      manualEncoreRequested.current = false;
      return;
    }
    const first = snapshot.playlist[snapshot.playlist.length - added];
    if (first) setNewRoundNotice({ id: first.id, count: added });
  }, [snapshot.extraRoundsAdded, snapshot.playlist]);

  const resolution: PredictionResolution | null =
    snapshot.state === 'complete' && snapshot.boardingConfirmed && snapshot.boardingAt != null &&
      snapshot.startedAt != null && prediction
      ? resolvePrediction(prediction.card, prediction.guess,
          (snapshot.boardingAt - snapshot.startedAt) / 60_000)
      : null;

  const epilogue = snapshot.crewRelay ? crewRelayEpilogue(snapshot.crewRelay, snapshot.chapter?.relay.epilogues) : null;
  const epilogueActivity: Extract<ActivityItem, { kind: 'minigame' }> | null =
    epilogue && snapshot.chapter ? {
      kind: 'minigame', id: `${snapshot.chapter.id}-route-${epilogue.route}`,
      gameId: epilogue.gameId, seed: epilogue.seed,
      title: epilogue.title, preview: epilogue.prompt,
    } : null;
  const featuredLore = snapshot.chapter
    ? snapshot.playlist.find(item => item.kind === 'lore' && item.id === `${snapshot.chapter?.id}-field-note`)
    : null;
  const featuredChoice = featuredLore ? snapshot.loreChoices[featuredLore.id] : undefined;
  const chapterClue = snapshot.chapter && featuredLore?.kind === 'lore' &&
    completedActivityIds.has(featuredLore.id) && featuredChoice != null
    ? resolveChapterClue(snapshot.chapter, featuredLore.seed, featuredChoice) : null;
  const personalizedPlaylist = snapshot.chapter
    ? snapshot.playlist.map(item => personalizeChapterFinale(item, snapshot.chapter!, chapterClue))
    : snapshot.playlist;
  const chapterPages: ActivityItem[] = epilogueActivity
    ? personalizedPlaylist.reduce<ActivityItem[]>((pages, item) => {
        pages.push(item);
        if (item.kind === 'crew_relay') pages.push(epilogueActivity);
        return pages;
      }, [])
    : [...personalizedPlaylist];
  const sharedPages: Array<{ kind: 'signal' | 'puzzle'; id: string }> =
    snapshot.serverSessionId && snapshot.signal
      ? [{ kind: 'signal', id: 'crew-signal' }, { kind: 'puzzle', id: 'crew-puzzle' }]
      : [];
  const activityPages = linePlayPages<
    ActivityItem | { kind: 'signal' | 'puzzle'; id: string }
  >(chapterPages, sharedPages);
  useLinePlayLiveActivity({
    rideName: ride?.rideName ?? 'LinePlay',
    state: snapshot.state,
    rewardTracking: snapshot.serverSessionId != null && !snapshot.rewardUnavailable,
    creditedParts: snapshot.creditedParts,
    verifiedEligibleSeconds: snapshot.verifiedEligibleSeconds,
    verifiedPresenceAt: snapshot.verifiedPresenceAt,
    partIntervalSeconds: snapshot.partIntervalSeconds,
    sessionPartCap: snapshot.sessionPartCap,
    partsRemainingToday: snapshot.partsRemainingToday,
  });
  const arcadeChoices = queueArcadeDestinations(activityPages, completedActivityIds)
    .map(choice => ({
      id: choice.id,
      title: GAME_NAMES[choice.gameId] ?? 'Queue Game',
      gameId: choice.gameId,
      index: choice.index,
      completed: choice.completed,
      bestStars: snapshot.gameBestStars[choice.gameId as keyof typeof snapshot.gameBestStars],
    }));
  showToastRef.current = showToast;

  // -- Play together (L3): session start, crew, pass-and-play turns ----------
  const openGroupTurn = useCallback((launch: GroupTurnLaunch) => {
    if (session.getState() !== 'active') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveGame({ ...launch.item, seed: launch.seed, difficulty: launch.difficulty,
      groupTurn: true, kidRound: launch.kidRound });
  }, [session]);
  const groupPlay = useGroupPlay({
    session, snapshot,
    playerId: player?.id ?? null,
    ownerName: player?.username ?? null,
    pages: activityPages,
    gameOpen: activeGame != null,
    openTurn: openGroupTurn,
  });
  groupPlayRef.current = groupPlay;
  const lineTipReady = linePlayTipReady({
    screenReady: snapshot.state === 'active', gameOpen: activeGame != null, lineMoving: snapshot.moving,
    sheetOpen: groupPlay.sheetOpen || arcadeOpen || projectOpen || waitEndPrompt != null || boardingAsk || lineDone || resuming,
    finished: false,
  });

  // -- Queue Bonus Rounds presentation ------------------------------------
  const bonus = snapshot.bonus?.enabled ? snapshot.bonus : null;
  const { playSound } = useContext(SoundEffectContext);
  const reducedFx = useReducedGameMotion();
  const fxGate = useRef(new MovementFxGate<{ cue: BonusCue; slot?: number }>()).current;
  // While the line moves, haptics and stings wait (dropped if 3 s late).
  const fireCue = useCallback((cue: BonusCue, slot?: number) => {
    if (fxGate.offer({ cue, slot }, Date.now()) === 'play') playBonusCue({ cue, slot }, playSound);
  }, [fxGate, playSound]);
  const [movingChip, setMovingChip] = useState(false);
  useEffect(() => {
    fxGate.setMoving(snapshot.moving, Date.now()).forEach(item => playBonusCue(item, playSound));
    if (!bonus) { setMovingChip(false); return; }
    if (snapshot.moving) {
      // One tick per movement episode, then the chip lingers 1.5 s after it stops.
      if (!movingChip) { setMovingChip(true); playBonusCue({ cue: 'line_moving' }, null); }
      return;
    }
    if (!movingChip) return;
    const timer = setTimeout(() => setMovingChip(false), MOVING_CHIP_LINGER_MS);
    return () => clearTimeout(timer);
  }, [snapshot.moving, bonus != null]);
  const fxHead = snapshot.bonusFx[0] ?? null;
  const [perkChip, setPerkChip] = useState<RailChip | null>(null);
  useEffect(() => {
    if (!fxHead || fxHead.kind !== 'perk') return;
    setPerkChip({ key: `perk-${fxHead.id}`, tone: 'perk',
      text: `+${fxHead.perk.parts} Part · ${fxHead.perk.kind === 'mastery' ? 'Mastery' : 'Queue Crew'}` });
    const timer = setTimeout(() => { setPerkChip(null); session.consumeBonusFx(fxHead.id); }, 2_000);
    return () => clearTimeout(timer);
  }, [fxHead?.id]);
  const railChip: RailChip | null = movingChip ? { key: 'moving', text: 'Line moving. Eyes up.', tone: 'moving' } : perkChip;
  // A slot opens: one impact and the open sting, unless a saved win claims it
  // in the same answer (that chain plays one absorb instead).
  const openSlots = bonus?.slots.filter(slot => slot.state === 'open').length ?? 0;
  const prevOpenSlots = useRef(openSlots);
  useEffect(() => {
    const savedChain = snapshot.bonusFx.some(event => event.kind === 'claim' && event.claim.saved);
    if (openSlots > prevOpenSlots.current && !savedChain) fireCue('bonus_open');
    prevOpenSlots.current = openSlots;
  }, [openSlots]);
  const savedNow = Boolean(bonus?.saved);
  const prevSaved = useRef(savedNow);
  useEffect(() => {
    if (savedNow && !prevSaved.current) fireCue('bonus_saved');
    prevSaved.current = savedNow;
  }, [savedNow]);
  const waitCardRef = useRef<View>(null);
  const [partTarget, setPartTarget] = useState<FlightPoint>({ x: 48, y: 140 });
  const measureWaitCard = useCallback(() => {
    waitCardRef.current?.measureInWindow((x, y, _width, height) => {
      if (Number.isFinite(x) && Number.isFinite(y)) setPartTarget({ x: x + 44, y: y + height / 2 });
    });
  }, []);
  const secondsToNextBonus = bonus ? nextBonusSeconds(bonus, snapshot.verifiedEligibleSeconds,
    snapshot.verifiedPresenceAt, Date.now()) : null;
  const movementContext = useMemo(() => ({
    moving: snapshot.moving,
    onResume: () => undefined,
    lineMovePolicy: 'passive' as const,
    // Client-scored games never pay Parts; their win card points to the bonus games.
    justForFunNote: bonus && activeGame && activeGame.gameId !== 'current' ? {
      text: 'Bonus Parts come from Current Quest and Codebreaker',
      actionLabel: 'PLAY FOR BONUS',
      onPress: () => { setActiveGame(null); setArcadeOpen(true); },
    } : null,
  }), [snapshot.moving, bonus != null, activeGame?.gameId]);
  useEffect(() => {
    const id = pendingEncoreId.current;
    if (!id) return;
    const index = activityPages.findIndex(page => page.id === id);
    if (index < 0) return;
    pendingEncoreId.current = null;
    setPageIndex(index);
    activityListRef.current?.scrollToOffset({ offset: index * SCREEN_W, animated: true });
  }, [snapshot.playlist.length, snapshot.signal, snapshot.crewRelay]);

  // Dev-only visual QA tour (never in release builds).
  const tourRef = useRef<{ activityPages: ReadonlyArray<{ id: string; kind: string }>; jumpToPage: (index: number) => void }>(
    { activityPages: [], jumpToPage: () => undefined });
  const tourStarted = useRef(false);
  useEffect(() => {
    if (!linePlayTourEnabled() || tourStarted.current || snapshot.playlist.length === 0) return;
    tourStarted.current = true;
    const find = (predicate: (page: { id: string; kind: string }) => boolean) =>
      tourRef.current.activityPages.findIndex(predicate);
    const steps = linePlayTourSteps({
      session,
      jumpToId: id => tourRef.current.jumpToPage(find(page => page.id === id)),
      jumpToKind: kind => tourRef.current.jumpToPage(find(page => kind === 'minigame-free'
        ? page.kind === 'minigame' && page.id.startsWith('mg-') : page.kind === kind)),
      openArcade: open => setArcadeOpen(open),
      openEndSheet: open => setWaitEndPrompt(open ? { tab: null } : null),
      showAdvanceToast: () => showToast({ icon: 'ride', title: 'The line is moving!', body: 'Keep playing as you walk. Your round is safe.' }),
      startResume: () => setResuming(true),
    });
    steps.forEach((step, index) => setTimeout(step, 4000 + index * LINEPLAY_TOUR_STEP_MS));
  }, [snapshot.playlist.length]);


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

  // The shared signal selects an actual next game. Its page is appended when
  // available so a live unlock does not shift the activity under a player.
  const playSignalGame = (routeChoice: 'route_a' | 'route_b') => {
    const daySeed = Number(snapshot.signal?.park_day.replace(/-/g, '') ?? 0);
    handlePlayGame({
      kind: 'minigame',
      id: `signal-bonus-${snapshot.signal?.park_day}-${routeChoice}`,
      gameId: routeChoice === 'route_a' ? 'memory' : 'tap',
      seed: (ride.rideId * 31 + daySeed) % 100000,
    });
  };
  const visiblePageIndex = Math.min(pageIndex, Math.max(0, activityPages.length - 1));
  const visibleActivityId = activityPages[visiblePageIndex]?.id;
  const storyStep = snapshot.chapter && visibleActivityId
    ? visibleActivityId === `${snapshot.chapter.id}-trivia` ? 1
      : visibleActivityId === `${snapshot.chapter.id}-field-note` ? 2
        : visibleActivityId === `${snapshot.chapter.id}-${snapshot.chapter.finale.idSuffix}` ? 3 : null
    : null;
  const nextPageIndex = visiblePageIndex + 1 < activityPages.length ? visiblePageIndex + 1 : 0;
  const jumpToPage = (index: number) => {
    if (index < 0 || index >= activityPages.length) return;
    setPageIndex(index);
    activityListRef.current?.scrollToIndex({
      index,
      animated: Math.abs(index - visiblePageIndex) <= 1,
    });
  };
  tourRef.current = { activityPages, jumpToPage };

  const newRoundIndex = newRoundNotice
    ? activityPages.findIndex(page => page.id === newRoundNotice.id) : -1;
  const projectMission = snapshot.parkProject ? resolveProjectMission(snapshot.parkProject) : null;
  const circuitTheme = circuitThemeFor(ride.rideName, snapshot.chapter?.navigationPanel === true);
  const liveCrew = crewLivePrompt(snapshot.signal, completedActivityIds);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0a7dd1', '#07569e', '#073e87']} style={StyleSheet.absoluteFill} />
      <Wrapper onNavigate={handleNavigateTab}>
        <Topbar>
          <TopbarColumn stretch={false}>
            <Pressable onPress={() => {
              if (snapshot.state === 'active' || snapshot.state === 'paused') handleEndSession();
              else void handleExit();
            }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
              <Image source={require('../../../assets/images/screens/explore/back.png')}
                style={{ width: 35, height: 35 }} contentFit="contain" />
            </Pressable>
          </TopbarColumn>
          <TopbarColumn><TopbarText>LINEPLAY</TopbarText></TopbarColumn>
          <TopbarColumn stretch={false}>
            {snapshot.state === 'active' || snapshot.state === 'paused' ? (
              <Pressable onPress={handleEndSession} hitSlop={12} style={styles.endBtn}
                accessibilityRole="button" accessibilityLabel="End LinePlay session">
                <Text style={styles.endBtnText}>End</Text>
              </Pressable>
            ) : <View style={styles.endPlaceholder} />}
          </TopbarColumn>
        </Topbar>
        {snapshot.serverSessionId && snapshot.backgroundTrackingAvailable === false &&
          snapshot.state !== 'complete' && (
            <View style={styles.queueTrackingHint}>
              <Text style={styles.queueTrackingHintText}>
                Keep LinePlay open for Parts, or enable play while your phone is locked.
              </Text>
              <Pressable onPress={() => void enableLockedScreenPlay()}
                disabled={backgroundPermissionBusy}
                accessibilityRole="button"
                accessibilityLabel="Enable background location for locked-screen LinePlay"
                style={styles.queueTrackingButton}>
                <Text style={styles.queueTrackingButtonText}>
                  {backgroundPermissionBusy ? 'Checking…' : 'Enable'}
                </Text>
              </Pressable>
            </View>
          )}

        {/* Wait card (top) */}
        <View style={styles.waitWrap} ref={waitCardRef} onLayout={measureWaitCard} collapsable={false}>
          {snapshot.startedAt == null ? (
            <WaitCardSkeleton rideName={ride.rideName} />
          ) : (
            <WaitCard
              compact={snapshot.state !== 'complete'}
              rideName={ride.rideName}
              postedWaitMinutes={snapshot.plannedWaitMinutes}
              waitSource={snapshot.waitSource}
              entranceWaitMinutes={snapshot.entranceWaitMinutes}
              entranceWaitObservedAt={snapshot.entranceWaitObservedAt}
              entranceWaitChangeMinutes={snapshot.entranceWaitChangeMinutes}
              elapsedSeconds={snapshot.elapsedSeconds}
              rewardTrackingAvailable={snapshot.serverSessionId != null}
              rewardUnavailable={snapshot.rewardUnavailable}
              rewardConnectionIssue={snapshot.rewardConnectionIssue}
              lineRewardsReady={ride.lineRewardsReady}
              verifiedEligibleSeconds={snapshot.verifiedEligibleSeconds}
              verifiedPresenceAt={snapshot.verifiedPresenceAt}
              creditedParts={snapshot.creditedParts}
              partsRemainingToday={snapshot.partsRemainingToday}
              partIntervalSeconds={snapshot.partIntervalSeconds}
              sessionPartCap={snapshot.sessionPartCap}
              ticketIntervalSeconds={snapshot.ticketIntervalSeconds}
              ticketAvailable={snapshot.ticketAvailable}
              masteryBonusAvailable={snapshot.masteryBonusAvailable}
              currentQuestBonusEnabled={snapshot.currentQuestBonusEnabled}
              currentQuestVerified={snapshot.currentQuestVerified}
              currentQuestProofPending={snapshot.currentQuestProofPending}
              imageUrl={ride.imageUrl}
              completed={snapshot.state === 'complete'}
              paused={snapshot.state === 'paused' || resuming}
              pauseReason={snapshot.pauseReason}
              onTogglePause={() => {
                if (resuming) return;
                if (snapshot.state === 'paused') setResuming(true);
                else { session.pause('manual'); void Haptics.selectionAsync(); }
              }}
              onPlayBonus={arcadeChoices.length ? () => setArcadeOpen(true) : undefined}
              bonus={snapshot.bonus}
              gameOpen={activeGame != null}
              hero={snapshot.state !== 'complete' ? <WaitCoinHero
                rideId={ride.rideId}
                waitScreen={snapshot.waitScreen}
                creditedParts={snapshot.creditedParts}
                bonusParts={snapshot.bonus?.slots.filter(slot => slot.state === 'claimed').length ?? 0}
                elapsedSeconds={snapshot.elapsedSeconds}
                plannedWaitMinutes={snapshot.plannedWaitMinutes}
                waitSource={snapshot.waitSource}
                playerEnergy={player?.energy ?? null}
                covered={activeGame != null || arcadeOpen || projectOpen}
                rewardsOn={snapshot.serverSessionId != null && !snapshot.rewardUnavailable}
                onLeveled={() => void refreshPlayer().catch(() => undefined)}
              /> : null}
            />
          )}
        </View>

        {newRoundIndex > visiblePageIndex && snapshot.state !== 'complete' && (
          <NewRoundsBanner count={newRoundNotice!.count} paused={snapshot.state !== 'active'}
            onJump={() => { setNewRoundNotice(null); jumpToPage(newRoundIndex); }} />
        )}

        {snapshot.leftLine && snapshot.state === 'active' && (
          <View style={styles.leftLineCard} accessibilityLiveRegion="polite">
            <Text style={styles.leftLineText}>Looks like you left the line</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Resume, I am back in line"
              onPress={() => session.resumeAfterLeftLine()} style={styles.leftLineButton}>
              <Text style={styles.leftLineButtonText}>RESUME</Text>
            </Pressable>
          </View>
        )}

        {snapshot.state !== 'complete' && <LinePlayLiveRail crew={liveCrew} chip={railChip}
          projectTitle={projectMission?.title} projectStage={snapshot.parkProject?.stage}
          onOpenCrew={() => {
            if (liveCrew) jumpToPage(activityPages.findIndex(page => page.id === liveCrew.pageId));
          }}
          onOpenProject={() => setProjectOpen(true)} />}

        {groupPlay.strip}

        {/* Activity area (bottom) */}
        <View style={styles.activityArea}>
          {snapshot.state === 'complete' ? (
            <SessionRecap
              snackSlot={snapshot.serverSessionId && snapshot.rewards ? <LineSnackOffer sessionId={snapshot.serverSessionId} /> : null}
              elapsedSeconds={snapshot.elapsedSeconds}
              activityCount={completedActivityIds.size}
              activityNames={snapshot.completedActivityIds.map(id => playedActivityName(id, snapshot.playlist, snapshot.chapter))}
              earnedEnergy={snapshot.rewards?.bonusEnergy ?? 0}
              experience={snapshot.rewards?.experience ?? 0}
              partsCount={
                snapshot.rewards?.rideParts.reduce((n, p) => n + p.quantity, 0) ?? 0
              }
              ticketsEarned={snapshot.rewards?.tickets ?? 0}
              masteryBonusParts={snapshot.rewards?.masteryBonusParts ?? 0}
              crewPuzzleBonusParts={snapshot.rewards?.crewPuzzleBonusParts ?? 0}
              currentQuestBonusParts={snapshot.rewards?.currentQuestBonusParts ?? 0}
              bonusRecap={snapshot.bonus?.enabled && snapshot.rewards ? {
                parts: snapshot.rewards.rideParts.reduce((n, p) => n + p.quantity, 0),
                liveParts: snapshot.rewards.liveParts,
                bonusRoundParts: snapshot.rewards.bonusRoundParts,
                masteryBonusParts: snapshot.rewards.masteryBonusParts,
                crewPuzzleBonusParts: snapshot.rewards.crewPuzzleBonusParts,
                currentQuestBonusParts: snapshot.rewards.currentQuestBonusParts,
                encoreXp: snapshot.rewards.encoreXp,
                encoreEnergy: snapshot.rewards.encoreEnergy,
                bonusParkDayUsed: snapshot.rewards.bonusParkDayUsed,
                bonusParkDayCap: snapshot.rewards.bonusParkDayCap,
              } : null}
              heroInventory={snapshot.bonus?.enabled ? player?.inventory ?? null : null}
              groupSlot={groupPlay.recapSlot({
                realMinutes: snapshot.boardingConfirmed && snapshot.boardingAt != null && snapshot.startedAt != null
                  ? (snapshot.boardingAt - snapshot.startedAt) / 60_000 : snapshot.elapsedSeconds / 60,
                postedMinutes: snapshot.waitSource === 'estimate' ? null : snapshot.plannedWaitMinutes,
                partsEarned: snapshot.rewards ? snapshot.rewards.rideParts.reduce((n, p) => n + p.quantity, 0) : null,
                rewardsConfirmed: snapshot.rewards != null,
                coin: recapCoin,
              })}
              onOpenInventory={() => RootNavigation.navigate('Inventory')}
              rewardsPending={snapshot.rewardsPending}
              rewardsConfirmed={snapshot.rewards != null}
              rewardTrackingAvailable={snapshot.serverSessionId != null}
              queueStamp={queueStamp}
              onOpenStampBook={() => void handleOpenStampBook()}
              resolution={resolution}
              predictionUnscored={prediction != null && !snapshot.boardingConfirmed}
              crewPuzzle={snapshot.signal?.puzzle ?? null}
              crewRelay={snapshot.crewRelay}
              crewRouteNames={snapshot.chapter?.relay.routeNames ?? null}
              crewScoreNoun={snapshot.chapter?.relay.scoreNoun ?? 'Signals solved'}
              coin={recapCoin}
              coinState={recapCoinState}
              playerEnergy={recapEnergy}
              energyUnavailable={recapEnergyUnavailable}
              rideName={ride.rideName}
              endReason={snapshot.endReason}
              onStillInLine={snapshot.endReason === 'left_queue'
                ? () => { void session.continueInLine(); } : undefined}
              onOpenCoin={() => void handleOpenCoin()}
              onOpenPark={() => void handleOpenPark()}
              parkAvailable={ride.parkId != null && player?.id != null}
              feedbackEnabled={snapshot.serverSessionId != null && snapshot.rewards != null}
              feedback={feedback}
              feedbackLoading={feedbackLoading}
              feedbackSaving={feedbackSaving}
              feedbackError={feedbackError}
              onRateWait={(rating) => void submitFeedback(rating)}
              onFavoriteActivity={(favorite) => {
                if (feedback) void submitFeedback(feedback.rating, favorite);
              }}
              doneLabel={tabAfterRecap.current ? `Continue to ${tabLabel(tabAfterRecap.current)}` : 'Done'}
              onDone={() => {
                const nextTab = tabAfterRecap.current;
                tabAfterRecap.current = null;
                if (nextTab) handleNavigateTab(nextTab);
                else void handleExit();
              }}
            />
          ) : snapshot.playlist.length === 0 ? (
            <ActivitySkeleton />
          ) : (
            <>
            <FlatList
              ref={activityListRef}
              data={activityPages}
              keyExtractor={(it) => it.id}
              getItemLayout={(_, index) => ({ length: SCREEN_W, offset: index * SCREEN_W, index })}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => setPageIndex(Math.max(0, Math.min(
                activityPages.length - 1,
                Math.round(event.nativeEvent.contentOffset.x / SCREEN_W),
              )))}
              extraData={visiblePageIndex}
              renderItem={({ item, index }) => (
                <View style={styles.page}
                  accessibilityElementsHidden={index !== visiblePageIndex}
                  importantForAccessibility={index === visiblePageIndex ? 'auto' : 'no-hide-descendants'}>
                  {item.kind === 'signal' && snapshot.signal ? (
                    <SignalCard
                      signal={snapshot.signal}
                      pending={snapshot.signalPending}
                      paused={snapshot.state !== 'active'}
                      error={snapshot.signalError}
                      onChoose={(routeChoice) => void session.chooseSignal(routeChoice)}
                      onPlayUnlocked={playSignalGame}
                    />
                  ) : item.kind === 'puzzle' && snapshot.signal ? (
                    <CrewPuzzleCard
                      puzzle={snapshot.signal.puzzle}
                      route={snapshot.signal.unlocked_route}
                      pending={snapshot.puzzlePending}
                      retryPending={snapshot.puzzleRetryPending}
                      retrySymbols={snapshot.puzzleRetrySymbols}
                      paused={snapshot.state !== 'active'}
                      bonusAvailable={snapshot.crewPuzzleBonusAvailable}
                      partIntervalSeconds={snapshot.partIntervalSeconds}
                      error={snapshot.puzzleError}
                      onGuess={(symbols) => void session.guessPuzzle(symbols)}
                    />
                  ) : item.kind === 'chapter_intro' && snapshot.chapter ? (
                    <ChapterCard chapter={snapshot.chapter} completedIds={completedActivityIds}
                      crewRelay={snapshot.crewRelay} paused={snapshot.state !== 'active'}
                      chapterClue={chapterClue}
                      signalAvailable={sharedPages.length > 0}
                      onChooseMission={(id) => {
                        const index = activityPages.findIndex(page => page.id === id);
                        jumpToPage(index);
                      }} />
                  ) : item.kind === 'crew_relay' && snapshot.chapter && snapshot.crewRelay ? (
                    <CrewRelayCard chapter={snapshot.chapter} progress={snapshot.crewRelay}
                      paused={snapshot.state !== 'active'} onChange={(next) => session.updateCrewRelay(next)} />
                  ) : item.kind === 'crew_grid' && snapshot.chapter ? (
                    <CrewGridCard rideName={ride.rideName} chapterTitle={snapshot.chapter.title}
                      seed={item.seed} marks={snapshot.crewGridMarks}
                      completed={completedActivityIds.has(item.id)} paused={snapshot.state !== 'active'}
                      onToggle={(index) => session.chooseCrewGridSquare(index)} />
                  ) : item.kind !== 'signal' && item.kind !== 'puzzle' ? (
                    <ActivitySlot
                      item={item}
                      circuitTheme={circuitTheme}
                      nextLabel={pageName(activityPages[index + 1 < activityPages.length ? index + 1 : 0], snapshot.chapter)}
                      bestStars={item.kind === 'minigame'
                        ? snapshot.gameBestStars[(item as Extract<ActivityItem, { kind: 'minigame' }>).gameId] : undefined}
                      rideId={ride.rideId}
                      parkId={ride.parkId}
                      chapterId={snapshot.chapter?.id}
                      navigationPanel={snapshot.chapter?.navigationPanel}
                      navigationProgress={snapshot.navigationPanels?.[item.id]}
                      onNavigationTurn={(index) => session.rotateNavigationPanel(item.id, index)}
                      onNavigationReplay={() => session.startNextNavigationRound(item.id)}
                      onNavigationNext={() => item.kind === 'circuit'
                        ? jumpToPage(index + 1 < activityPages.length ? index + 1 : 0)
                        : jumpToPage(activityPages.findIndex(page => page.id === `${snapshot.chapter?.id}-field-note`))}
                      completed={completedActivityIds.has(item.id)}
                      paused={snapshot.state !== 'active'}
                      savedPrediction={item.kind === 'prediction' && prediction?.card.id === item.card.id ? prediction?.guess ?? null : null}
                      savedLoreChoice={item.kind === 'lore' ? snapshot.loreChoices[item.id] ?? null : null}
                      currentQuestBonusStatus={snapshot.currentQuestBonusEnabled
                        ? snapshot.currentQuestVerified ? 'verified'
                          : snapshot.currentQuestProofPending ? 'pending' : 'available'
                        : null}
                      onPlayGame={handlePlayGame}
                      onPredict={handlePredict}
                      onChooseLore={(id, choice) => session.chooseLore(id, choice)}
                      onActivityCompleted={handleActivityCompleted}
                    />
                  ) : null}
                </View>
              )}
            />
            <ActivityPageRail index={visiblePageIndex} count={activityPages.length}
              firstLabel={activityPages[0]?.kind === 'chapter_intro' ? 'Chapter' : 'First round'}
              progressText={storyStep ? `CLUE ${storyStep}/3`
                : activityPages[visiblePageIndex]?.kind === 'chapter_intro' ? 'STORY' : 'FREE PLAY'}
              progressAccessibilityLabel={storyStep ? `Story clue ${storyStep} of 3`
                : activityPages[visiblePageIndex]?.kind === 'chapter_intro'
                  ? 'Ride story. Choose a clue to begin.'
                  : 'Optional queue activity. Explore at your own pace.'}
              nextLabel={pageName(activityPages[nextPageIndex], snapshot.chapter)}
              onFirst={() => jumpToPage(0)} onNext={() => jumpToPage(nextPageIndex)}
              moreAvailable={snapshot.playlist.length < MAX_SESSION_ACTIVITY_SLOTS}
              morePaused={snapshot.state !== 'active'}
              onMore={() => {
                if (pendingEncoreId.current) return;
                manualEncoreRequested.current = true;
                pendingEncoreId.current = session.addMoreRounds();
                if (!pendingEncoreId.current) manualEncoreRequested.current = false;
              }} />
            </>
          )}
        </View>
      </Wrapper>

      {bonus ? <BonusPicker
        visible={arcadeOpen && snapshot.state === 'active'}
        bonus={bonus}
        secondsToNext={secondsToNextBonus}
        questChoice={arcadeChoices.find(choice => choice.gameId === 'current') ?? null}
        crew={snapshot.signal?.puzzle ?? null}
        funChoices={arcadeChoices.filter(choice => choice.gameId !== 'current')}
        onClose={() => {
          queuedArcadeGame.current = null;
          setArcadeOpen(false);
        }}
        onHidden={() => {
          const next = queuedArcadeGame.current;
          queuedArcadeGame.current = null;
          if (next) handlePlayGame(next);
        }}
        onChoose={(index) => {
          const page = activityPages[index];
          if (page?.kind !== 'minigame') return;
          queuedArcadeGame.current = page;
          setArcadeOpen(false);
          jumpToPage(index);
        }}
        onOpenCodebreaker={() => {
          setArcadeOpen(false);
          jumpToPage(activityPages.findIndex(page => page.kind === 'puzzle'));
        }}
      /> : <QueueArcadeSheet
        visible={arcadeOpen && snapshot.state === 'active'}
        choices={arcadeChoices}
        onClose={() => {
          queuedArcadeGame.current = null;
          setArcadeOpen(false);
        }}
        onHidden={() => {
          const next = queuedArcadeGame.current;
          queuedArcadeGame.current = null;
          if (next) handlePlayGame(next);
        }}
        onChoose={(index) => {
          const page = activityPages[index];
          if (page?.kind !== 'minigame') return;
          queuedArcadeGame.current = page;
          setArcadeOpen(false);
          jumpToPage(index);
        }}
      />}

      {snapshot.parkProject && (
        <ProjectMissionModal
          visible={projectOpen && snapshot.state !== 'complete'}
          project={snapshot.parkProject}
          paused={snapshot.state !== 'active'}
          pending={snapshot.projectPending}
          error={snapshot.projectError}
          completedIds={completedActivityIds}
          onClose={() => setProjectOpen(false)}
          onHidden={() => {
            const next = queuedProjectGame.current;
            queuedProjectGame.current = null;
            if (next && session.getState() === 'active') handlePlayGame(next);
          }}
          onPlay={(game) => {
            queuedProjectGame.current = game;
            setProjectOpen(false);
          }}
          onVote={(chapter) => void session.voteProject(chapter)}
        />
      )}

      {/* Mounted GameKit game (GameShellV2 renders its own Modal). The line is
          always moving, so LinePlay never asks a game to pause for movement. */}
      <LinePlayMovementContext.Provider value={movementContext}>
        {renderActiveGame()}
      </LinePlayMovementContext.Provider>

      {/* Bonus claim flights. They wait while a game covers the screen (the
          Part is already in the wallet; only the celebration waits). */}
      {bonus && activeGame == null && <BonusPartFlight
        event={fxHead && fxHead.kind !== 'perk' ? fxHead : null}
        partTarget={partTarget}
        badgeTarget={{ x: SCREEN_W - 44, y: 64 }}
        compact={snapshot.moving}
        reducedMotion={reducedFx}
        onCue={fireCue}
        onDone={id => session.consumeBonusFx(id)} />}

      {groupPlay.overlays}

      {/* One-time tips: what LinePlay is, then the first Ride Part. Only between games, never while the line moves. */}
      <OneTimeTip id="lineplay_intro" ready={lineTipReady} style={styles.tip} />
      <OneTimeTip id="first_ride_part" ready={lineTipReady && partTipPending} style={styles.tip} />

      <QueueToast message={toast} onDone={() => setToast(null)} />

      <ResumeCountdown active={resuming} onDone={() => {
        setResuming(false);
        session.resume();
      }} />

      {/* End by hand: one branded sheet (header End, back, or a footer tab). */}
      <GameDialog
        visible={waitEndPrompt != null && (snapshot.state === 'active' || snapshot.state === 'paused')}
        title="How did your wait end?"
        message={waitEndPrompt?.tab
          ? `Your recap opens first, then ${tabLabel(waitEndPrompt.tab)}. You keep eligible queue rewards either way.`
          : 'You keep eligible queue rewards either way. A wait prediction counts only when you reach boarding.'}
        icon="queue"
        buttons={[
          { text: 'I left the line' },
          { text: 'I reached boarding' },
          { text: 'Keep playing', style: 'cancel' },
        ]}
        onAnswer={index => answerWaitEnd(index === 1 ? true : index === 0 ? false : null)}
      />

      {/* Ride detection only asks: nothing counts down and play keeps going. */}
      <GameDialog
        visible={boardingAsk}
        title="Did your ride start?"
        message="Looks like you might be boarding. Your games and wait time are saved either way."
        icon="ride"
        haptic="none"
        buttons={[
          { text: 'Still in line', style: 'cancel', variant: 'secondary' },
          { text: 'I’m boarding' },
        ]}
        onAnswer={index => {
          if (index !== 1) { session.dismissBoardingSuggestion(); return; }
          void session.endNow(true).catch(finishFailed);
        }}
      />

      {/* Several minutes of away answers: the guest likely left the queue. */}
      <GameDialog
        visible={lineDone}
        title="Line done?"
        message={`Looks like you left the queue area. Your games and wait time are saved. Wrapping up in ${Math.ceil(snapshot.graceMsRemaining / 1000)}s.`}
        icon="queue"
        haptic="none"
        buttons={[
          { text: 'I reached boarding', variant: 'secondary' },
          { text: 'Still in line', style: 'cancel', variant: 'secondary' },
          { text: 'I left the line' },
        ]}
        onAnswer={index => {
          if (index == null || index === 1) { session.undoEnd(); return; }
          void session.endNow(index === 0).catch(finishFailed);
        }}
      />
    </View>
  );
}


// -- skeletons ---------------------------------------------------------------

function WaitCardSkeleton({ rideName }: { rideName: string }) {
  return <LinearGradient colors={['#159ee2', '#0873bd', '#064780']} style={styles.waitSkeleton}>
    <View style={styles.waitSkeletonCopy}>
      <Text style={styles.waitSkeletonKicker}>YOUR SHARK IS READY</Text>
      <Text style={styles.waitSkeletonRide} numberOfLines={2}>{rideName}</Text>
      <Text style={styles.waitSkeletonHint}>Opening your ride chapter…</Text>
    </View>
    <Image source={QUEUE_RECAP_SHARK} style={styles.waitSkeletonShark} contentFit="contain" />
  </LinearGradient>;
}

function ActivitySkeleton() {
  return (
    <View style={styles.page}>
      <View style={styles.activitySkeleton}>
        <Text style={styles.activitySkeletonKicker}>LINEPLAY · FIRST ROUND</Text>
        <Text style={styles.activitySkeletonTitle}>A ride story is surfacing</Text>
        <Text style={styles.activitySkeletonHint}>Your games will open here in a moment.</Text>
        <View style={styles.activitySkeletonRule} />
        <Text style={styles.activitySkeletonFoot}>Play solo or share this phone with your crew.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07569e' },
  tip: { position: 'absolute', left: 12, right: 12, top: 300, zIndex: 60 },
  safe: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.lg },
  endPlaceholder: { width: 45 },
  endBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: '#ffca30',
  },
  endBtnText: { color: '#073e79', fontFamily: 'Knockout', fontSize: 17 },
  waitWrap: { paddingHorizontal: spacing.lg },
  leftLineCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: '#fff8dc', borderRadius: 14, borderWidth: 2, borderColor: '#fec90e', paddingHorizontal: 12, paddingVertical: 8 },
  leftLineText: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: '#083f7c' },
  leftLineButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#fec90e', justifyContent: 'center' },
  leftLineButtonText: { fontFamily: 'Shark', fontSize: 15, color: '#075083' },
  queueTrackingHint: { backgroundColor: '#0a548f', borderBottomWidth: 1,
    borderBottomColor: '#55baf5', flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 16, paddingVertical: 7 },
  queueTrackingHintText: { color: '#fff', fontSize: 12, flex: 1, lineHeight: 16 },
  queueTrackingButton: { backgroundColor: '#ffce3a', borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 6 },
  queueTrackingButtonText: { color: '#073e79', fontFamily: 'Knockout', fontSize: 14 },
  activityArea: { flex: 1, marginTop: spacing.lg },
  page: {
    width: SCREEN_W,
    height: '100%',
    paddingHorizontal: spacing.lg,
  },
  waitSkeleton: {
    height: 200, overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    borderRadius: borderRadius.xxl,
    borderWidth: 3, borderColor: '#ffffff',
    shadowColor: '#003c7a', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8, elevation: 5,
  },
  waitSkeletonCopy: { width: '62%', paddingLeft: 17, zIndex: 1 },
  waitSkeletonKicker: { color: '#ffdf69', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.4 },
  waitSkeletonRide: { color: '#ffffff', fontFamily: 'Shark', fontSize: 23, lineHeight: 27, marginTop: 8 },
  waitSkeletonHint: { color: '#e2f5ff', fontFamily: 'Knockout', fontSize: 15, marginTop: 10 },
  waitSkeletonShark: { position: 'absolute', width: 170, height: 170, right: -5, bottom: -4 },
  activitySkeleton: {
    minHeight: 220, justifyContent: 'center', paddingHorizontal: 19, paddingVertical: 18,
    borderRadius: borderRadius.xl,
    backgroundColor: '#f1fbff', borderWidth: 3, borderColor: '#ffffff',
    shadowColor: '#003c7a', shadowOpacity: 0.24, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 7, elevation: 4,
  },
  activitySkeletonKicker: { color: '#0873bd', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.5 },
  activitySkeletonTitle: { color: '#093d77', fontFamily: 'Shark', fontSize: 21, marginTop: 8 },
  activitySkeletonHint: { color: '#245879', fontFamily: 'Knockout', fontSize: 16, marginTop: 8 },
  activitySkeletonRule: { width: 72, height: 5, borderRadius: 3, backgroundColor: '#ffcb31', marginTop: 17 },
  activitySkeletonFoot: { color: '#427694', fontFamily: 'Knockout', fontSize: 14, marginTop: 10 },
  ghostBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  ghostBtnText: { color: colors.secondary, fontWeight: '700' },

});
