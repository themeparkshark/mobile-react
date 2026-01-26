import { TriviaSkipResponseType } from '../../../../models/trivia-skip-response-type';
import client from '../../../client';

/**
 * Skip trivia and claim task with 1x multiplier (no bonus).
 */
export default async function skipTrivia(
  taskId: number
): Promise<TriviaSkipResponseType> {
  const { data } = await client.post<TriviaSkipResponseType>(
    `/tasks/${taskId}/trivia/skip`
  );

  return data;
}
