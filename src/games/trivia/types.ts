/**
 * Trivia+ — the ONE typed interface both data modes hide behind.
 *
 * Trivia has two fundamentally different sources of truth, and the game field
 * must not care which one it's driving:
 *
 *   (a) TASK mode  — the existing server endpoints
 *       (src/api/endpoints/tasks/trivia/*). Answers are SERVER-VALIDATED: the
 *       client posts the chosen answer TEXT and the server returns whether it
 *       was correct and what the correct answer was. The client NEVER knows the
 *       correct index up front, so it cannot (and must not) grade locally.
 *
 *   (b) LINEPLAY mode — the bundled offline pool in
 *       src/services/lineplay/content.ts (fetchRideTrivia). These questions ship
 *       with the app, carry a known `correctIndex`, cost nothing, and work in
 *       airplane mode, so grading locally is correct and free.
 *
 * `TriviaSource` is the seam. A source hands the game one question at a time
 * (`next`) and grades a chosen tile (`grade`). The game presents; the source
 * decides truth. This keeps the play field identical across modes and keeps
 * server-authoritative grading server-authoritative (quality bar #6).
 */

/** A question as the play field consumes it — index-addressed tiles. */
export interface TriviaCard {
  /** Stable id for keying/animation (session token + n, or pool id). */
  readonly id: string;
  readonly question: string;
  /** 2-4 answer tiles. Index is the tile the player taps. */
  readonly choices: readonly string[];
  readonly difficulty: 'easy' | 'medium' | 'hard';
  /** Per-question countdown in seconds (task mode carries a server limit). */
  readonly timeLimitSeconds: number;
  /** Optional offline fan-fact shown after the answer has been graded. */
  readonly fact?: string;
  readonly source?: string;
}

/**
 * Result of grading one answered tile. `correctIndex` is ALWAYS resolved by the
 * source (server text→index mapping in task mode, known index in lineplay), so
 * the play field can flip the right tile gold without ever knowing truth early.
 */
export interface TriviaGrade {
  readonly correct: boolean;
  /** Index of the correct tile, for the reveal animation. -1 if unknown. */
  readonly correctIndex: number;
}

/** Which tiles a 50/50 lifeline removes (the two wrong ones). */
export interface FiftyFiftyResult {
  /** Indices to fade out. Empty if the lifeline is unavailable in this mode. */
  readonly removed: readonly number[];
}

/**
 * The data seam. Both modes implement this; the game field is mode-agnostic.
 *
 * Contract:
 *  - `next()` resolves the next card, or null when the round is over (task mode
 *    is single-question per session; lineplay is a finite playlist).
 *  - `grade(choiceIndex)` resolves truth for the card most recently returned by
 *    `next()`. In task mode this is an awaited network round-trip (server
 *    validates); in lineplay it's synchronous-fast (local compare).
 *  - `fiftyFifty()` returns which wrong tiles to remove, IF the mode supports a
 *    server-safe lifeline. Task mode returns { removed: [] } unless/until a
 *    server lifeline endpoint exists (see LIFELINE in config.ts). Lineplay owns
 *    the answer key so it can compute a real 50/50 locally.
 *  - `dispose()` releases anything held (no-op for pure-local sources).
 */
export interface TriviaSource {
  readonly mode: 'task' | 'lineplay';
  /** Total questions this source will serve, for progress UI (0 = unknown). */
  readonly totalQuestions: number;
  next(): Promise<TriviaCard | null>;
  grade(choiceIndex: number): Promise<TriviaGrade>;
  /** Compute a 50/50 for the current card. Only safe where the mode allows it. */
  fiftyFifty(): Promise<FiftyFiftyResult>;
  dispose(): void;
}

/** Metadata reported to GameShellV2 → server-authoritative reward path. */
export interface TriviaMeta extends Record<string, unknown> {
  readonly mode: 'task' | 'lineplay';
  readonly score: number;
  readonly correctCount: number;
  readonly totalAnswered: number;
  readonly maxCombo: number;
  /** Deterministic seed for telemetry/replay (quality bar #6). */
  readonly seed: number;
  /** Server multiplier from the last task-mode answer, when present. */
  readonly serverMultiplier?: number;
}
