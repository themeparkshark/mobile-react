/**
 * Play together (L3): one phone, the crew standing next to you.
 *
 * "Who's in line?" sets the group. Pass-and-play rounds then run an existing
 * Line Play game once per player on the same phone, with a hand-off between
 * turns. Everything here is local and cosmetic: names never leave the device,
 * and nothing in a group round grants a reward. Ride Parts still come only
 * from the server's verified wait, the same coin and the same caps as solo.
 *
 * Pure module (no React, no storage) so the rules are unit tested.
 */
import type { MiniGameId } from './LinePlaySession';

export type GroupKind = 'solo' | 'couple' | 'family' | 'friends';

export interface GroupPlayer {
  readonly id: string;
  readonly name: string;
  /** Kid turns play simpler rounds (family mode). */
  readonly kid: boolean;
}

export interface GroupTurnResult {
  readonly playerId: string;
  /** 0-3, the game's own star rating at the difficulty that player played. */
  readonly stars: number;
  readonly score: number | null;
  /** The game this turn actually played (a kid turn can swap to a simpler one). */
  readonly gameId: MiniGameId;
  readonly kidRound: boolean;
  /** Stepped away (bathroom run, Rider Switch). Never counts against anyone. */
  readonly skipped: boolean;
}

export interface GroupRound {
  readonly id: string;
  readonly activityId: string;
  readonly gameId: MiniGameId;
  readonly title: string | null;
  /** The launch seed: every arcade turn plays the same board, so it is fair. */
  readonly seed: number;
  readonly difficulty: 1 | 2 | 3;
  /** Player ids in turn order; the first player rotates every round. */
  readonly order: readonly string[];
  readonly results: readonly GroupTurnResult[];
}

export interface LineGroup {
  readonly version: 1;
  readonly kind: GroupKind;
  readonly players: readonly GroupPlayer[];
  /** Finished rounds, oldest first. */
  readonly rounds: readonly GroupRound[];
  /** The round being passed around right now. */
  readonly active: GroupRound | null;
}

export const MAX_GROUP_PLAYERS = 6;
export const MAX_NAME_LENGTH = 14;
export const MAX_GROUP_ROUNDS = 60;

/** Games that run as one turn per player. Bonus-proof games stay with the phone owner. */
export const PASS_AND_PLAY_GAMES: readonly MiniGameId[] = ['tap', 'timing', 'memory', 'trivia', 'shark', 'banana'];

const KINDS: readonly GroupKind[] = ['solo', 'couple', 'family', 'friends'];
const GAME_IDS: readonly MiniGameId[] = ['tap', 'timing', 'memory', 'trivia', 'shark', 'banana', 'current', 'showdown'];

export const GAME_LABELS: Readonly<Record<MiniGameId, string>> = {
  tap: 'Whack-a-Shark', timing: 'Rhythm Tap', memory: 'Memory Match', trivia: 'Ride Trivia',
  shark: 'Sharky Swim', banana: 'Banana Basket', current: 'Current Quest', showdown: 'Shark Showdown',
};

/** A friendly title for each player's best game in the recap. Everyone gets one. */
const GAME_AWARDS: Readonly<Record<MiniGameId, string>> = {
  tap: 'Whack Ace', timing: 'Rhythm Ace', memory: 'Memory Ace', trivia: 'Trivia Brain',
  shark: 'Swim Ace', banana: 'Banana Ace', current: 'Quest Ace', showdown: 'Showdown Ace',
};

export function defaultGroupSize(kind: GroupKind): number {
  return kind === 'solo' ? 1 : kind === 'couple' ? 2 : kind === 'family' ? 4 : 3;
}

export function groupSizeRange(kind: GroupKind): { readonly min: number; readonly max: number } {
  if (kind === 'solo') return { min: 1, max: 1 };
  if (kind === 'couple') return { min: 2, max: 2 };
  return { min: 2, max: MAX_GROUP_PLAYERS };
}

/** Names are local only. Trim, drop control characters, cap the length. */
export function cleanPlayerName(raw: unknown, fallback: string): string {
  const text = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const clipped = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
  return clipped || fallback;
}

export function defaultPlayerName(index: number, kind: GroupKind, ownerName?: string | null): string {
  if (index === 0 && ownerName) return cleanPlayerName(ownerName, 'Player 1');
  return `Player ${index + 1}`;
}

