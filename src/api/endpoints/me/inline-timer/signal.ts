import api from '../../../api';
import type { LineSignalSummary } from './types';

export default async function chooseLineSignal(
  sessionId: string,
  route: 'route_a' | 'route_b',
): Promise<LineSignalSummary> {
  const response = await api.post(`/me/line-sessions/${sessionId}/signal`, { route }, { timeout: 8000 });
  return response.data.signal;
}
