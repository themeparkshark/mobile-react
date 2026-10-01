import api from '../../../api';
import type { LineSessionResponse } from './types';
import { checkpointBody, type CheckpointFix, type StepReading } from '../../../../services/lineplay/checkpointCredit';

/**
 * Upload fixes kept while the server was unreachable (L1). Idempotent: the
 * server ignores fixes it already folded. A no-op on servers with the flag off.
 */
export default async function syncLineSession(
  sessionId: string,
  samples: readonly CheckpointFix[],
  steps?: StepReading | null,
): Promise<LineSessionResponse> {
  const response = await api.post(`/me/line-sessions/${sessionId}/sync`,
    checkpointBody({ samples, steps }, Date.now()), { timeout: 8000 });
  return response.data;
}
