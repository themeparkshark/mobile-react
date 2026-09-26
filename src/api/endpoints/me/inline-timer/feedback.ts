import api from '../../../api';

export type WaitRating = 'better' | 'somewhat' | 'no';
export type FavoriteLinePlayActivity = 'games' | 'story' | 'crew' | 'rewards' | 'none';

export interface LinePlayFeedback {
  rating: WaitRating;
  favorite: FavoriteLinePlayActivity | null;
  activities_completed: number;
}

export async function getLinePlayFeedback(sessionId: string): Promise<LinePlayFeedback | null> {
  const response = await api.get<{ data: LinePlayFeedback | null }>(
    `/me/line-sessions/${sessionId}/feedback`, { timeout: 8000 });
  return response.data.data;
}

export async function saveLinePlayFeedback(
  sessionId: string, rating: WaitRating, activitiesCompleted: number,
  favorite?: FavoriteLinePlayActivity | null,
): Promise<LinePlayFeedback> {
  const response = await api.post<{ data: LinePlayFeedback }>(
    `/me/line-sessions/${sessionId}/feedback`, {
      rating, favorite: favorite ?? null,
      activities_completed: Math.min(40, Math.max(0, activitiesCompleted)),
    }, { timeout: 8000 });
  return response.data.data;
}
