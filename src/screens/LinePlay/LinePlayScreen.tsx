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

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  AppState,
  Alert,
  Linking,
  Pressable,
  ScrollView,
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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { colors, spacing, borderRadius, shadows } from '../../design-system';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { useLinePlaySession } from '../../services/lineplay/useLinePlaySession';
import { isRecentQueueSample, MAX_SESSION_ACTIVITY_SLOTS } from '../../services/lineplay/LinePlaySession';
import { crewLivePrompt } from '../../services/lineplay/livePrompt';
import LinePlayLiveRail from './components/LinePlayLiveRail';
import getWikiTimes from '../../api/endpoints/parks/queue-times/getWikiTimes';
import { LocationContext } from '../../context/LocationProvider';
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
import { LINEPLAY_ROUND_QUESTIONS } from '../../games/trivia/config';
import { SharkySwim } from '../../games/sharky';
import { BananaBasketGame } from '../../games/banana-basket';
import { CurrentQuestGame } from '../../games/current-quest';
import SharkShowdown from '../../games/showdown/SharkShowdown';
import { showdownReplaySeed } from '../../games/showdown/logic';
import type { RideContext, ActivityItem } from '../../services/lineplay/LinePlaySession';
import {
  PredictionCard,
  PredictionResolution,
  resolvePrediction,
} from '../../services/lineplay/content';
import WaitCard from './components/WaitCard';
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
import { resolveProjectMission } from '../../services/lineplay/projectMission';
import type { CrewPuzzleSummary } from '../../api/endpoints/me/inline-timer/types';
import { crewRelayEpilogue, crewRelayScore, type CrewRelayProgress } from '../../services/lineplay/crewRelay';
import type { LinePlayChapter } from '../../services/lineplay/chapters';
import { linePlayPages, queueArcadeDestinations } from '../../services/lineplay/presentation';
import { personalizeChapterFinale, resolveChapterClue } from '../../services/lineplay/chapterClue';

const { width: SCREEN_W } = Dimensions.get('window');
const QUEUE_STAMP_IMAGE = require('../../../assets/images/stamps/stamp-09.png');
const QUEUE_RECAP_SHARK = require('../../../assets/images/screens/lineplay/queue-recap-shark.png');

const GAME_NAMES: Record<string, string> = {
  tap: 'Whack-a-Shark', timing: 'Rhythm Tap', memory: 'Memory Match',
  trivia: 'Ride Trivia', shark: 'Sharky Swim', banana: 'Banana Basket', current: 'Current Quest',
  showdown: 'Shark Showdown',
};

function playedActivityName(id: string, playlist: readonly ActivityItem[], chapter: LinePlayChapter | null): string {
  const item = playlist.find(entry => entry.id === id);
  if (item?.kind === 'minigame') return GAME_NAMES[item.gameId] ?? 'Mini-game';
  if (item?.kind === 'crew_grid') return 'Crew Bingo';
  if (item?.kind === 'trivia') return 'Ride trivia';
  if (item?.kind === 'lore') return chapter?.fieldNotes[item.seed % chapter.fieldNotes.length]?.title ?? 'Queue clue';
  if (item?.kind === 'prediction') return 'Wait prediction';
  if (id.startsWith('pred-')) return 'Wait prediction';
  if (item?.kind === 'crew_relay') return 'Crew relay';
  if (id.endsWith('-route-alpha')) return 'Alpha Signal Rhythm Tap';
  if (id.endsWith('-route-omega')) return 'Omega Trail Sharky Swim';
  if (id.startsWith('signal-bonus-')) return id.endsWith('route_a') ? 'Crew Memory Match' : 'Crew Rhythm Tap';
  if (id.startsWith('project-')) return `Park chapter ${GAME_NAMES[id.split('-').at(-1) ?? ''] ?? 'round'}`;
  return 'Bonus round';
}

function pageName(item: ActivityItem | { kind: 'signal' | 'puzzle'; id: string }): string {
  switch (item.kind) {
    case 'chapter_intro': return 'Ride chapter';
    case 'crew_grid': return 'Crew Bingo';
    case 'crew_relay': return 'Crew Relay';
    case 'signal': return 'Crew Route';
    case 'puzzle': return 'Codebreaker';
    case 'trivia': return 'Shark Trivia';
    case 'lore': return 'Field Note';
    case 'prediction': return 'Wait Prediction';
    case 'minigame': return item.title ?? GAME_NAMES[item.gameId] ?? 'Arcade round';
  }
}

