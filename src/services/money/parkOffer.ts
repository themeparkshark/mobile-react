/**
 * The Park Day Pack at the gate (money stream round 5): at most one quiet card per park day, the first
 * time the kid is inside a park that day. Never at home, never twice, never with a timer. Pure rules here;
 * the card is components/money/ParkDayOffer.tsx.
 */
export type ParkOfferSeen = { readonly day: string } | null;

/** Show it? Only in a park, only once per shop day, only when the pack is for sale today. Exported for tests. */
export function shouldShowParkOffer(input: {
  inPark: boolean; shopDay: string | null; seen: ParkOfferSeen; packAvailable: boolean; priced: boolean;
}): boolean {
  const { inPark, shopDay, seen, packAvailable, priced } = input;
  if (!inPark || !shopDay || !packAvailable || !priced) return false;
  return seen?.day !== shopDay;
}

export const PARK_OFFER_KEY = 'money:park-offer-seen';
