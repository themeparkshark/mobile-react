import api from '../../../api';
import type { LineSessionResponse } from './types';
import type { CurrentQuestProof } from './currentQuest';

/** Private souvenir copy; the server never uses this to award Parts or Tickets. */
export interface QueueStoryMemento {
  readonly chapter_id: string;
  readonly chapter_title: string;
  readonly route_name: string | null;
  readonly completed_missions?: readonly ('signal' | 'observation' | 'finale')[];
}

/**
 * Complete an in-line timer and collect rewards
 */
export default async function completeInLineTimer(
  sessionId: string,
  latitude?: number,
  longitude?: number,
  currentQuest?: CurrentQuestProof,
  storyMemento?: QueueStoryMemento | null,
): Promise<LineSessionResponse> {
  const response = await api.post(`/me/line-sessions/${sessionId}/complete`, {
    latitude,
    longitude,
    current_quest: currentQuest,
    story_memento: storyMemento ?? undefined,
  }, { timeout: 8000 });
  return response.data;
}
