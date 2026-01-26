import { TriviaAnswerResponseType } from '../../../../models/trivia-answer-response-type';
import client from '../../../client';

/**
 * Submit an answer for the current trivia question.
 */
export default async function answerTrivia(
  sessionId: string,
  answerIndex: number
): Promise<TriviaAnswerResponseType> {
  const { data } = await client.post<TriviaAnswerResponseType>(
    '/trivia/answer',
    {
      session_id: sessionId,
      answer_index: answerIndex,
    }
  );

  return data;
}
