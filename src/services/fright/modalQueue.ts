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
}

export type FrightModal =
  | { readonly id: string; readonly kind: 'rank'; readonly prompt: RankModalPrompt }
  | { readonly id: string; readonly kind: 'case_file'; readonly file: FrightCaseFileDrop }
  | { readonly id: string; readonly kind: 'rewards'; readonly rewards: readonly FrightReward[] }
  | { readonly id: string; readonly kind: 'side'; readonly encounterKey: string; readonly name: string };

export interface ModalGate {
  readonly quiet: boolean;
  readonly focused: boolean;
  readonly foreground: boolean;
  readonly blocked: boolean;
}

/** Add a modal (same id replaces nothing: the first stays, duplicates are dropped). */
export function pushModal(queue: readonly FrightModal[], modal: FrightModal): FrightModal[] {
  return queue.some(item => item.id === modal.id) ? [...queue] : [...queue, modal];
}

/** The team pick jumps the line (a catch is waiting on it); everything else keeps arrival order. */
export function visibleModal(queue: readonly FrightModal[], gate: ModalGate): FrightModal | null {
  if (gate.quiet || !gate.focused || !gate.foreground || gate.blocked) return null;
  return queue.find(item => item.kind === 'side') ?? queue[0] ?? null;
}

export function dropModal(queue: readonly FrightModal[], id: string): FrightModal[] {
  return queue.filter(item => item.id !== id);
}