/** In family mode the first player is the grown-up holding the phone; the rest start as kids. */
export function defaultKidFlag(index: number, kind: GroupKind): boolean {
  return kind === 'family' && index > 0;
}

export function createLineGroup(
  kind: GroupKind,
  entries: ReadonlyArray<{ readonly name?: string; readonly kid?: boolean }>,
): LineGroup {
  const safeKind = KINDS.includes(kind) ? kind : 'solo';
  const range = groupSizeRange(safeKind);
  const size = Math.max(range.min, Math.min(range.max, entries.length || defaultGroupSize(safeKind)));
  const players: GroupPlayer[] = [];
  const used = new Set<string>();
  for (let index = 0; index < size; index++) {
    const entry = entries[index] ?? {};
    let name = cleanPlayerName(entry.name, `Player ${index + 1}`);
    // Two players called "Sam" still need a clear hand-off.
    if (used.has(name.toLowerCase())) name = cleanPlayerName(`${name} ${index + 1}`, `Player ${index + 1}`);
    used.add(name.toLowerCase());
    players.push({ id: `p${index + 1}`, name, kid: safeKind === 'family' ? Boolean(entry.kid) : false });
  }
  return { version: 1, kind: safeKind, players, rounds: [], active: null };
}

export function isPassAndPlay(group: LineGroup | null | undefined): group is LineGroup {
  return Boolean(group && group.players.length >= 2);
}

export function isPassAndPlayGame(gameId: MiniGameId): boolean {
  return PASS_AND_PLAY_GAMES.includes(gameId);
}

export function hasKids(group: LineGroup | null | undefined): boolean {
  return Boolean(group?.players.some(player => player.kid));
}

/**
 * Family mode: a kid turn plays a simpler round. Arcade games drop to their
 * easiest setting; trivia and rhythm (reading and timing heavy) swap to a
 * four-pair Memory sprint. Stars are rated per game and difficulty, so a kid's
 * three stars count the same as a grown-up's.
 */
export function turnGame(
  round: Pick<GroupRound, 'gameId' | 'difficulty'>, kid: boolean,
): { readonly gameId: MiniGameId; readonly difficulty: 0 | 1 | 2 | 3; readonly kidRound: boolean } {
  if (!kid) return { gameId: round.gameId, difficulty: round.difficulty, kidRound: false };
  switch (round.gameId) {
    case 'tap': case 'shark': case 'banana':
      return { gameId: round.gameId, difficulty: 1, kidRound: true };
    default:
      return { gameId: 'memory', difficulty: 0, kidRound: true };
  }
}

/** One line for the hand-off screen when a kid round swaps or softens a game. */
export function kidRoundNote(round: Pick<GroupRound, 'gameId' | 'difficulty'>): string {
  const game = turnGame(round, true);
  if (game.gameId === 'memory' && game.difficulty === 0) return 'Kid round: 4 quick picture pairs';
  return `Kid round: easy ${GAME_LABELS[game.gameId]}`;
}

export function startGroupRound(group: LineGroup, launch: {
  readonly activityId: string; readonly gameId: MiniGameId; readonly seed: number;
  readonly difficulty: 1 | 2 | 3; readonly title?: string | null;
}): LineGroup {
  if (!isPassAndPlay(group) || group.active || !isPassAndPlayGame(launch.gameId)) return group;
  const ids = group.players.map(player => player.id);
  const shift = group.rounds.length % ids.length;
  const order = [...ids.slice(shift), ...ids.slice(0, shift)];
  const active: GroupRound = {
    id: `r${group.rounds.length + 1}`,
    activityId: launch.activityId,
    gameId: launch.gameId,
    title: launch.title ?? null,
    seed: Math.floor(Number.isFinite(launch.seed) ? launch.seed : 0) >>> 0,
    difficulty: launch.difficulty === 2 || launch.difficulty === 3 ? launch.difficulty : 1,
    order,
    results: [],
  };
  return { ...group, active };
}

export interface GroupTurn {
  readonly player: GroupPlayer;
  /** 1-based. */
  readonly number: number;
  readonly total: number;
  readonly gameId: MiniGameId;
  readonly difficulty: 0 | 1 | 2 | 3;
  readonly kidRound: boolean;
}

