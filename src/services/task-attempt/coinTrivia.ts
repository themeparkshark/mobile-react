/**
 * Beat the Buzzer on a ride coin plays the server's dealt round (fix round w3 T196, T197, T199; be-core's
 * CoinTriviaDealer): the attempt carries three fact-checked questions from the bank, this ride first, then
 * nearby rides and this park, never another park while this one has unseen questions, and the kids deck
 * for Family with kids. The app plays exactly those, in order. Only an older server (no attempt.trivia)
 * falls back to the bundled pool. Pure, tested in tools/tests/fix-w3-wire.test.cjs.
 */
import type { ServerTriviaQuestion } from '../../api/endpoints/lineplay/trivia';
import type { GroupKind, LineGroup } from '../lineplay/lineGroup';
import { toTriviaQuestions } from '../lineplay/triviaDeck';
import type { TriviaQuestion } from '../lineplay/content';

/** The questions a paid trivia round needs (engine RIDE_QUESTIONS). */
export const COIN_TRIVIA_QUESTIONS = 3;

export interface AttemptTrivia {
  readonly source?: string;
  readonly kids?: boolean;
  readonly questions?: readonly ServerTriviaQuestion[] | null;
}

/** The dealt round as the game's pool plus its order, or null when the server dealt none (or too few). */
export function dealtTriviaRound(trivia: AttemptTrivia | null | undefined): { pool: TriviaQuestion[]; ids: string[] } | null {
  if (!trivia || !Array.isArray(trivia.questions)) return null;
  const pool = toTriviaQuestions({ questions: trivia.questions as ServerTriviaQuestion[] });
  if (pool.length < COIN_TRIVIA_QUESTIONS) return null;
  return { pool, ids: pool.slice(0, COIN_TRIVIA_QUESTIONS).map(q => q.id) };
}

/**
 * Who is playing, for the server's deck (POST /me/task-attempts crew): Family with kids gets the kids deck;
 * a family crew with no kids marked says nothing (the grown-up deck), any other crew says its kind.
 */
export function triviaCrewFor(group: Pick<LineGroup, 'kind' | 'players'> | null | undefined, kids: boolean): GroupKind | null {
  if (!group) return null;
  if (group.kind === 'family') return kids ? 'family' : null;
  return group.kind;
}
