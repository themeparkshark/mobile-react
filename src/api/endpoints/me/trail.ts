import client from '../../client';
import type { TrailSegment, TrailState } from '../../../services/trail/trailModel';

/**
 * Trail Boxes (backend routes/api/trail_boxes.php). Every route answers 404
 * while the server flag `trail_boxes` is off; callers treat that as "no feature".
 */
export async function getTrail(parkId: number | null): Promise<TrailState> {
  const { data } = await client.get<{ data: TrailState }>('/me/trail', { params: parkId ? { park_id: parkId } : {}, timeout: 10_000 });
  return data.data;
}

export async function postTrailWalk(parkId: number | null, segments: readonly TrailSegment[]): Promise<TrailState> {
  const { data } = await client.post<{ data: TrailState }>('/me/trail/walk', { park_id: parkId, segments }, { timeout: 15_000 });
  return data.data;
}

export async function openTrailBox(boxId: number, requestId: string, parkId: number | null): Promise<TrailState> {
  const { data } = await client.post<{ data: TrailState }>(`/me/trail/boxes/${boxId}/open`,
    { request_id: requestId, park_id: parkId }, { timeout: 15_000 });
  return data.data;
}

export async function frontTrailBox(boxId: number, parkId: number | null): Promise<TrailState> {
  const { data } = await client.post<{ data: TrailState }>(`/me/trail/boxes/${boxId}/front`, { park_id: parkId });
  return data.data;
}

export async function putTrailSettings(settings: { weekly_goal_steps?: number | null; wheels?: boolean }, parkId: number | null): Promise<TrailState> {
  const { data } = await client.put<{ data: TrailState }>('/me/trail/settings', { ...settings, park_id: parkId });
  return data.data;
}
