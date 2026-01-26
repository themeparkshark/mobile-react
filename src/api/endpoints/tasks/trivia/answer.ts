import { TriviaAnswerResponseType } from '../../../../models/trivia-answer-response-type';
import client from '../../../client';

/**
 * Submit an answer for the current trivia question.
 * @param sessionToken - The trivia session token
 * @param answer - The actual answer text (not index)
 * @param doubleXp - VIP double XP (optional)
 * @param doubleCoins - VIP double coins (optional)
 */
export default async function answerTrivia(
  sessionToken: string,
  answer: string,
  doubleXp: boolean = false,
  doubleCoins: boolean = false
): Promise<TriviaAnswerResponseType> {
  const { data } = await client.post<TriviaAnswerResponseType>(
    '/trivia/answer',
    {
      session_token: sessionToken,
      answer,
      double_xp: doubleXp,
      double_coins: doubleCoins,
    }
  );

  return data;
}
