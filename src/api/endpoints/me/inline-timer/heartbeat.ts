import api from '../../../api';
import type { LineSessionResponse } from './types';

export default async function heartbeatInLineTimer(
  sessionId: string,
  latitude: number,
  longitude: number,
): Promise<LineSessionResponse> {
  const response = await api.post(`/me/line-sessions/${sessionId}/heartbeat`, {
    latitude,
    longitude,
  }, { timeout: 8000 });
  return response.data;
}