export function currentTurn(group: LineGroup | null): GroupTurn | null {
  const round = group?.active;
  if (!group || !round) return null;
  const index = round.results.length;
  if (index >= round.order.length) return null;
  const player = group.players.find(item => item.id === round.order[index]);
  if (!player) return null;
  const game = turnGame(round, player.kid);
  return { player, number: index + 1, total: round.order.length, ...game };
}

function closeRound(group: LineGroup, round: GroupRound): LineGroup {
  const played = round.results.some(result => !result.skipped);
  const rounds = played ? [...group.rounds, round].slice(-MAX_GROUP_ROUNDS) : group.rounds;
  return { ...group, rounds, active: null };
}

function addResult(group: LineGroup, result: Omit<GroupTurnResult, 'playerId' | 'gameId' | 'kidRound'>): LineGroup {
  const turn = currentTurn(group);
  const round = group.active;
  if (!turn || !round) return group;
  const stars = Number.isFinite(result.stars) ? Math.max(0, Math.min(3, Math.floor(result.stars))) : 0;
  const score = result.score != null && Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : null;
  const next: GroupRound = {
    ...round,
    results: [...round.results, { playerId: turn.player.id, stars: result.skipped ? 0 : stars,
      score: result.skipped ? null : score, gameId: turn.gameId, kidRound: turn.kidRound, skipped: result.skipped }],
  };
  return next.results.length >= next.order.length ? closeRound(group, next) : { ...group, active: next };
}

/** The current player finished (any finish: a 0-star close is still their turn). */
export function recordGroupTurn(group: LineGroup, stars: number, score?: number | null): LineGroup {
  return addResult(group, { stars, score: score ?? null, skipped: false });
}

/** The current player stepped away. The round goes on without them. */
export function skipGroupTurn(group: LineGroup): LineGroup {
  return addResult(group, { stars: 0, score: null, skipped: true });
}

/** End the round now (the line moved up, or the crew wants a different game). */
export function endGroupRound(group: LineGroup): LineGroup {
  return group.active ? closeRound(group, group.active) : group;
}

export interface PodiumEntry {
  readonly player: GroupPlayer;
  readonly stars: number;
  readonly score: number | null;
  readonly place: number;
  readonly skipped: boolean;
  readonly kidRound: boolean;
}

/** Round podium: stars first (fair across kid and grown-up rounds), then score on the same game. */
export function roundPodium(group: LineGroup, round: GroupRound): PodiumEntry[] {
  const rows = round.results.map(result => ({
    player: group.players.find(player => player.id === result.playerId),
    result,
  })).filter((row): row is { player: GroupPlayer; result: GroupTurnResult } => row.player != null);
  const sameGame = new Set(rows.filter(row => !row.result.skipped).map(row => row.result.gameId)).size <= 1;
  const rank = (row: { result: GroupTurnResult }) =>
    row.result.skipped ? -1 : row.result.stars * 1_000_000 + (sameGame ? Math.min(999_999, row.result.score ?? 0) : 0);
  const sorted = [...rows].sort((a, b) => rank(b) - rank(a));
  return sorted.map((row, index) => {
    const firstEqual = sorted.findIndex(other => rank(other) === rank(row));
    return { player: row.player, stars: row.result.stars, score: row.result.score,
      place: row.result.skipped ? sorted.length : (firstEqual >= 0 ? firstEqual : index) + 1,
      skipped: row.result.skipped, kidRound: row.result.kidRound };
  });
}

export function lastRound(group: LineGroup | null): GroupRound | null {
  return group?.rounds.length ? group.rounds[group.rounds.length - 1] : null;
}

export interface Standing {
  readonly player: GroupPlayer;
  readonly stars: number;
  readonly turns: number;
  readonly roundWins: number;
  readonly threeStarTurns: number;
  readonly place: number;
  readonly award: string;
}

