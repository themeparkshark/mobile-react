/**
 * sources.ts — the two implementations of the TriviaSource seam.
 *
 *   createTaskTriviaSource   → server-validated (existing endpoints, unchanged).
 *   createLinePlayTriviaSource → bundled offline pool from content.ts.
 *
 * Nothing else in the game imports the endpoints or the content service — they
 * import a TriviaSource. Swapping modes is swapping which factory you call.
 */

import startTrivia from '../../api/endpoints/tasks/trivia/start';
import answerTrivia from '../../api/endpoints/tasks/trivia/answer';
import { fetchRideTrivia } from '../../services/lineplay/content';
import {
  DEFAULT_QUESTION_SECONDS,
  LIFELINE_ENABLED,
  LINEPLAY_ROUND_QUESTIONS,
} from './config';
import type {
  FiftyFiftyResult,
  TriviaCard,
  TriviaGrade,
  TriviaSource,
} from './types';

// ---------------------------------------------------------------------------
// TASK MODE — server-authoritative
// ---------------------------------------------------------------------------

export interface TaskTriviaOptions {
  taskId: number;
  /** VIP flags forwarded verbatim to the answer endpoint (reward multipliers). */
  doubleXp?: boolean;
  doubleCoins?: boolean;
  /** Called if the server says trivia is unavailable / must be skipped. */
  onUnavailable?: (message?: string) => void;
}

/**
 * Wraps POST /tasks/{id}/trivia/start + POST /trivia/answer.
 *
 * The server issues ONE question per session_token and validates the answer as
 * TEXT (not index). We map the chosen index → its text before posting, and map
 * the returned `correct_answer` text back → an index for the reveal. The client
 * never grades; it only renders what the server decided.
 */
export function createTaskTriviaSource(opts: TaskTriviaOptions): TriviaSource {
  let currentCard: TriviaCard | null = null;
  let sessionToken: string | null = null;
  let served = false;
  let lastServerMultiplier: number | undefined;

  return {
    mode: 'task',
    // Task trivia is single-question per session.
    totalQuestions: 1,

    async next(): Promise<TriviaCard | null> {
      if (served) return null; // one question per session
      served = true;
      const res = await startTrivia(opts.taskId);
      if (res.skip_trivia || !res.trivia) {
        opts.onUnavailable?.(res.message);
        return null;
      }
      sessionToken = res.trivia.session_token;
      currentCard = {
        id: `${res.trivia.session_token}`,
        question: res.trivia.question,
        choices: res.trivia.answers,
        difficulty: res.trivia.difficulty,
        timeLimitSeconds: res.trivia.time_limit_seconds || DEFAULT_QUESTION_SECONDS,
      };
      return currentCard;
    },

    async grade(choiceIndex: number): Promise<TriviaGrade> {
      if (!currentCard || sessionToken == null) {
        return { correct: false, correctIndex: -1 };
      }
      const chosenText = currentCard.choices[choiceIndex] ?? '';
      const res = await answerTrivia(
        sessionToken,
        chosenText,
        opts.doubleXp ?? false,
        opts.doubleCoins ?? false,
      );
      lastServerMultiplier = res.multiplier;
      // Map the server's correct_answer TEXT back to a tile index for the reveal.
      const correctIndex = currentCard.choices.findIndex(
        (c) => c === res.correct_answer,
      );
      return { correct: res.correct, correctIndex };
    },

    async fiftyFifty(): Promise<FiftyFiftyResult> {
      // No server lifeline endpoint exists (see config.ts). NEVER guess client
      // side against a server question — that would leak/fabricate the key.
      if (!LIFELINE_ENABLED) return { removed: [] };
      // TODO(server): call the lifeline endpoint and return its removed indices.
      return { removed: [] };
    },

    dispose(): void {
      currentCard = null;
      sessionToken = null;
    },

    // Expose the last server multiplier for meta (read via the getter below).
    get serverMultiplier(): number | undefined {
      return lastServerMultiplier;
    },
  } as TriviaSource & { serverMultiplier?: number };
}

// ---------------------------------------------------------------------------
// LINEPLAY MODE — bundled offline pool (free, airplane-mode safe)
// ---------------------------------------------------------------------------

export interface LinePlayTriviaOptions {
  rideId?: number;
  parkId?: number;
  /** Deterministic seed so the round is stable/replayable. */
  seed: number;
  /** How many questions this round serves. Defaults to LINEPLAY_ROUND_QUESTIONS. */
  questionCount?: number;
  /** Per-question seconds override. */
  timeLimitSeconds?: number;
}

/**
 * Serves N bundled questions via fetchRideTrivia (ride → park → general
 * fallback). These ship with the app and carry a known correctIndex, so grading
 * and 50/50 are computed locally — correct and free (quality bar #5 offline).
 */
export function createLinePlayTriviaSource(
  opts: LinePlayTriviaOptions,
): TriviaSource {
  const count = opts.questionCount ?? LINEPLAY_ROUND_QUESTIONS;
  const secs = opts.timeLimitSeconds ?? DEFAULT_QUESTION_SECONDS;
  let index = 0;
  // The known correct index for the card currently in play (local key).
  let currentCorrect = -1;
  let currentChoiceCount = 0;

  return {
    mode: 'lineplay',
    totalQuestions: count,

    async next(): Promise<TriviaCard | null> {
      if (index >= count) return null;
      // Vary selection per slot with the round seed; content.ts is deterministic.
      const q = await fetchRideTrivia(opts.rideId, opts.parkId, opts.seed + index);
      currentCorrect = q.correctIndex;
      currentChoiceCount = q.choices.length;
      const card: TriviaCard = {
        id: `${q.id}-${index}`,
        question: q.question,
        choices: q.choices,
        difficulty: q.difficulty,
        timeLimitSeconds: secs,
      };
      index += 1;
      return card;
    },

    async grade(choiceIndex: number): Promise<TriviaGrade> {
      return {
        correct: choiceIndex === currentCorrect,
        correctIndex: currentCorrect,
      };
    },

    async fiftyFifty(): Promise<FiftyFiftyResult> {
      // We own the key here → a real 50/50: keep the correct tile + one random
      // wrong tile; remove the other wrongs (cap the removals at 2).
      const wrong: number[] = [];
      for (let i = 0; i < currentChoiceCount; i++) {
        if (i !== currentCorrect) wrong.push(i);
      }
      // Deterministic-ish shuffle via the seed so replays match.
      shuffleWithSeed(wrong, opts.seed + index);
      const removed = wrong.slice(0, Math.max(0, wrong.length - 1)).slice(0, 2);
      return { removed };
    },

    dispose(): void {
      currentCorrect = -1;
      currentChoiceCount = 0;
    },
  };
}

/** Small deterministic Fisher-Yates so lifeline removals are replayable. */
function shuffleWithSeed(arr: number[], seed: number): void {
  let s = Math.abs(Math.floor(seed)) + 1;
  const rand = () => {
    // xorshift-ish LCG, good enough for tile shuffling.
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}
