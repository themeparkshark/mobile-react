/**
 * Line story picture puzzles (fix pass w4, T075). Two ten-second games a seven-year-old solves with taps on
 * pictures and zero reading, dealt from one picture deck (the ride's land deck: space pictures in
 * Tomorrowland, jungle pictures in Adventureland). Pure and seeded, so the same page keeps its puzzle across
 * re-renders and a replay deals a new one.
 *
 *  - Picture row: a row of pictures in a pattern (A B A B A ?) and three picture choices for the gap.
 *  - Twin hunt: one picture on top, six below; tap its twin. Three quick rounds.
 *
 * Symbols are indexes into the deck (0 to size - 1). No timer, no countdown: a wrong tap just wobbles.
 */

export interface PatternRound {
  /** The visible row; the last slot is the gap. */
  readonly row: readonly number[];
  readonly answer: number;
  /** Three picture choices, the answer among them. */
  readonly choices: readonly number[];
}

export interface TwinRound {
  readonly target: number;
  /** Six pictures, the target exactly once. */
  readonly grid: readonly number[];
}

export type PicturePuzzleKind = 'pattern' | 'twin';

export const PATTERN_ROUNDS = 2;
export const TWIN_ROUNDS = 3;
export const TWIN_GRID = 6;

/** A small seeded generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = (Math.floor(Math.abs(seed)) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Distinct symbols from the deck. */
function pickDistinct(count: number, size: number, rand: () => number): number[] {
  return shuffled(Array.from({ length: size }, (_, i) => i), rand).slice(0, count);
}

/**
 * Patterns a young child knows, easy first. Letters are picture slots; the last letter is the gap.
 * Round 1 is always a two-picture beat; round 2 grows to a three-picture beat or a double.
 */
const EASY_PATTERNS = ['ABABAB', 'AABAAB'] as const;
const HARDER_PATTERNS = ['ABCABC', 'ABBABB', 'AABBAA'] as const;

export function patternRound(seed: number, round: number, deckSize: number): PatternRound {
  if (deckSize < 4) throw new Error('A picture row needs at least four pictures');
  const rand = seededRandom(seed * 31 + round * 7919 + 17);
  const list = round === 0 ? EASY_PATTERNS : HARDER_PATTERNS;
  const pattern = list[Math.floor(rand() * list.length)];
  const symbols = pickDistinct(4, deckSize, rand);
  const letter = (ch: string) => symbols[ch.charCodeAt(0) - 65];
  const full = pattern.split('').map(letter);
  const answer = full[full.length - 1];
  // One choice from inside the row (a guess that ignores the beat is wrong), one from outside it.
  const inRow = [...new Set(full.slice(0, -1))].filter(symbol => symbol !== answer);
  const outside = symbols[3];
  const choices = shuffled([answer, inRow[Math.floor(rand() * inRow.length)], outside], rand);
  return { row: full.slice(0, -1), answer, choices };
}

export function twinRound(seed: number, round: number, deckSize: number): TwinRound {
  if (deckSize < TWIN_GRID) throw new Error('A twin hunt needs at least six pictures');
  const rand = seededRandom(seed * 131 + round * 104729 + 3);
  const grid = pickDistinct(TWIN_GRID, deckSize, rand);
  let target = grid[Math.floor(rand() * grid.length)];
  // Each round hunts a new picture: never the one the last round just found.
  const previous = round > 0 ? twinRound(seed, round - 1, deckSize).target : null;
  if (target === previous) target = grid[(grid.indexOf(target) + 1) % grid.length];
  return { target, grid };
}

/** Is this tap the right picture? */
export function patternTapRight(round: PatternRound, symbol: number): boolean {
  return symbol === round.answer;
}

export function twinTapRight(round: TwinRound, symbol: number): boolean {
  return symbol === round.target;
}

/** The ten-second promise: how many rounds a kind plays. */
export function puzzleRounds(kind: PicturePuzzleKind): number {
  return kind === 'pattern' ? PATTERN_ROUNDS : TWIN_ROUNDS;
}

/**
 * Which picture puzzle a story page plays (T075), or null for a reading page. Clue 1 is the picture row,
 * clue 2 the twin hunt: at every ride without an authored chapter (its chapter names a puzzle deck), and at
 * every ride while Picture games is on. A space ride's navigation board is already a picture game and
 * stays; haunt lines keep their own deck.
 */
export function storyPuzzleFor(
  chapter: { readonly id: string; readonly puzzleDeckId?: string; readonly navigationPanel?: boolean;
    readonly finale: { readonly memoryDeckId: string } },
  item: { readonly kind: string; readonly id: string }, pictureOnly: boolean,
): { kind: PicturePuzzleKind; deckId: string } | null {
  if (chapter.id.startsWith('fright-')) return null;
  if (chapter.puzzleDeckId == null && !pictureOnly) return null;
  const deckId = chapter.puzzleDeckId ?? chapter.finale.memoryDeckId;
  if (item.kind === 'trivia' && item.id === `${chapter.id}-trivia` && !chapter.navigationPanel) return { kind: 'pattern', deckId };
  if (item.kind === 'lore' && item.id === `${chapter.id}-field-note`) return { kind: 'twin', deckId };
  return null;
}

/** A page's puzzle deal: its playlist seed mixed with the chapter, so two rides never open on the same row. */
export function puzzleSeed(chapterId: string, seed: number): number {
  let hash = 7;
  for (const char of chapterId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return (hash + Math.max(0, Math.floor(seed)) * 2654435761) >>> 0;
}

/**
 * The label over a question's answer line (T075). FAN FACT only for a real, checked ride or park fact (a
 * deck row or a sourced chapter fact); a story riddle's explanation says how it works instead.
 */
export function triviaFactKicker(q: { readonly bank?: boolean; readonly source?: string; readonly correctIndex: number },
  picked: number | null): string {
  const real = q.bank === true || Boolean(q.source?.trim());
  if (picked == null) return 'THE ANSWER';
  if (!real) return picked === q.correctIndex ? 'CORRECT · HOW IT WORKS' : 'HOW IT WORKS';
  return picked === q.correctIndex ? 'CORRECT · FAN FACT' : 'FAN FACT';
}
