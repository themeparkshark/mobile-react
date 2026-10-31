/**
 * The map's guide wiring (core loop blueprint 4.1 and 4.3, October 2026), out of ExploreScreen:
 * the guide's inputs (switches, rungs, earned Tickets, the wallet, welcome back, owned and level-up
 * coins, today's Adventure win), the Next Coin guide itself, the one pointer's path and island, the
 * card's and ticket tab's sheet requests, and the attention clock and gate every automatic open asks.
 * ExploreScreen calls it once, where its old inline block was; nothing here draws.
 * Owned by the guide-map lane.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskType } from '../../models/task-type';
import type { PlayerType } from '../../models/player-type';
import type { CurrentRedeemableType } from '../../models/current-redeemable-type';
import type { LivePark } from '../../api/endpoints/parks/live';
import type { AdventureTicket, TripGoalData } from '../../api/endpoints/me/trip-goal';
import { attentionGate, attentionQueue, autoOpenAllowed } from '../../screens/ExploreScreen/mapPresentationQueue';
import { guide } from '../../services/guide/nextCoin';
import { useGuideFlags } from '../../services/guide/guideFlags';
import { currentAppOpen, useRung } from '../../services/reveal/revealLadder';
import useNextCoinGuide from './useNextCoinGuide';
import { goalLevelUpTaskId, guideWallet, ownedTaskIdsFor } from './guideCoins';
import useClaimableTickets from './useClaimableTickets';
import useWelcomeBack from './useWelcomeBack';

/** The guide picks its first coin once the islands, live feed and Adventure are in, or after this wait. */
const GUIDE_DATA_WAIT_MS = 4000;
/** The calm stand-in island for a target that left today's map (a won Adventure coin on its Line story). */
const PARKED_TASK = { id: -1, name: '', latitude: '0', longitude: '0', coin_url: '', coins: 0, completion_goal: 0, experience: 0,
  times_completed: 0, asset_id: -1, ticket_cost: 1 } as unknown as TaskType;

type Point = { readonly latitude: number; readonly longitude: number };

export interface MapGuideInput {
  readonly player: PlayerType | null | undefined;
  readonly park: { readonly id: number; readonly name: string } | null | undefined;
  readonly mapFocused: boolean;
  readonly location: Point | null | undefined;
  readonly redeemables: unknown;
  readonly visibleTasks: readonly TaskType[];
  readonly livePark: LivePark | null;
  readonly adventure: AdventureTicket | null | undefined;
  readonly tripGoalData: TripGoalData | null | undefined;
  readonly queueDwell: { readonly rideId: number } | null | undefined;
  readonly starRides: ReadonlySet<number>;
  readonly rushes: readonly { readonly task: { readonly id: number } }[];
  readonly rangeChecked: boolean;
  readonly playableTaskId: number | null | undefined;
  readonly adventureGate: { readonly state: string } | null | undefined;
  readonly activeRedeemable: CurrentRedeemableType | undefined;
  readonly refreshPlayer: () => unknown;
  readonly parkWins: number;
  readonly redeemFlowOpen: boolean;
  readonly parkLoaded: boolean;
  readonly homeLocationConfirmed: boolean;
  readonly setSelectedTask: (task: TaskType) => void;
}

