import { ApiResponseType } from '../../../../models/api-response-type';
import { ItemType } from '../../../../models/item-type';
import { ShopSetReward } from '../../../../models/shop-today';
import client from '../../../client';

/** Buy an item. Shop v2 backends add set_reward when the buy finishes a set. */
export default async function items(item: ItemType): Promise<ItemType & { set_reward?: ShopSetReward | null }> {
  const { data } = await client.post<ApiResponseType<ItemType> & { set_reward?: ShopSetReward | null }>(
    `/me/inventory/items/${item.id}/purchase`
  );

  return { ...data.data, set_reward: data.set_reward ?? null };
}
