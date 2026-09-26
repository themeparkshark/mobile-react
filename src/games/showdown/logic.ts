import type { TriviaQuestion } from '../../services/lineplay/content';

export const SHOWDOWN_SECONDS = 12;
export const SHOWDOWN_ROUNDS = 3;

/** Consecutive rematches walk through a chapter's deck in groups of three. */
export function showdownReplaySeed(baseSeed: number, playsSoFar: number): number {
  return Math.floor(baseSeed) + Math.max(0, Math.floor(playsSoFar)) * SHOWDOWN_ROUNDS;
}

/** A repeatable rival; the same queue round never changes its outcome mid-play. */
export function rivalAnswer(question: TriviaQuestion, seed: number, round: number): number {
  const mix = Math.imul((seed + 1) ^ Math.imul(round + 7, 2654435761), 1597334677) >>> 0;
  const accuracy = question.difficulty === 'easy' ? 72 : question.difficulty === 'medium' ? 58 : 42;
  if (mix % 100 < accuracy) return question.correctIndex;
  const wrong = Array.from({ length: question.choices.length }, (_, index) => index)
    .filter(index => index !== question.correctIndex);
  return wrong[mix % wrong.length] ?? question.correctIndex;
}

export function showdownStars(playerScore: number, rivalScore: number, totalRounds: number): number {
  if (playerScore < rivalScore) return 0;
  if (playerScore === rivalScore) return playerScore === totalRounds ? 3 : 1;
  return playerScore === totalRounds ? 3 : 2;
}
