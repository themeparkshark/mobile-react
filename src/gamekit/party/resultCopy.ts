/**
 * Results copy for Line Party (design rev 7, 8.4): losing teaches. Pure and
 * string-only so the wording is unit-tested (no emoji, no em dashes).
 */
import type { KeyMoment, SeatResult, StarHighlight } from '../net/partyTypes';
import { isGhostFinished, isNoContest } from '../net/partyTypes';

const n = (v: number) => v.toLocaleString('en-US');

/** The explain() sentence: "A lure cost you 410." */
export function keyMomentLine(m: KeyMoment | null | undefined): string | null {
  if (!m || m.kind === 'none' || m.cost <= 0) return null;
  switch (m.kind) {
    case 'lure': return `A lure cost you ${n(m.cost)}.`;
    case 'butterfingers': return `Tapping too fast cost you ${n(m.cost)}.`;
    case 'golden_escaped': return `A golden got away. It was worth ${n(m.cost)}.`;
    case 'shared_missed': return `You missed a Shared Golden. It was worth ${n(m.cost)}.`;
    case 'snatch_missed': return 'So close! You just missed a snatch.';
    case 'splashed': return `You got splashed: -${n(m.cost)}.`;
    default: return null;
  }
}

/**
 * My line under the results: margin to the place above plus the key moment.
 * Safety no-contests never sting (no margin), and 1st place gets none.
 */
export function lossLine(mine: SeatResult | undefined, results: SeatResult[]): string | null {
  // Safety hand-offs never show a margin (design 8.4): "Your ghost took this one" says it all.
  if (!mine || mine.placement === 1 || isNoContest(mine.verdict) || isGhostFinished(mine.verdict)) return null;
  const above = results.filter((r) => r.score > mine.score).sort((a, b) => a.score - b.score)[0];
  const margin = above ? above.score - mine.score : 0;
  const place = above?.placement === 1 ? '1st' : above?.placement === 2 ? '2nd' : above?.placement === 3 ? '3rd' : `${above?.placement ?? 1}th`;
  const head = above ? `Lost ${place} by ${n(margin)}.` : null;
  return [head, keyMomentLine(mine.key_moment)].filter(Boolean).join(' ') || null;
}

/** REMATCH is the big button when you lost 1st by under 10%. */
export function nearMiss(mine: SeatResult | undefined, results: SeatResult[]): boolean {
  if (!mine || mine.placement === 1 || isNoContest(mine.verdict) || isGhostFinished(mine.verdict)) return false;
  const top = results.find((r) => r.placement === 1);
  return !!top && top.score > 0 && (top.score - mine.score) * 10 < top.score;
}

export function starLabel(s: StarHighlight | null | undefined): string | null {
  if (!s) return null;
  switch (s.category) {
    case 'snatches': return s.value === 1 ? '1 SNATCH' : `${s.value} SNATCHES`;
    case 'longest_streak': return `LONGEST STREAK ${s.value}`;
    case 'goldens': return `${s.value} GOLDENS`;
    case 'cleanest': return `CLEANEST  ${s.value} HITS, NO LURES`;
    case 'best_bar': return `BEST STRETCH  ${n(s.value)} POINTS`;
    default: return null;
  }
}
