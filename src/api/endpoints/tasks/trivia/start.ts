import { TriviaGameResponseType } from '../../../../models/trivia-game-response-type';
import client from '../../../client';

/**
 * Start a trivia mini-game for a task.
 * Requires 1 ticket to start.
 */
export default async function startTrivia(
  taskId: number
): Promise<TriviaGameResponseType> {
  const { data } = await client.post<TriviaGameResponseType>(
    `/tasks/${taskId}/trivia/start`
  );

  return data;
}
