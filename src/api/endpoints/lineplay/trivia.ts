import api from '../../api';

/** One published, fact-checked queue trivia question from the server deck. */
export interface ServerTriviaQuestion {
  readonly id: string;
  readonly park_id: number | null;
  readonly ride_id: number | null;
  readonly question: string;
  readonly choices: readonly string[];
  readonly correct_index: number;
  readonly difficulty: 'easy' | 'medium' | 'hard';
  /** Theme: kids, classic, history, numbers, deep-cut or lands. Older servers omit it. */
  readonly deck?: string;
  readonly fact: string | null;
  readonly source: string;
}

export interface ServerTriviaDeck {
  readonly park_id: number;
  readonly ride_id: number | null;
  readonly version: string;
  readonly questions: readonly ServerTriviaQuestion[];
}

/**
 * Free, ride-keyed queue trivia. Read-only: it never costs or grants anything.
 * With `network`, other parks' questions follow the local deck so the
 * no-repeat rotation always has fresh cards.
 */
export default async function getLinePlayTrivia(parkId: number, rideId?: number, network = true): Promise<ServerTriviaDeck> {
  const response = await api.get('/lineplay/trivia', {
    params: { park_id: parkId, ...(rideId ? { ride_id: rideId } : {}), ...(network ? { network: 1 } : {}) },
    timeout: 8000,
  });
  return response.data;
}
