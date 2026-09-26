import api from '../../../api';
import type { LineSessionResponse } from './types';

export default async function readInLineTimer(sessionId: string): Promise<LineSessionResponse> {
  const response = await api.get(`/me/line-sessions/${sessionId}`, { timeout: 8000 });
  return response.data;
}
