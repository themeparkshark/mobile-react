/**
 * Play together controller (L3). LinePlayScreen owns the wait and the game
 * modal; this hook owns the session start ("Who's in line?"), the crew, the
 * pass-and-play turn loop and the hand-off overlay, so the screen only routes
 * three calls through it.
 *
 * Economy: a group round is the same game launch the solo player gets
 * (session.beginGame), and a grown-up turn reports stars the same way. Ride
 * Parts still come only from the server's verified wait, so a crew feeds the
 * same coin with the same caps. Nothing here mints anything.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import type { LinePlaySession, MiniGameId, ActivityItem, SessionSnapshot } from '../../../services/lineplay/LinePlaySession';
import type { QueueDifficulty } from '../../../services/lineplay/replay';
import {
  currentTurn, endGroupRound, GAME_LABELS, groupStandings, isPassAndPlay, isPassAndPlayGame, kidRoundNote,
  lastRound, recordGroupTurn, roundPodium, skipGroupTurn, startGroupRound, type LineGroup,
} from '../../../services/lineplay/lineGroup';
import { lineGroupWaitKey } from '../../../services/lineplay/lineGroupStore';
import { useLineGroup } from '../../../services/lineplay/useLineGroup';
import WhosInLineSheet from './WhosInLineSheet';
import PassPhoneOverlay, { type PassPhoneMode } from './PassPhoneOverlay';
import GroupStrip from './GroupStrip';
import GroupRecapCard, { seatMap } from './GroupRecapCard';
import type { RideCoinLevelType } from '../../../models/ride-coin-level-type';

type MiniGameItem = Extract<ActivityItem, { kind: 'minigame' }>;

/** What the screen mounts for one turn. */
export interface GroupTurnLaunch {
  readonly item: MiniGameItem;
  readonly seed: number;
  readonly difficulty: QueueDifficulty;
  /** Kid turn: the screen plays the simplest board (Memory sprint, easy arcade). */
  readonly kidRound: boolean;
}

export function leaderLine(group: LineGroup): string | null {
  const rows = groupStandings(group).filter(row => row.turns > 0);
  if (rows.length === 0) return null;
  const top = rows.filter(row => row.place === 1);
  const stars = `${top[0].stars} star${top[0].stars === 1 ? '' : 's'}`;
  return top.length === 1 ? `${top[0].player.name} leads with ${stars}` : `Tied at the top with ${stars}`;
}

/** The next pass-and-play game after this one in the playlist, wrapping around. */
export function nextGroupGame(pages: readonly { id: string; kind: string }[], afterId: string): MiniGameItem | null {
  const games = pages.filter((page): page is MiniGameItem => page.kind === 'minigame' &&
    isPassAndPlayGame((page as MiniGameItem).gameId));
  if (games.length === 0) return null;
  const at = games.findIndex(page => page.id === afterId);
  return games[(at + 1) % games.length] ?? null;
}

