import api from '../../../api';
import type { LineBonusSummary } from './types';

export type CurrentQuestTier = 'standard' | 'easy' | 'breeze';

/** One server seed and tier per bonus attempt (Queue Bonus Rounds servers only). */
export interface CurrentQuestAttempt {
  readonly attempt_id: string;
  readonly seed_index: number;
  readonly seed: number;
  readonly tier: CurrentQuestTier;
  readonly stroll: boolean;
  readonly voyages: number;
  readonly issued_at: string;
  readonly attempts_left?: number;
}

/** Ask for this round's seed. `replace` retires an unfinished round (only after 20 s of play). */
export async function startCurrentQuestAttempt(
  sessionId: string,
  moving: boolean,
  replace = false,
): Promise<CurrentQuestAttempt> {
  const response = await api.post(`/me/line-sessions/${sessionId}/current-quest/attempts`,
    { moving, replace }, { timeout: 8000 });
  return response.data;
}

export interface CurrentQuestProof {
  /** Bonus rounds: the attempt this proof answers. */
  readonly attempt_id?: string;
  readonly seed: number;
  readonly score: number;
  readonly duration_seconds: number;
  readonly paths: readonly (readonly number[])[];
}

/** Server replays every accepted tap before reserving the optional queue bonus. */
export default async function submitCurrentQuest(
  sessionId: string,
  proof: CurrentQuestProof,
): Promise<{ success: boolean; verified: boolean; bonus_pending: boolean;
  outcome?: 'slot' | 'saved' | 'encore' | 'floor' | null; bonus?: LineBonusSummary | null }> {
  const response = await api.post(`/me/line-sessions/${sessionId}/current-quest`, proof,
    { timeout: 8000 });
  return response.data;
}
