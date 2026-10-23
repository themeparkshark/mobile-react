import type { CodeReply } from '../../../screens/RedeemCoinCode/redeemCodeModel';
import client from '../../client';

/**
 * Redeems a coin or Shark Drop code. Resolves with the code's values plus
 * `granted` (what the server really added). Rejects on any error; the screen
 * shows the message inline.
 */
export default async function redeemCoinCode(code: string): Promise<CodeReply> {
  // The prize card lists everything the code gave (item, coins, tickets,
  // energy: the same news the server broadcasts), so the grey toast would only
  // repeat it over the chest. Skip the broadcasts for this call.
  const response = await client.post<{ data: CodeReply; granted?: CodeReply['granted'] }>('/coin-codes/redeem', { code },
    { skipBroadcasts: true } as object);
  const body = response.data;
  if (!body?.data || typeof body.data !== 'object') throw new Error('Unexpected redeem reply');
  return { ...body.data, granted: body.granted ?? null };
}
