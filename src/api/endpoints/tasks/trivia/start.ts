import { TriviaStartResponseType } from '../../../../models/trivia-start-response-type';
import client from '../../../client';

/**
 * Start a trivia mini-game for a task.
 * Requires 1 ticket to start.
 */
export default async function startTrivia(
  taskId: number
): Promise<TriviaStartResponseType> {
  const { data } = await client.post<TriviaStartResponseType>(
    `/tasks/${taskId}/trivia/start`
  );

  return data;
}