function tabLabel(screen: string): string {
  return screen === 'Leaderboard' ? 'Standings' : screen;
}

export default function LinePlayScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const ride: RideContext | undefined = route.params?.ride;

  const { session, snapshot } = useLinePlaySession();
  const { latestLocationSampleRef } = useContext(LocationContext);
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
  const startedRef = useRef(false);
  const prevPausedRef = useRef(false);

  const enableLockedScreenPlay = async () => {
    if (backgroundPermissionBusy) return;
    setBackgroundPermissionBusy(true);
    try {
      let permission = await Location.getBackgroundPermissionsAsync();
      if (!permission.granted && !permission.canAskAgain) {
        Alert.alert('Play while your phone is locked',
          'Allow Always location in iPhone Settings so verified queue time can continue while LinePlay is in the background.',
          [{ text: 'Keep app open', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } }]);
        return;
      }
      if (!permission.granted) permission = await Location.requestBackgroundPermissionsAsync();
      if (permission.granted) {
        const ready = await session.retryBackgroundTracking();
        if (!ready) Alert.alert('Keep LinePlay open',
          'Background tracking could not start. Keep the app open while you wait to earn verified queue progress.');
      }
    } catch {
      Alert.alert('Keep LinePlay open',
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
    if (!ride || !playerId || startedRef.current) return;
    startedRef.current = true;
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
    const interval = setInterval(() => void check(), 120_000);
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

  // Haptic on transition into paused (line moving).
  useEffect(() => {
    const nowPaused = snapshot.state === 'paused';
    if (nowPaused && !prevPausedRef.current) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    prevPausedRef.current = nowPaused;
  }, [snapshot.state]);

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
    useState<Extract<ActivityItem, { kind: 'minigame' }> | null>(null);
  const showdownPlays = useRef<Map<string, number>>(new Map());
  const triviaPlays = useRef<Map<string, number>>(new Map());

  // TriviaGame holds its question cursor in the source. Keep one source for
  // the whole round even while LinePlay emits a new timer snapshot each second.
  const lineTriviaSource = useMemo(() =>
    activeGame?.gameId === 'trivia' && ride
      ? createLinePlayTriviaSource({
          rideId: ride.rideId,
          parkId: ride.parkId,
          chapterId: snapshot.chapter?.id,
          seed: activeGame.seed,
        })
      : null,
  [activeGame?.id, activeGame?.seed, activeGame?.gameId, ride?.rideId, ride?.parkId, snapshot.chapter?.id]);

  const handlePlayGame = useCallback((item: Extract<ActivityItem, { kind: 'minigame' }>) => {
    if (session.getState() !== 'active') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentSeed = item.gameId === 'current' && session.snapshot().currentQuestBonusEnabled
      ? session.snapshot().currentQuestSeed : null;
    if (item.gameId === 'showdown') {
      const plays = showdownPlays.current.get(item.id) ?? 0;
      showdownPlays.current.set(item.id, plays + 1);
      // Each rematch begins at the next three questions of the ride deck.
      setActiveGame({ ...item, seed: showdownReplaySeed(item.seed, plays) });
      return;
    }
    if (item.gameId === 'trivia') {
      const plays = triviaPlays.current.get(item.id)
        ?? (session.snapshot().completedActivityIds.includes(item.id) ? 1 : 0);
      triviaPlays.current.set(item.id, plays + 1);
      // A replay starts after the previous five-question round in the offline deck.
      setActiveGame({ ...item, seed: item.seed + plays * LINEPLAY_ROUND_QUESTIONS });
      return;
    }
    setActiveGame(currentSeed == null ? item : { ...item, seed: currentSeed });
  }, [session]);

  const handleGameDone = useCallback(() => {
    // Games show their own GameShellV2 results screen; session rewards stay
    // server-side via the inline timer — nothing is granted per round here.
    setActiveGame(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleActivityCompleted = useCallback((id: string) => {
    session.markActivityCompleted(id);
  }, [session]);

  const renderActiveGame = () => {
    if (!activeGame || !ride) return null;
    const common = {
      visible: true,
      seed: activeGame.seed,
      onClose: handleGameDone,
      onComplete: (_mult: number, meta?: Record<string, unknown>) => {
        if (activeGame.gameId === 'current') session.recordCurrentQuest(meta);
        handleActivityCompleted(activeGame.id);
        handleGameDone();
      },
    };
    switch (activeGame.gameId) {
      case 'tap': return <WhackAShark {...common} />;
      case 'timing': return <RhythmTapGame visible seed={activeGame.seed}
        onClose={common.onClose} onComplete={common.onComplete} />;
      case 'memory': return <MemoryGame {...common} deckId={snapshot.chapter?.finale.memoryDeckId} taskName={ride.rideName} />;
      case 'shark': return <SharkySwim {...common} />;
      case 'banana': return <BananaBasketGame {...common} />;
      case 'current': return <CurrentQuestGame {...common} taskName={ride.rideName} />;
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

  const handleEndSession = useCallback(() => {
    Alert.alert(
      'How did this line end?',
      'You keep any eligible queue rewards either way. A wait prediction counts only when you reach boarding.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'I left the line', onPress: () => {
          void session.endNow(false).catch(() =>
            Alert.alert('Could not finish LinePlay', 'Stay on this recap and try again.'));
        } },
        { text: 'I reached boarding', onPress: () => {
          void session.endNow(true).catch(() =>
            Alert.alert('Could not finish LinePlay', 'Stay on this recap and try again.'));
        } },
      ],
    );
  }, [session]);

  const handleExit = useCallback(async () => {
    try {
      await session.complete();
      if (!session.snapshot().rewardsPending) await session.forgetCheckpoint();
      navigation.goBack();
    } catch {
      Alert.alert('Could not finish LinePlay', 'Stay on this recap and try again.');
    }
  }, [navigation, session]);

  const handleNavigateTab = useCallback((screen: string) => {
    const state = session.getState();
    if (state === 'active' || state === 'paused') {
      Alert.alert(
        'Finish this wait?',
        `Your LinePlay recap will appear before opening ${tabLabel(screen)}. You keep any eligible queue rewards either way.`,
        [
          { text: 'Keep playing', style: 'cancel' },
          { text: 'I left the line', onPress: () => {
            tabAfterRecap.current = screen;
            void session.endNow(false).catch(() =>
              Alert.alert('Could not finish LinePlay', 'Stay on this recap and try again.'));
          } },
          { text: 'I reached boarding', onPress: () => {
            tabAfterRecap.current = screen;
            void session.endNow(true).catch(() =>
              Alert.alert('Could not finish LinePlay', 'Stay on this recap and try again.'));
          } },
        ],
      );
      return;
    }
    if (state === 'ending') {
      tabAfterRecap.current = screen;
      void session.complete().catch(() =>
        Alert.alert('Could not finish LinePlay', 'Stay on this recap and try again.'));
      return;
    }
    void (async () => {
      try {
        await session.complete();
        if (!session.snapshot().rewardsPending) await session.forgetCheckpoint();
        navigation.dispatch(StackActions.replace(screen));
      } catch {
        Alert.alert('Could not finish LinePlay', 'Stay on this recap and try again.');
      }
    })();
  }, [navigation, session]);

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
  const arcadeChoices = queueArcadeDestinations(activityPages, completedActivityIds)
    .map(choice => ({
      id: choice.id,
      title: GAME_NAMES[choice.gameId] ?? 'Queue Game',
      index: choice.index,
      completed: choice.completed,
    }));
  useEffect(() => {
    const id = pendingEncoreId.current;
    if (!id) return;
    const index = activityPages.findIndex(page => page.id === id);
    if (index < 0) return;
    pendingEncoreId.current = null;
    setPageIndex(index);
    activityListRef.current?.scrollToOffset({ offset: index * SCREEN_W, animated: true });
  }, [snapshot.playlist.length, snapshot.signal, snapshot.crewRelay]);

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
      gameId: routeChoice === 'route_a' ? 'memory' : 'timing',
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
  const newRoundIndex = newRoundNotice
    ? activityPages.findIndex(page => page.id === newRoundNotice.id) : -1;
  const projectMission = snapshot.parkProject ? resolveProjectMission(snapshot.parkProject) : null;
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
        <View style={styles.waitWrap}>
          {snapshot.startedAt == null ? (
            <WaitCardSkeleton rideName={ride.rideName} />
          ) : (
            <WaitCard
              rideName={ride.rideName}
              postedWaitMinutes={snapshot.plannedWaitMinutes}
              waitSource={snapshot.waitSource}
              entranceWaitMinutes={snapshot.entranceWaitMinutes}
              entranceWaitObservedAt={snapshot.entranceWaitObservedAt}
              entranceWaitChangeMinutes={snapshot.entranceWaitChangeMinutes}
              elapsedSeconds={snapshot.elapsedSeconds}
              rewardTrackingAvailable={snapshot.serverSessionId != null}
              rewardUnavailable={snapshot.rewardUnavailable}
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
              paused={snapshot.state === 'paused'}
              pauseReason={snapshot.pauseReason}
              onTogglePause={() => snapshot.state === 'paused'
                ? session.resume() : session.pause('manual')}
            />
          )}
        </View>

        {newRoundIndex > visiblePageIndex && snapshot.state !== 'complete' && (
          <NewRoundsBanner count={newRoundNotice!.count} paused={snapshot.state !== 'active'}
            onJump={() => { setNewRoundNotice(null); jumpToPage(newRoundIndex); }} />
        )}

        {snapshot.state !== 'complete' && <LinePlayLiveRail crew={liveCrew}
          projectTitle={projectMission?.title} projectStage={snapshot.parkProject?.stage}
          onOpenCrew={() => {
            if (liveCrew) jumpToPage(activityPages.findIndex(page => page.id === liveCrew.pageId));
          }}
          onOpenProject={() => setProjectOpen(true)} />}

        {/* Activity area (bottom) */}
        <View style={styles.activityArea}>
          {snapshot.state === 'complete' ? (
            <SessionRecap
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
              renderItem={({ item }) => (
                <View style={styles.page}>
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
                      rideId={ride.rideId}
                      parkId={ride.parkId}
                      chapterId={snapshot.chapter?.id}
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
              onArcade={arcadeChoices.length ? () => setArcadeOpen(true) : undefined}
              arcadePaused={snapshot.state !== 'active'}
              firstLabel={activityPages[0]?.kind === 'chapter_intro' ? 'Chapter' : 'First round'}
              progressText={storyStep ? `CLUE ${storyStep}/3`
                : activityPages[visiblePageIndex]?.kind === 'chapter_intro' ? 'STORY' : 'FREE PLAY'}
              progressAccessibilityLabel={storyStep ? `Story clue ${storyStep} of 3`
                : activityPages[visiblePageIndex]?.kind === 'chapter_intro'
                  ? 'Ride story. Choose a clue to begin.'
                  : 'Optional queue activity. Explore at your own pace.'}
              nextLabel={pageName(activityPages[nextPageIndex])}
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

      <QueueArcadeSheet
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
      />

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

      {/* Wave 3: mounted GameKit game (GameShellV2 renders its own Modal) */}
      <LinePlayMovementContext.Provider value={{
        moving: snapshot.state === 'paused',
        onResume: () => session.resume(),
      }}>
        {renderActiveGame()}
      </LinePlayMovementContext.Provider>

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

export function SessionRecap({
  elapsedSeconds,
  activityCount,
  activityNames,
  earnedEnergy,
  experience,
  partsCount,
  ticketsEarned,
  masteryBonusParts,
  crewPuzzleBonusParts = 0,
  currentQuestBonusParts = 0,
  rewardsPending,
  rewardsConfirmed,
  rewardTrackingAvailable,
  queueStamp = null,
  onOpenStampBook,
  resolution,
  predictionUnscored,
  crewPuzzle,
  crewRelay,
  crewRouteNames,
  crewScoreNoun,
  coin,
  coinState,
  playerEnergy,
  energyUnavailable = false,
  rideName,
  onOpenCoin,
  onOpenPark,
  parkAvailable,
  feedbackEnabled = false,
  feedback = null,
  feedbackLoading = false,
  feedbackSaving = false,
  feedbackError = null,
  onRateWait,
  onFavoriteActivity,
  doneLabel = 'Done',
  onDone,
}: {
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
  doneLabel?: string;
  onDone: () => void;
}) {
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.recapCard}>
      <LinearGradient colors={['#13a8e9', '#0867bb', '#064483']} style={styles.recapHero}>
        <View style={styles.recapHeroCopy}>
          <Text style={styles.recapKicker}>LINEPLAY COMPLETE</Text>
          <Text style={styles.recapRide} numberOfLines={2}>{rideName}</Text>
          <Text style={styles.recapTime}>{mins}m {secs}s</Text>
          <Text style={styles.recapSub}>time in line</Text>
        </View>
        <Image source={QUEUE_RECAP_SHARK} style={styles.recapShark} contentFit="contain" accessibilityLabel="Shark celebrating with a ride coin and park ticket" />
      </LinearGradient>

      <Text style={styles.recapSectionTitle}>{rewardsConfirmed ? 'YOUR VERIFIED HAUL' : 'YOUR LINEPLAY ADVENTURE'}</Text>
      <View style={styles.recapStats}>
        <RecapStat value={String(activityCount)} label={activityCount === 1 ? 'activity' : 'activities'} />
        {rewardsConfirmed && <RecapStat value={`+${earnedEnergy}⚡`} label="energy" />}
        {rewardsConfirmed && <RecapStat value={`+${experience}`} label="xp" />}
        {rewardsConfirmed && <RecapStat value={String(partsCount)} label="parts" />}
        {rewardsConfirmed && ticketsEarned > 0 && <RecapStat value={`+${ticketsEarned}`} label="ticket" />}
      </View>

      {rewardsConfirmed && queueStamp?.earned && onOpenStampBook && (
        <Pressable accessibilityRole="button" accessibilityLabel="Open Queue Navigator in Stamp Book"
          onPress={onOpenStampBook} style={styles.queueStampCard}>
          <Image source={QUEUE_STAMP_IMAGE} style={styles.queueStampImage} contentFit="contain" />
          <View style={styles.queueStampCopy}>
            <Text style={styles.queueStampKicker}>{queueStamp.new ? 'NEW STAMP EARNED' : 'YOUR LINEPLAY STAMP'}</Text>
            <Text style={styles.queueStampTitle}>QUEUE NAVIGATOR</Text>
            <Text style={styles.queueStampAction}>Open Stamp Book to see your rewards →</Text>
          </View>
        </Pressable>
      )}

      {rewardsConfirmed && masteryBonusParts > 0 && (
        <Text style={styles.recapPredictionText}>⭐ Coin mastery added {masteryBonusParts} Ride Part to this verified session.</Text>
      )}
      {rewardsConfirmed && crewPuzzleBonusParts > 0 && (
        <Text style={styles.recapPredictionText}>🧩 Your Crew Codebreaker guess added {crewPuzzleBonusParts} Ride Part.</Text>
      )}
      {rewardsConfirmed && currentQuestBonusParts > 0 && (
        <Text style={styles.recapPredictionText}>🦈 Current Quest added {currentQuestBonusParts} Ride Part to this verified wait.</Text>
      )}

      {activityNames.length > 0 && <View style={styles.recapPrediction}>
        <Text style={styles.recapPredictionText}>
          Played: {Array.from(new Map(
            Array.from(new Set(activityNames)).map(name => [name, activityNames.filter(item => item === name).length])
          )).map(([name, count]) => count > 1 ? `${name} ×${count}` : name).join(' · ')}
        </Text>
      </View>}

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

      {crewRelay?.step === 'complete' && (
        <View style={styles.recapPrediction}>
          <Text style={styles.recapPredictionText}>
            Your one-phone crew chose the {crewRelay.route === 'alpha'
              ? crewRouteNames?.[0] ?? 'Alpha' : crewRouteNames?.[1] ?? 'Omega'} route.
            {crewRelay.observation ? ` The Lookout's ${crewRelay.observation} signal shaped the Decoder's code and finale.` : ''}
            {' '}{crewScoreNoun}: {crewRelayScore(crewRelay)}/2.
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
        <View style={styles.coinNextCard}>
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
                  : (coin.available_parts ?? 0) >= coin.parts_to_next_level && playerEnergy >= coin.energy_to_next_level
                    ? 'Upgrade ready now.'
                    : `Next upgrade needs ${Math.max(0, coin.parts_to_next_level - (coin.available_parts ?? 0))} more Parts and ${Math.max(0, coin.energy_to_next_level - playerEnergy)} more Energy.`}
              </Text>
              {coin.next_level_perks.length > 0 && (
                <Text style={styles.coinNextBody}>Next unlock: {coin.next_level_perks.map(perk => perk.name).join(' · ')}</Text>
              )}
            </>
          )}
          <Pressable accessibilityRole="button" onPress={onOpenCoin} style={styles.coinNextButton}>
            <Text style={styles.coinNextButtonText}>{coin.current_level < coin.max_level &&
              (coin.available_parts ?? 0) >= coin.parts_to_next_level && playerEnergy != null && playerEnergy >= coin.energy_to_next_level
              ? 'Upgrade coin →' : 'View this coin →'}</Text>
          </Pressable>
        </View>
      )}
      {rewardsConfirmed && coinState === 'unowned' && (
        <View style={styles.coinNextCard}>
          <Text style={styles.coinNextLabel}>{partsCount > 0 ? 'PARTS SAVED' : 'YOUR NEXT PARK MOVE'}</Text>
          <Text style={styles.coinNextTitle}>{rideName}</Text>
          <Text style={styles.coinNextBody}>{partsCount > 0
            ? 'Collect this ride’s coin to spend the Parts you earned in line.'
            : 'Collect this ride’s coin to start mastering it. Your queue games still count in this recap.'}</Text>
          <Pressable accessibilityRole="button" onPress={onOpenPark} style={styles.coinNextButton}>
            <Text style={styles.coinNextButtonText}>{parkAvailable ? 'Open ride checklist →' : 'Open Coin Shelf →'}</Text>
          </Pressable>
        </View>
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

      <Pressable onPress={onDone} style={styles.recapBtn}>
        <Text style={styles.recapBtnText}>{doneLabel}</Text>
      </Pressable>
    </ScrollView>
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

function WaitCardSkeleton({ rideName }: { rideName: string }) {
  return <LinearGradient colors={['#159ee2', '#0873bd', '#064780']} style={styles.waitSkeleton}>
    <View style={styles.waitSkeletonCopy}>
      <Text style={styles.waitSkeletonKicker}>YOUR SHARK IS READY  ✦</Text>
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
        <Text style={styles.activitySkeletonKicker}>LINEPLAY  ✦  FIRST ROUND</Text>
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
    backgroundColor: '#ddf5ff',
    borderRadius: borderRadius.xxl,
    padding: spacing.md,
    borderWidth: 3,
    borderColor: '#ffffff',
    ...shadows.lg,
  },
  recapHero: {
    minHeight: 176,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#80e4ff',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  recapHeroCopy: { width: '60%', zIndex: 1 },
  recapShark: { position: 'absolute', width: 168, height: 168, right: -5, bottom: -11 },
  recapKicker: {
    color: '#fff4ac',
    fontFamily: 'Knockout',
    fontSize: 14,
    letterSpacing: 0.7,
  },
  recapRide: { color: '#ffffff', fontFamily: 'Shark', fontSize: 21, marginTop: 6, lineHeight: 25 },
  recapTime: {
    color: '#ffffff',
    fontFamily: 'Knockout',
    fontSize: 36,
    marginTop: spacing.xs,
  },
  recapSub: { color: '#d6f4ff', fontFamily: 'Knockout', fontSize: 14 },
  recapSectionTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 17,
    textAlign: 'center', marginTop: spacing.lg },
  recapStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: '#6dc9f2',
    backgroundColor: '#ffffff',
  },
  recapStat: { alignItems: 'center', flex: 1 },
  recapStatValue: { color: '#07528f', fontFamily: 'Knockout', fontSize: 18 },
  recapStatLabel: {
    color: '#3b6884',
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  queueStampCard: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg,
    padding: spacing.sm, borderRadius: borderRadius.lg, borderWidth: 3,
    borderColor: '#ffd443', backgroundColor: '#e5f8ff', ...shadows.md },
  queueStampImage: { width: 70, height: 70, marginRight: spacing.sm },
  queueStampCopy: { flex: 1 },
  queueStampKicker: { color: '#0874bb', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8 },
  queueStampTitle: { color: '#083d73', fontFamily: 'Shark', fontSize: 17, marginTop: 1 },
  queueStampAction: { color: '#205570', fontFamily: 'Knockout', fontSize: 13, marginTop: 3 },
  recapPrediction: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#a3d8ef',
  },
  recapPredictionText: { color: '#205570', fontSize: 13, lineHeight: 19 },
  recapPending: {
    color: '#925200',
    fontSize: 12,
    marginTop: spacing.lg,
  },
  coinNextCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: '#ffd443',
    backgroundColor: '#ffffff',
  },
  coinNextLabel: { color: '#0874bb', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.7 },
  coinNextTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 18, marginTop: spacing.xs },
  coinNextBody: { color: '#315d77', fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  coinNextButton: { alignSelf: 'flex-start', marginTop: spacing.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.tertiary },
  coinNextButtonText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  waitFeedbackCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: borderRadius.lg,
    backgroundColor: '#ffffff' },
  waitFeedbackTitle: { color: '#073b74', fontFamily: 'Shark', fontSize: 17 },
  waitFeedbackOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  waitFeedbackOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1,
    borderColor: '#8bc8e9' },
  waitFeedbackSelected: { borderColor: '#e7ac00', backgroundColor: '#fff3ba' },
  waitFeedbackOptionText: { color: '#073b74', fontSize: 13, fontWeight: '700' },
  waitFeedbackNote: { color: '#4c758d', fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  waitFeedbackError: { color: colors.error, fontSize: 12, marginTop: spacing.sm },
  recapBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  recapBtnText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
});
