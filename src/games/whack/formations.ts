/**
 * formations.ts: the 8 v4 Bonk Rush formations (design 6.10: 14 cut to 8, the
 * ones that read at arm's length) plus the 8 dihedral symmetries of the board.
 *
 * Holes are numbered row-major: 0 1 2 / 3 4 5 / 6 7 8 (row 0 is the back row).
 * Each step is [hole, offset in 8th notes, kind override (-1 = Finn-class)].
 * Twin pairs are placed by the timeline's trickster slots, not as a formation.
 */

export type FormationStep = [hole: number, eighths: number, kind: number];

export interface Formation {
  id: number;
  name: string;
  steps: FormationStep[];
}

export const FORMATIONS: Formation[] = [
  { id: 0, name: 'Row Sweep', steps: [[3, 0, -1], [4, 2, -1], [5, 4, -1]] },
  { id: 1, name: 'Row Sweep Back', steps: [[5, 0, -1], [4, 2, -1], [3, 4, -1]] },
  { id: 2, name: 'Column Drop', steps: [[1, 0, -1], [4, 2, -1], [7, 4, -1]] },
  { id: 3, name: 'Diagonal', steps: [[0, 0, -1], [4, 2, -1], [8, 4, -1]] },
  { id: 4, name: 'Corners', steps: [[0, 0, -1], [2, 2, -1], [8, 4, -1], [6, 6, -1]] },
  { id: 5, name: 'Center Cross', steps: [[1, 0, -1], [5, 2, -1], [7, 4, -1], [3, 6, -1], [4, 9, -1]] },
  { id: 6, name: 'Zigzag', steps: [[0, 0, -1], [4, 2, -1], [2, 4, -1], [5, 6, -1], [7, 8, -1]] },
  { id: 7, name: 'Front To Back', steps: [[7, 0, -1], [4, 2, -1], [1, 4, -1]] },
];

/** Lifetime 4: the basic set. Ride rounds use Row Sweep, Column Drop and Corners. */
export const BASIC_FORMATIONS = [0, 1, 2];
export const RIDE_FORMATIONS = [0, 2, 4];

/** Map hole through dihedral symmetry `x` (0 = identity, 1-3 rotations, 4-7 reflections). */
export function xformHole(hole: number, x: number): number {
  'worklet';
  const r = Math.floor(hole / 3);
  const c = hole % 3;
  let nr = r;
  let nc = c;
  switch (x & 7) {
    case 1: nr = c; nc = 2 - r; break; // rot 90
    case 2: nr = 2 - r; nc = 2 - c; break; // rot 180
    case 3: nr = 2 - c; nc = r; break; // rot 270
    case 4: nr = r; nc = 2 - c; break; // mirror left-right
    case 5: nr = 2 - r; nc = c; break; // mirror front-back
    case 6: nr = c; nc = r; break; // transpose
    case 7: nr = 2 - c; nc = 2 - r; break; // anti-transpose
    default: break;
  }
  return nr * 3 + nc;
}

/** Inverse of xformHole for the same x. */
export function xformInverse(x: number): number {
  const m = x & 7;
  if (m === 1) return 3;
  if (m === 3) return 1;
  return m;
}

/** Maps a ghost's hole into my board: mine o theirs^-1. */
export function mapGhostHole(hole: number, theirs: number, mine: number): number {
  return xformHole(xformHole(hole, xformInverse(theirs)), mine);
}
