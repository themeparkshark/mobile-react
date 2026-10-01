import api from '../../../api';
import type { LineSessionResponse } from './types';
import type { StepReading } from '../../../../services/lineplay/checkpointCredit';

export default async function heartbeatInLineTimer(
  sessionId: string,
  latitude: number,
  longitude: number,
  accuracyMeters?: number | null,
  steps?: StepReading | null,
): Promise<LineSessionResponse> {
  // Accuracy only lets the server count real queue creep as bonus evidence.
  const accuracy = typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters >= 0
    ? Math.min(10_000, accuracyMeters) : undefined;
  const response = await api.post(`/me/line-sessions/${sessionId}/heartbeat`, {
    latitude,
    longitude,
    accuracy_meters: accuracy,
    // Pedometer steps across a dark gap (L1): a walk vetoes the bridge.
    ...(steps ? { steps } : {}),
  }, { timeout: 8000 });
  return response.data;
}
