/**
 * Friend Challenge links (design v7.1 0.A.11). A finished run offers "Challenge a friend", which
 * opens the system share sheet with an app deep link; the app never sends anything itself. The
 * link names the exact boards (library id + transform), so the friend plays the same voyages
 * whatever their own progress, plus the sender's shells and strokes to beat.
 */
import { transformBoard, type Board } from './rules';
import { boardById } from './library';

export interface ChallengeLink {
  readonly seed: number;
  /** Board refs `id~tf`, in voyage order. */
  readonly boards: readonly string[];
  readonly shells: number;
  readonly strokes: number;
  readonly name: string;
}

const PREFIX = 'themeparkshark://current-quest/challenge';

export function challengeUrl(c: Omit<ChallengeLink, 'name'> & { name?: string }): string {
  const q = [`seed=${c.seed >>> 0}`, `b=${c.boards.map(encodeURIComponent).join(',')}`, `s=${c.shells | 0}`, `k=${c.strokes | 0}`];
  if (c.name) q.push(`n=${encodeURIComponent(c.name.slice(0, 20))}`);
  return `${PREFIX}?${q.join('&')}`;
}

/** Parses a challenge link; null for anything else or anything malformed. */
export function parseChallengeUrl(url: string | null | undefined): ChallengeLink | null {
  if (!url || !url.toLowerCase().startsWith(PREFIX)) return null;
  const qs = url.slice(url.indexOf('?') + 1);
  const p: Record<string, string> = {};
  for (const part of qs.split('&')) {
    const at = part.indexOf('=');
    if (at > 0) p[part.slice(0, at)] = decodeURIComponent(part.slice(at + 1));
  }
  const seed = Number(p.seed);
  const shells = Number(p.s);
  const strokes = Number(p.k);
  const boards = (p.b ?? '').split(',').filter(Boolean);
  if (!Number.isFinite(seed) || !Number.isFinite(shells) || !Number.isFinite(strokes) || boards.length < 1 || boards.length > 3) return null;
  if (shells < 0 || shells > 9 || strokes < 0 || strokes > 200) return null;
  if (!boards.every((r) => boardsOf([r]))) return null;
  // eslint-disable-next-line no-control-regex
  const name = (p.n ?? '').replace(/[\u0000-\u001f<>"`\\]/g, '').trim().slice(0, 20) || 'Your friend';
  return { seed: seed >>> 0, boards, shells, strokes, name };
}

/** The exact boards a link names (transform applied), or null if any is unknown. */
export function boardsOf(refs: readonly string[]): Board[] | null {
  const out: Board[] = [];
  for (const ref of refs) {
    const base = boardById(ref);
    if (!base) return null;
    const tf = Number(ref.split('~')[1] ?? 0) | 0;
    try {
      out.push(transformBoard(base, tf));
    } catch {
      return null;
    }
  }
  return out;
}
