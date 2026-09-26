/** Broad visual themes inferred only from a ride's public name. No ride facts are inferred. */
export type RideDeckId = 'park' | 'space' | 'pirates' | 'mansion' | 'backlot' | 'ocean' | 'jungle';

export function deckIdForRideName(name?: string): RideDeckId {
  const ride = name?.trim().toLowerCase() ?? '';
  if (/space|galaxy|star|rocket|astro|moon/.test(ride)) return 'space';
  if (/pirate|treasure|harbor|ship|sail/.test(ride)) return 'pirates';
  if (/haunted|ghost|phantom|mansion/.test(ride)) return 'mansion';
  if (/studio|backlot|movie|film|cinema/.test(ride)) return 'backlot';
  if (/jungle|safari|riverboat|rainforest/.test(ride)) return 'jungle';
  if (/nemo|the seas|aquarium|ocean|submarine|reef|coral/.test(ride)) return 'ocean';
  return 'park';
}
