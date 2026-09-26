import client from '../../client';

export interface GiftEligibility {
  prep_item_id: number;
  spare_copies: number;
  remaining_24h: number;
  eligible_friends: { id: number; screen_name: string }[];
}

export interface GiftReceipt {
  receipt_id: number;
  recipient_id: number;
  recipient_name: string;
  prep_item_id: number;
  replayed: boolean;
}

export async function getGiftEligibility(prepItemId: number): Promise<GiftEligibility> {
  const { data } = await client.get<{ success: true; data: GiftEligibility }>(
    '/me/prep-variant-gifts/eligible', { params: { prep_item_id: prepItemId } });
  return data.data;
}

/** Reuse requestId when retrying an uncertain response. */
export async function sendPrepVariantGift(
  recipientId: number, prepItemId: number, requestId: string
): Promise<GiftReceipt> {
  const { data } = await client.post<{ success: true; data: GiftReceipt }>(
    '/me/prep-variant-gifts', {
      recipient_id: recipientId, prep_item_id: prepItemId, request_id: requestId,
    });
  return data.data;
}
