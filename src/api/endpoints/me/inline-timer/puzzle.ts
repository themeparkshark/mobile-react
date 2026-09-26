import api from '../../../api';
import type { CrewPuzzleGuess, LineSignalSummary } from './types';

export default async function guessCrewPuzzle(
  sessionId: string,
  clientRequestId: string,
  symbols: readonly number[],
): Promise<{ result: CrewPuzzleGuess; signal: LineSignalSummary }> {
  const response = await api.post(`/me/line-sessions/${sessionId}/puzzle/guess`, {
    client_request_id: clientRequestId,
    symbols,
  }, { timeout: 8000 });
  return { result: response.data.result, signal: response.data.signal };
}
