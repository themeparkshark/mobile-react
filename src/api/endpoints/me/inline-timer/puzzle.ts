import api from '../../../api';
import type { CrewPuzzleGuess, LineBonusSummary, LineSignalSummary } from './types';

export default async function guessCrewPuzzle(
  sessionId: string,
  clientRequestId: string,
  symbols: readonly number[],
): Promise<{ result: CrewPuzzleGuess; signal: LineSignalSummary; bonus?: LineBonusSummary | null }> {
  const response = await api.post(`/me/line-sessions/${sessionId}/puzzle/guess`, {
    client_request_id: clientRequestId,
    symbols,
  }, { timeout: 8000 });
  return { result: response.data.result, signal: response.data.signal, bonus: response.data.bonus ?? null };
}