/** Whole-wait standings: total stars, then round wins. Skipped turns never count against anyone. */
export function groupStandings(group: LineGroup): Standing[] {
  const totals = group.players.map(player => {
    const results = group.rounds.flatMap(round => round.results)
      .filter(result => result.playerId === player.id && !result.skipped);
    const roundWins = group.rounds.filter(round => {
      const podium = roundPodium(group, round);
      return podium.some(entry => entry.player.id === player.id && entry.place === 1 && !entry.skipped) &&
        podium.filter(entry => !entry.skipped).length > 1;
    }).length;
    const byGame = new Map<MiniGameId, number>();
    for (const result of results) byGame.set(result.gameId, (byGame.get(result.gameId) ?? 0) + result.stars);
    const bestGame = [...byGame].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      player,
      stars: results.reduce((sum, result) => sum + result.stars, 0),
      turns: results.length,
      roundWins,
      threeStarTurns: results.filter(result => result.stars === 3).length,
      award: bestGame ? GAME_AWARDS[bestGame] : 'Line Cheerleader',
    };
  });
  const key = (row: { stars: number; roundWins: number }) => row.stars * 1000 + row.roundWins;
  const sorted = [...totals].sort((a, b) => key(b) - key(a));
  return sorted.map(row => {
    const place = sorted.findIndex(other => key(other) === key(row)) + 1;
    return { ...row, place, award: place === 1 && row.turns > 0 ? 'Line Champ' : row.award };
  });
}

export interface GroupRecap {
  readonly headline: string;
  readonly champions: readonly GroupPlayer[];
  readonly standings: readonly Standing[];
  readonly roundsPlayed: number;
  readonly turnsPlayed: number;
}

export function groupRecap(group: LineGroup): GroupRecap | null {
  if (!isPassAndPlay(group) || group.rounds.length === 0) return null;
  const standings = groupStandings(group);
  const champions = standings.filter(row => row.place === 1 && row.turns > 0).map(row => row.player);
  const names = champions.map(player => player.name);
  const headline = champions.length === 0 ? 'Crew wait complete'
    : champions.length === 1 ? `${names[0]} is the Line Champ`
      : champions.length === group.players.length ? 'A perfect tie. Everyone shares the crown'
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} share the crown`;
  return {
    headline,
    champions,
    standings,
    roundsPlayed: group.rounds.length,
    turnsPlayed: group.rounds.reduce((sum, round) => sum + round.results.filter(result => !result.skipped).length, 0),
  };
}

/** Real wait vs the sign, in whole minutes. Posted is shown only when it came from the board. */
export function waitLine(realMinutes: number, postedMinutes: number | null): string {
  const real = Math.max(1, Math.round(Number.isFinite(realMinutes) ? realMinutes : 0));
  if (postedMinutes == null || !Number.isFinite(postedMinutes) || postedMinutes <= 0) return `Real wait ${real} min`;
  const posted = Math.round(postedMinutes);
  return `Sign said ${posted}. Real wait ${real} min.`;
}

/** The same crew for the next ride: names and kid flags, no results. */
export function crewForNextRide(group: LineGroup): LineGroup {
  return { version: 1, kind: group.kind, players: group.players.map(player => ({ ...player })), rounds: [], active: null };
}

function isPlayer(value: unknown): value is GroupPlayer {
  const item = value as GroupPlayer;
  return Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string' &&
    item.name.length > 0 && item.name.length <= MAX_NAME_LENGTH * 4 && typeof item.kid === 'boolean';
}

function isRound(value: unknown, ids: ReadonlySet<string>): value is GroupRound {
  const item = value as GroupRound;
  return Boolean(item) && typeof item.id === 'string' && typeof item.activityId === 'string' &&
    GAME_IDS.includes(item.gameId) && Number.isFinite(item.seed) && [1, 2, 3].includes(item.difficulty) &&
    Array.isArray(item.order) && item.order.every(id => ids.has(id)) &&
    Array.isArray(item.results) && item.results.length <= item.order.length &&
    item.results.every(result => result && ids.has(result.playerId) && Number.isInteger(result.stars) &&
      result.stars >= 0 && result.stars <= 3 && GAME_IDS.includes(result.gameId) &&
      typeof result.skipped === 'boolean' && typeof result.kidRound === 'boolean');
}

/** Validate persisted data; anything odd is dropped rather than trusted. */
export function isLineGroup(value: unknown): value is LineGroup {
  const item = value as LineGroup;
  if (!item || item.version !== 1 || !KINDS.includes(item.kind) || !Array.isArray(item.players)) return false;
  if (item.players.length < 1 || item.players.length > MAX_GROUP_PLAYERS || !item.players.every(isPlayer)) return false;
  const ids = new Set(item.players.map(player => player.id));
  if (ids.size !== item.players.length) return false;
  return Array.isArray(item.rounds) && item.rounds.length <= MAX_GROUP_ROUNDS &&
    item.rounds.every(round => isRound(round, ids)) &&
    (item.active === null || isRound(item.active, ids));
}
