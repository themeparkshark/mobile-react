import client from '../../client';

/**
 * GET /api/me/secret-shop: this player's Secret Shop v2 switch. On for everyone
 * after launch, and before that only for the server's preview list
 * (SECRET_SHOP_V2_PREVIEW_IDS). Never cached by a shared cache.
 */
export type MySecretShop = { readonly secret_shop_v2: boolean; readonly preview: boolean };

export default async function getMySecretShop(): Promise<MySecretShop> {
  const { data } = await client.get<{ data: MySecretShop }>('/me/secret-shop', { timeout: 8000 });
  if (!data?.data || typeof data.data.secret_shop_v2 !== 'boolean') throw new Error('Secret Shop access response was malformed.');
  return data.data;
}
