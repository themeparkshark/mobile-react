/**
 * One Fin-ister modal at a time (rank card, Case File reveal, reward reveal,
 * Team pick). Queued in arrival order and shown only when nothing else may be
 * hurt by it: not in a haunt's quiet window, the map is on screen (never over
 * Line Play), the app is open, no tutorial or haunt sheet is up. Pure, tested.
 */
import type { FrightCaseFileDrop, FrightReward } from '../../api/endpoints/fright/types';

export interface RankModalPrompt {
  readonly key: string;
  readonly name: string;
  readonly reSwim: boolean;
  readonly lastScore: number | null;
  /** XP the finish granted (shown on the rank stamp). */
  readonly xp?: number | null;
  /** The rank_first coach line, shown on the first rank card of the season. */
  readonly hint?: string | null;
}

export type FrightModal =
  | { readonly id: string; readonly kind: 'rank'; readonly prompt: RankModalPrompt }
  | { readonly id: string; readonly kind: 'case_file'; readonly file: FrightCaseFileDrop }
  /** `critter`: the caught critter's name for the encounter milestone headline (catches only). */
  | { readonly id: string; readonly kind: 'rewards'; readonly rewards: readonly FrightReward[]; readonly critter?: string | null }
  | { readonly id: string; readonly kind: 'side'; readonly encounterKey: string; readonly name: string };

export interface ModalGate {
  readonly quiet: boolean;
  /** Still in a haunt's line (the run is open, even past the quiet window): only the team pick shows. */
  readonly inLine?: boolean;
  readonly focused: boolean;
  readonly foreground: boolean;
  readonly blocked: boolean;
}

/**
 * Add a modal (same id replaces nothing: the first stays, duplicates are dropped).
 * The rank card goes first (a Case File found in line waits behind it), but never yanks
 * the modal already on screen (`showingId`). A finish's rewards (`rewards:<stamp>`) sit
 * right behind their rank card (`rank:<stamp>`).
 */
export function pushModal(queue: readonly FrightModal[], modal: FrightModal, showingId: string | null = null): FrightModal[] {
  if (queue.some(item => item.id === modal.id)) return [...queue];
  const next = [...queue];
  if (modal.kind === 'rank') {
    const showing = showingId ? next.findIndex(item => item.id === showingId) : -1;
    next.splice(showing + 1, 0, modal);
    return next;
  }
  if (modal.kind === 'rewards' && modal.id.startsWith('rewards:')) {
    const rank = next.findIndex(item => item.id === `rank:${modal.id.slice('rewards:'.length)}`);
    if (rank >= 0) { next.splice(rank + 1, 0, modal); return next; }
  }
  next.push(modal);
  return next;
}

/** The team pick jumps the line (a catch is waiting on it); everything else keeps queue order. */
export function visibleModal(queue: readonly FrightModal[], gate: ModalGate): FrightModal | null {
  if (gate.quiet || !gate.focused || !gate.foreground || gate.blocked) return null;
  const side = queue.find(item => item.kind === 'side');
  // A Case File found in line waits for the rank card the finish brings (panel: rank first).
  if (gate.inLine) return side ?? null;
  return side ?? queue[0] ?? null;
}

export function dropModal(queue: readonly FrightModal[], id: string): FrightModal[] {
  return queue.filter(item => item.id !== id);
}
