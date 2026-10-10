import client from '../../client';

/** This month's verified spend on this account (Supplies, Shark Pass, gift plans), for the grown-up page. Null on error. */
export async function getMoneySpend(): Promise<{ month: string; usd: number; buys: number } | null> {
  try {
    const { data } = await client.get('/me/money/spend', { timeout: 8000 });
    return data?.data ?? null;
  } catch {
    return null;
  }
}