export default function useMapGuide(input: MapGuideInput) {
  const {
    player, park, mapFocused, location, redeemables, visibleTasks, livePark, tripGoalData, queueDwell, starRides,
    rushes, rangeChecked, playableTaskId, adventureGate, activeRedeemable, refreshPlayer, parkWins, redeemFlowOpen, parkLoaded, homeLocationConfirmed, setSelectedTask,
  } = input;
  const adventure = input.adventure ?? null;
  // The Next Coin guide (core loop 4.1): one card, one target, one button, in the one top-left slot.
  // It replaces the Adventure Ticket chip, the Next Up rail, the ride goal card, the in-line card and
  // the queue games card; every pointer in the app calls guide.setTarget.
  const guideFlags = useGuideFlags(player?.id ?? null);
  // A family phone's second shark never inherits the first one's target, plan or declined Line story.
  // Declared before the guide hook, so this effect runs before its first resolve for the new player.
  // Signing out (a player, then none) forgets them too.
  const guidePlayerSeen = useRef<number | null>(null);
  useEffect(() => {
    if (player?.id != null) { guidePlayerSeen.current = player.id; guide.forPlayer(player.id); }
    else if (guidePlayerSeen.current != null) { guidePlayerSeen.current = null; guide.forPlayer(null); }
  }, [player?.id]);
  const coinLevelsRung = useRung('coin_levels');
  const dailyRung = useRung('daily');
  const trailRung = useRung('trail');
  const eventsRung = useRung('events');
  const claimable = useClaimableTickets(!!player && !!park && mapFocused, player?.tickets ?? 0, player?.id ?? null);
  // Earned Tickets waiting: the guide card and the Adventure sheet both lead with them (one answer).
  const claimableTicketCount = (claimable.sources ?? []).reduce((sum, source) => sum + (source.tickets > 0 ? source.tickets : 0), 0);
  const claimTickets = useCallback(() => claimable.claim().then(() => refreshPlayer()).catch(() => undefined),
    [claimable.claim]); // eslint-disable-line react-hooks/exhaustive-deps
  const wallet = useMemo(() => player ? guideWallet({
    tickets: player.tickets, heldPasses: player.rescue_passes,
    freeTryReady: guideFlags.ride_rescue_pass === true && tripGoalData?.wallet?.rescue_pass_available === true,
    queueTicketsOn: guideFlags.queue_tickets === true, claimable: claimable.sources,
  }) : null, [player, guideFlags, tripGoalData?.wallet?.rescue_pass_available, claimable.sources]);
  const rushTaskIds = useMemo(() => new Set(rushes.map(pick => pick.task.id)), [rushes]);
  // The guide picks its first coin once the islands, the live feed and today's Adventure are in (or
  // GUIDE_DATA_WAIT_MS ran out: a missing feed never stalls it), so a half-loaded map never sets a
  // target that would then hold.
  const [guideWaitOver, setGuideWaitOver] = useState(false);
  const islandsIn = !!redeemables;
  useEffect(() => {
    setGuideWaitOver(false);
    if (!park || !islandsIn) return undefined;
    const timer = setTimeout(() => setGuideWaitOver(true), GUIDE_DATA_WAIT_MS);
    return () => clearTimeout(timer);
  }, [park?.id, islandsIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const guideReady = islandsIn && (guideWaitOver || (!!tripGoalData && !!livePark));
  // Welcome back after 14+ days away: the guide's welcome back state comes first (core loop 4.1).
  const welcome = useWelcomeBack(player?.id ?? null);
  // The shelf's word on which coins the player owns here (the map's list of today's coins has none).
  const ownedTaskIds = useMemo(() => ownedTaskIdsFor(tripGoalData?.rides, park?.id ?? null), [tripGoalData?.rides, park?.id]);
  // Level up ready: the trip goal's coin with its next level paid for (the only level costs the client has).
  const levelUpTaskId = goalLevelUpTaskId(tripGoalData);
  const levelUpTaskIds = useMemo(() => new Set(levelUpTaskId != null ? [levelUpTaskId] : []), [levelUpTaskId]);
  // Today's Adventure coin just won here: the guide treats its ticket as on its line story until the
  // trip goal re-read agrees (or 30 s pass, so a win the server did not count never sticks).
  const [adventureWonTaskId, setAdventureWonTaskId] = useState<number | null>(null);
  useEffect(() => {
    if (adventureWonTaskId == null) return undefined;
    const timer = setTimeout(() => setAdventureWonTaskId(null), 30_000);
    return () => clearTimeout(timer);
  }, [adventureWonTaskId]);
  const nextCoin = useNextCoinGuide({
    enabled: !!player && !!park, ready: guideReady, tripGoalLoaded: !!tripGoalData, parkId: park?.id ?? null, parkName: park?.name ?? null, location,
    tasks: visibleTasks, live: livePark, adventure, adventureWonTaskId, dwellRideId: queueDwell?.rideId ?? null,
    starTaskIds: starRides, rushTaskIds, ownedTaskIds, levelUpTaskIds,
    starRushUnlocked: coinLevelsRung.open, coinLevelsUnlocked: coinLevelsRung.open,
    wallet, queueTicketsOn: guideFlags.queue_tickets === true,
    // PLAY! itself decides "You're here": the server's range check, never the guide's geometry alone.
    playableTaskId: rangeChecked ? playableTaskId : undefined,
    daysAway: welcome.daysAway, welcomeBackDone: welcome.done,
    lineStoryNear: adventureGate?.state !== 'far',
  });
  const guideShown = !!player && !!park;
  const guideTargetId = nextCoin.target?.taskId ?? null;
  // The target's own coin art: the map list has none, so the trip goal's ride list (or PLAY!'s coin) supplies it.
  const guideCoinUrl = useMemo(() => {
    if (guideTargetId == null) return null;
    const fromMap = nextCoin.targetTask?.coin_url;
    if (fromMap) return fromMap;
    const fromTrip = tripGoalData?.rides?.find(ride => ride.task_id === guideTargetId)?.coin_url;
    if (fromTrip) return fromTrip;
    const here = activeRedeemable?.type === 'task' && (activeRedeemable.model as TaskType).id === guideTargetId
      ? (activeRedeemable.model as TaskType).coin_url : null;
    return here || null;
  }, [guideTargetId, nextCoin.targetTask, tripGoalData?.rides, activeRedeemable]);
  // Until the first coin is won, the guide's "Tap PLAY!" picture shows every time PLAY! rises.
  const hasWonACoin = (player?.completed_tasks_count ?? 0) > 0 || (player?.ride_coins_collected ?? 0) > 0 || parkWins > 0;

  // The dotted path and the edge arrow always agree with the card (one owner of the pointer).
  const [guidePathRequest, setGuidePathRequest] = useState(0);
  // The point comes from the guide's own coin, so a won Adventure coin (off today's map, waiting on its
  // Line story) still has its path and edge arrow.
  const guidePoint = nextCoin.targetPoint ?? (nextCoin.targetTask
    ? { latitude: Number(nextCoin.targetTask.latitude), longitude: Number(nextCoin.targetTask.longitude) } : null);
  // The souvenir step unfolds anywhere: no dotted path and no edge arrow back to the ride (pathPoint null).
  const pathPoint = nextCoin.pathPoint;
  const guideMapTarget = useMemo(() => pathPoint && nextCoin.target
    ? { latitude: pathPoint.latitude, longitude: pathPoint.longitude,
      requestId: nextCoin.target.taskId * 1000 + guidePathRequest } : null,
  [pathPoint?.latitude, pathPoint?.longitude, nextCoin.target?.taskId, guidePathRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  // That off-map target's island: the coin it is (owned, calm), at its ride, so the card, the dotted
  // path and the edge arrow all point at something on the map (core loop 4.1, one owner).
  const lineStoryIsland = useMemo<TaskType | null>(() => {
    if (!nextCoin.targetOffMap || !nextCoin.target || !guidePoint) return null;
    return { ...PARKED_TASK, id: nextCoin.target.taskId, name: nextCoin.target.name,
      latitude: String(guidePoint.latitude), longitude: String(guidePoint.longitude),
      coin_url: guideCoinUrl ?? '', times_completed: 1, asset_id: -1 } as TaskType;
  }, [nextCoin.targetOffMap, nextCoin.target?.taskId, nextCoin.target?.name, guidePoint?.latitude, guidePoint?.longitude, guideCoinUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const [adventureSheetRequest, setAdventureSheetRequest] = useState(0);
  const [adventureCelebrateRequest, setAdventureCelebrateRequest] = useState(0);

  // The attention rules (core loop 4.3): one automatic open per app open; at a park nothing opens by
  // itself in the first 30 s, while walking to the guide target, during play or within 10 s of a win
  // card, and no chest ever opens by itself at a park. Everything else waits on its button.
  const [flowClosedAt, setFlowClosedAt] = useState<number | null>(null);
  const flowWasOpen = useRef(false);
  useEffect(() => {
    if (flowWasOpen.current && !redeemFlowOpen) setFlowClosedAt(Date.now());
    flowWasOpen.current = redeemFlowOpen;
  }, [redeemFlowOpen]);
  const [attentionClock, setAttentionClock] = useState(0);
  useEffect(() => {
    // Re-check when a quiet window ends (30 s after arriving, 10 s after a win card).
    const ends = [nextCoin.arrivedAt != null ? nextCoin.arrivedAt + 30_000 : 0, flowClosedAt != null ? flowClosedAt + 10_000 : 0]
      .map(at => at - Date.now()).filter(ms => ms > 0);
    if (!ends.length) return undefined;
    const timer = setTimeout(() => setAttentionClock(tick => tick + 1), Math.min(...ends) + 50);
    return () => clearTimeout(timer);
  }, [nextCoin.arrivedAt, flowClosedAt]);
  const appOpenId = currentAppOpen();
  const attentionFor = (kind: Parameters<typeof autoOpenAllowed>[0]) => autoOpenAllowed(kind, {
    atPark: !!park, now: attentionClock >= 0 ? Date.now() : 0, arrivedAt: nextCoin.arrivedAt,
    walkingToTarget: !!park && nextCoin.state === 'walk', playing: redeemFlowOpen, winCardClosedAt: flowClosedAt,
    autoOpenUsed: attentionQueue.used(appOpenId, kind),
  });
  // Other lanes ask the same rules through attentionGate (the ride question, the membership look).
  // Published only once the map knows the place (a park, or home confirmed); until then nothing opens by itself.
  const placeKnown = parkLoaded && (!!park || homeLocationConfirmed);
  useEffect(() => {
    if (!placeKnown) { attentionGate.hold(); return; }
    attentionGate.publish({ atPark: !!park, arrivedAt: nextCoin.arrivedAt, walkingToTarget: !!park && nextCoin.state === 'walk',
      playing: redeemFlowOpen, winCardClosedAt: flowClosedAt }, appOpenId);
  }, [placeKnown, park, nextCoin.arrivedAt, nextCoin.state, redeemFlowOpen, flowClosedAt, appOpenId]);

  // Today's Adventure ticket tab on the guide card while the guide points elsewhere: opens its sheet.
  const adventureStampsKey = adventure ? `${+!!adventure.discover}${+!!adventure.play}${+(adventure.phase === 'complete')}` : '';
  const adventureTabProps = useMemo(() => ({
    stamps: [adventureStampsKey[0] === '1', adventureStampsKey[1] === '1', adventureStampsKey[2] === '1'] as [boolean, boolean, boolean],
    onPress: () => setAdventureSheetRequest(n => n + 1),
  }), [adventureStampsKey]);
  const onGuideCardPress = useCallback(() => {
    // On today's Adventure ride the card is the ticket's frame: it opens the ticket's sheet (stamps, souvenir).
    if (nextCoin.copy.dots) { setAdventureSheetRequest(n => n + 1); return; }
    const task = nextCoin.targetTask;
    if (!task && !nextCoin.targetPoint) return;
    setGuidePathRequest(n => n + 1);
    if (task) setSelectedTask(task);
  }, [nextCoin.copy.dots, nextCoin.targetTask, nextCoin.targetPoint]);

  return {
    guideFlags, coinLevelsRung, dailyRung, trailRung, eventsRung, claimable, claimableTicketCount, claimTickets, wallet, welcome,
    levelUpTaskId, setAdventureWonTaskId, nextCoin, guideShown, guideCoinUrl, hasWonACoin, guideTargetId, setGuidePathRequest, guideMapTarget, lineStoryIsland, adventureSheetRequest,
    setAdventureSheetRequest, adventureCelebrateRequest, setAdventureCelebrateRequest, flowClosedAt, appOpenId, attentionFor, adventureTabProps, onGuideCardPress,
  };
}
