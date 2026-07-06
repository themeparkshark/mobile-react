/**
 * Trivia+ tunables + the lifeline feature flag.
 *
 * SERVER LIFELINE VERDICT
 * -----------------------
 * The task-mode server contract (src/api/endpoints/tasks/trivia/{start,answer,
 * skip}.ts + the response models) exposes NO 50/50 lifeline:
 *   - start.ts  → returns { question, answers[], difficulty, time_limit_seconds }
 *   - answer.ts → posts { session_token, answer, double_xp, double_coins }
 *                 (double_xp / double_coins are VIP REWARD multipliers, not a
 *                 lifeline) and returns { correct, correct_answer, ... }.
 * There is no endpoint that returns which two wrong answers to eliminate, and
 * grading in task mode is server-authoritative — the client never holds the key.
 *
 * Therefore, per spec, the 50/50 button ships behind LIFELINE_ENABLED=false in
 * task mode. We NEVER compute a client-side 50/50 against a server question
 * (that would leak/guess the answer key). LinePlay mode owns its bundled answer
 * key, so its 50/50 is real, free, and enabled independently.
 *
 * TODO(server): add a lifeline endpoint (e.g. POST /trivia/lifeline returning
 * { removed_answers: string[] }) and flip LIFELINE_ENABLED to true; wire it in
 * createTaskTriviaSource.fiftyFifty().
 */

/** Task-mode 50/50 lifeline. OFF until a server lifeline endpoint exists. */
export const LIFELINE_ENABLED = false as const;

/** Scoring: base points per correct answer before the streak bonus. */
export const BASE_POINTS = 100;

/** Streak bonus added per point of current streak (score = correct*base + Σbonus). */
export const STREAK_BONUS = 25;

/** Streak at which the fire meter hits fever (spec: 5-streak). */
export const FEVER_STREAK = 5;

/** How long (ms) the reveal lingers before advancing to the next question. */
export const REVEAL_MS = 950;

/** Last-N seconds of a question where the ring turns urgent + ticks. */
export const URGENCY_SECONDS = 3;

/** Default per-question time when a source doesn't specify one. */
export const DEFAULT_QUESTION_SECONDS = 15;

/** How many bundled questions a LinePlay round serves. */
export const LINEPLAY_ROUND_QUESTIONS = 5;

/** Stars from correct-ratio: [3★ min ratio, 2★ min ratio]. 1★ = any correct. */
export const STAR_RATIOS = { three: 0.9, two: 0.6 } as const;
