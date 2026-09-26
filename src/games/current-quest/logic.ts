/** A small, replayable route puzzle that works without network or GPS. */
export interface CurrentBoard {
  readonly size: number;
  readonly start: number;
  readonly goal: number;
  readonly pearls: readonly number[];
  readonly rocks: readonly number[];
  /** The generation witness; every tile on this route remains passable. */
  readonly guaranteedRoute: readonly number[];
  readonly routeMoves: number;
}

export interface CurrentProgress {
  readonly path: readonly number[];
  /** Every accepted tap, including steps back, for server route replay. */
  readonly history: readonly number[];
  readonly collected: readonly number[];
  readonly moves: number;
}

export type MoveResult = 'invalid' | 'blocked' | 'backtrack' | 'moved' | 'pearl' | 'goal-locked' | 'complete';

function nextRandom(value: number): number {
  return (Math.imul(value, 1664525) + 1013904223) >>> 0;
}

function shuffled<T>(values: T[], seed: number): T[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = nextRandom(state);
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function makeCurrentBoard(seed: number, stage: number): CurrentBoard {
  const level = Math.max(0, Math.min(2, Math.floor(stage)));
  const size = level === 0 ? 4 : 5;
  const moves = shuffled([
    ...Array.from({ length: size - 1 }, () => 'right' as const),
    ...Array.from({ length: size - 1 }, () => 'down' as const),
  ], (seed + level * 17) >>> 0);
  const route = [0];
  let position = 0;
  for (const move of moves) {
    position += move === 'right' ? 1 : size;
    route.push(position);
  }
  const pearls = shuffled(route.slice(1, -1), (seed ^ (level + 19) * 7919) >>> 0)
    .slice(0, 2 + level).sort((a, b) => a - b);
  const routeCells = new Set(route);
  const rocks = shuffled(
    Array.from({ length: size * size }, (_, index) => index).filter(index => !routeCells.has(index)),
    (seed + 997 * (level + 1)) >>> 0,
  ).slice(0, 2 + level * 2).sort((a, b) => a - b);
  return { size, start: 0, goal: size * size - 1, pearls, rocks,
    guaranteedRoute: route, routeMoves: route.length - 1 };
}

export function beginCurrentBoard(board: CurrentBoard): CurrentProgress {
  return { path: [board.start], history: [board.start], collected: [], moves: 0 };
}

export function moveCurrent(board: CurrentBoard, progress: CurrentProgress, target: number):
  { readonly progress: CurrentProgress; readonly result: MoveResult } {
  if (!Number.isInteger(target) || target < 0 || target >= board.size * board.size) {
    return { progress, result: 'invalid' };
  }
  const current = progress.path.at(-1) ?? board.start;
  const rowDistance = Math.abs(Math.floor(target / board.size) - Math.floor(current / board.size));
  const colDistance = Math.abs(target % board.size - current % board.size);
  if (rowDistance + colDistance !== 1) return { progress, result: 'invalid' };
  if (board.rocks.includes(target)) return { progress, result: 'blocked' };
  if (progress.path.at(-2) === target) {
    const path = progress.path.slice(0, -1);
    return { progress: { path, history: [...progress.history, target],
      collected: progress.collected.filter(pearl => path.includes(pearl)),
      moves: progress.moves + 1 }, result: 'backtrack' };
  }
  if (progress.path.includes(target)) return { progress, result: 'invalid' };
  if (target === board.goal && progress.collected.length < board.pearls.length) {
    return { progress, result: 'goal-locked' };
  }
  const collected = board.pearls.includes(target) ? [...progress.collected, target] : progress.collected;
  const next = { path: [...progress.path, target], history: [...progress.history, target],
    collected, moves: progress.moves + 1 };
  return { progress: next, result: target === board.goal ? 'complete' :
    board.pearls.includes(target) ? 'pearl' : 'moved' };
}

export function scoreCurrentBoard(board: CurrentBoard, progress: CurrentProgress): number {
  if (progress.path.at(-1) !== board.goal || progress.collected.length !== board.pearls.length) return 0;
  return Math.max(100, 220 + board.pearls.length * 35 -
    Math.max(0, progress.moves - board.routeMoves) * 8);
}

export function currentStars(boards: readonly CurrentBoard[], rounds: readonly CurrentProgress[]): number {
  if (boards.length !== 3 || rounds.length !== 3 ||
      boards.some((board, index) => scoreCurrentBoard(board, rounds[index]) === 0)) return 0;
  const detours = boards.reduce((total, board, index) =>
    total + Math.max(0, rounds[index].moves - board.routeMoves), 0);
  return detours <= 4 ? 3 : detours <= 12 ? 2 : 1;
}