export function useGroupPlay({ session, snapshot, playerId, ownerName, pages, gameOpen, openTurn }: {
  readonly session: LinePlaySession;
  readonly snapshot: SessionSnapshot;
  readonly playerId: number | null;
  readonly ownerName: string | null;
  readonly pages: readonly { id: string; kind: string }[];
  /** Any game (solo or a turn) covers the screen. */
  readonly gameOpen: boolean;
  readonly openTurn: (launch: GroupTurnLaunch) => void;
}) {
  const waitKey = snapshot.ride && snapshot.startedAt != null
    ? lineGroupWaitKey(snapshot.ride.rideId, snapshot.startedAt) : null;
  const crew = useLineGroup(playerId, waitKey);
  const group = crew.group;
  const [editing, setEditing] = useState(false);
  const [podiumFor, setPodiumFor] = useState<string | null>(null);
  const live = snapshot.state === 'active' || snapshot.state === 'paused';

  // The wait ended mid-round: close it so the recap counts what was played.
  useEffect(() => {
    if (snapshot.state === 'complete' && group?.active) crew.update(endGroupRound);
    if (snapshot.state === 'complete') setPodiumFor(null);
  }, [snapshot.state, group?.active != null]);

  const wantsRound = useCallback((item: MiniGameItem) =>
    isPassAndPlay(group) && isPassAndPlayGame(item.gameId), [group]);

  const startRound = useCallback((item: MiniGameItem) => {
    if (!isPassAndPlay(group) || session.getState() !== 'active') return;
    const launch = session.beginGame(item);
    setPodiumFor(null);
    crew.update(current => startGroupRound(endGroupRound(current), {
      activityId: item.id, gameId: item.gameId, seed: launch.seed, difficulty: launch.difficulty,
      title: item.title ?? null,
    }));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [group, session, crew.update]);

  const go = useCallback(() => {
    const round = group?.active;
    const turn = currentTurn(group);
    if (!round || !turn || session.getState() !== 'active') return;
    const base = snapshot.playlist.find((page): page is MiniGameItem => page.kind === 'minigame' && page.id === round.activityId)
      ?? { kind: 'minigame' as const, id: round.activityId, gameId: round.gameId, seed: round.seed, title: round.title ?? undefined };
    // Trivia deals a fresh question block per turn (no overheard answers);
    // every arcade turn plays the same board, so the round is fair.
    const seed = round.gameId === 'trivia' && !turn.kidRound && turn.number > 1
      ? session.beginGame(base).seed : round.seed;
    openTurn({
      item: { ...base, gameId: turn.gameId, title: base.title },
      seed,
      difficulty: (turn.kidRound ? 1 : round.difficulty) as QueueDifficulty,
      kidRound: turn.kidRound,
    });
  }, [group, session, snapshot.playlist, openTurn]);

  const afterTurn = useCallback((next: LineGroup, before: LineGroup) => {
    if (before.active && !next.active) {
      setPodiumFor(before.active.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  /** A turn's game closed. A 0-star close is still that player's turn. */
  const finishTurn = useCallback((stars: number, score: number | null) => {
    const before = group;
    const round = before?.active;
    const turn = currentTurn(before);
    if (!before || !round || !turn) return;
    if (!turn.kidRound) session.recordGameResult(round.gameId, stars);
    if (stars > 0) session.markActivityCompleted(round.activityId);
    const next = recordGroupTurn(before, stars, score);
    crew.update(() => next);
    afterTurn(next, before);
  }, [group, session, crew.update, afterTurn]);

  const skip = useCallback(() => {
    if (!group?.active) return;
    const next = skipGroupTurn(group);
    crew.update(() => next);
    afterTurn(next, group);
  }, [group, crew.update, afterTurn]);

  const endRound = useCallback(() => {
    if (!group?.active) return;
    const next = endGroupRound(group);
    crew.update(() => next);
    if (next.rounds.length > group.rounds.length) afterTurn(next, group);
  }, [group, crew.update, afterTurn]);

  const finished = lastRound(group);
  const podiumRound = podiumFor && finished?.id === podiumFor ? finished : null;
  const nextGame = podiumRound ? nextGroupGame(pages, podiumRound.activityId) : null;
  const seats = useMemo(() => group ? seatMap(group) : {}, [group?.players]);

  let mode: PassPhoneMode | null = null;
  const turn = currentTurn(group);
  // A manual pause shows the wait screen and its RESUME; the hand-off waits for it.
  if (snapshot.state === 'active' && !gameOpen && group?.active && turn) {
    mode = { kind: 'handoff', turn, seat: seats[turn.player.id] ?? 0, firstTurn: turn.number === 1,
      gameLabel: group.active.title ?? GAME_LABELS[group.active.gameId],
      kidNote: turn.kidRound ? kidRoundNote(group.active) : null };
  } else if (live && !gameOpen && group && podiumRound) {
    mode = { kind: 'podium', entries: roundPodium(group, podiumRound), seats,
      gameLabel: podiumRound.title ?? GAME_LABELS[podiumRound.gameId], leaderLine: leaderLine(group),
      nextLabel: nextGame ? nextGame.title ?? GAME_LABELS[nextGame.gameId] : null };
  }

  const openerVisible = (snapshot.state === 'active' && crew.loaded && !crew.chosen && !gameOpen) || editing;

  const overlays: ReactNode = <>
    {mode && <PassPhoneOverlay mode={mode} moving={snapshot.moving}
      onGo={go} onSkip={skip} onEndRound={endRound}
      onNext={() => { if (nextGame) startRound(nextGame); }}
      onDone={() => setPodiumFor(null)} />}
    <WhosInLineSheet visible={openerVisible && !mode} ownerName={ownerName} lastCrew={editing ? null : crew.lastCrew}
      editing={editing ? group : null}
      onChoose={next => {
        // Editing keeps the results of anyone still in the crew.
        const keep = editing && group && next.players.length === group.players.length && next.kind === group.kind
          ? { ...group, players: next.players } : next;
        crew.choose(keep);
        setEditing(false);
      }}
      onClose={() => setEditing(false)} />
  </>;

  const strip: ReactNode = live && crew.loaded && crew.chosen
    ? <GroupStrip group={group} onEdit={() => { if (!group?.active) setEditing(true); }} />
    : null;

  const recapSlot = (args: {
    readonly realMinutes: number; readonly postedMinutes: number | null; readonly partsEarned: number | null;
    readonly rewardsConfirmed: boolean; readonly coin: RideCoinLevelType | null;
  }): ReactNode => isPassAndPlay(group) && group.rounds.length > 0
    ? <GroupRecapCard group={group} {...args} /> : null;

  /** The crew opener or a pass-the-phone card is up: one-time tips wait. */
  const sheetOpen = (openerVisible && !mode) || !!mode;
  return { group, wantsRound, startRound, finishTurn, overlays, strip, recapSlot, sheetOpen };
}

export type { MiniGameId };
