import api from '../../../api';

export interface CurrentQuestProof {
  readonly seed: number;
  readonly score: number;
  readonly duration_seconds: number;
  readonly paths: readonly (readonly number[])[];
}

/** Server replays every accepted tap before reserving the optional queue bonus. */
export default async function submitCurrentQuest(
  sessionId: string,
  proof: CurrentQuestProof,
): Promise<{ success: boolean; verified: boolean; bonus_pending: boolean }> {
  const response = await api.post(`/me/line-sessions/${sessionId}/current-quest`, proof,
    { timeout: 8000 });
  return response.data;
}
