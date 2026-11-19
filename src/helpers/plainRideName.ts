/**
 * Plain ride names everywhere (IP rule): drop trademark, registered and copyright marks the
 * wait-times feed and some catalog rows carry ("Indiana Jones™ Adventure" reads
 * "Indiana Jones Adventure"), and tidy the spaces they leave. Then one display name per ride.
 */
const MARKS = /\s*(?:[™®©℠]|\((?:TM|R|C|SM)\))/giu;

/**
 * One display name per ride (fix w3 T122). The coin rows ("Thunder Mountain", "Tiki Room",
 * "Pirates"), the ride catalog ("Big Thunder Mountain Railroad", "Walt Disney's Enchanted Tiki
 * Room") and the wait-times feed ("Haunted Mansion Holiday") each spell a ride their own way, so the
 * map, LinePlay, Wait Times and the shelf disagreed. Every ride list already passes through
 * plainRideName at its API boundary, so this one table gives every screen the same name with
 * proper casing. Keys are normalized (lower case, straight quotes, no wrapping quotes); a key must
 * mean one ride in every park (no "Castle", no "Transformers"). Seasonal overlays keep the ride's
 * own name so its coin never changes name in December. Add a row here, never on a screen; the
 * vocabulary test checks the map, LinePlay, Wait Times and shelf read the same names.
 */
export const RIDE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // Disneyland
  'thunder mountain': 'Big Thunder Mountain Railroad',
  'big thunder mountain': 'Big Thunder Mountain Railroad',
  'tiki room': 'Enchanted Tiki Room',
  "walt disney's enchanted tiki room": 'Enchanted Tiki Room',
  'haunted mansion holiday': 'Haunted Mansion',
  "it's a small world": "It's a Small World",
  "it's a small world holiday": "It's a Small World",
  'the many adventures of pooh': 'The Many Adventures of Winnie the Pooh',
  'the many adventures of winnie the pooh': 'The Many Adventures of Winnie the Pooh',
  'pirates': 'Pirates of the Caribbean',
  'smugglers': 'Millennium Falcon: Smugglers Run',
  'astro blasters': 'Buzz Lightyear Astro Blasters',
  'matterhorn': 'Matterhorn Bobsleds',
  'mr. lincoln': 'Great Moments with Mr. Lincoln',
  'mr. toad': "Mr. Toad's Wild Ride",
  'star wars: rise of the resistance': 'Rise of the Resistance',
  'star tours - the adventures continue': 'Star Tours',
  'submarine voyage': 'Finding Nemo Submarine Voyage',
  "oga's cantina at the disneyland resort": "Oga's Cantina",
  "adventureland treehouse inspired by walt disney's swiss family robinson": 'Adventureland Treehouse',
  // Magic Kingdom
  'dumbo the flying elephant': 'Dumbo the Flying Elephant',
  'monsters inc laugh floor': 'Monsters, Inc. Laugh Floor',
  'under the sea: journey of the little mermaid': 'Under the Sea - Journey of The Little Mermaid',
  // Universal
  'forbidden journey': 'Harry Potter and the Forbidden Journey',
  'escape from gringotts': 'Harry Potter and the Escape from Gringotts',
  'mummy': 'Revenge of the Mummy',
  'revenge of the mummy': 'Revenge of the Mummy',
  'revenge of the mummy - the ride': 'Revenge of the Mummy',
  'men in black': 'Men in Black Alien Attack',
  'men in black alien attack!': 'Men in Black Alien Attack',
  'the cat in the hat': 'The Cat in the Hat',
  'skull island reign of kong': 'Skull Island: Reign of Kong',
  'amazing adventure of spider-man': 'The Amazing Adventures of Spider-Man',
  'velocicoaster': 'Jurassic World VelociCoaster',
  "hagrid's motorbike": "Hagrid's Magical Creatures Motorbike Adventure",
  // California Adventure
  'monsters to the rescue!': 'Monsters, Inc. Mike & Sulley to the Rescue!',
  'monsters, inc. mike & sulley to the rescue!': 'Monsters, Inc. Mike & Sulley to the Rescue!',
  'midway': 'Toy Story Midway Mania!',
  'mission: breakout!': 'Guardians of the Galaxy - Mission: Breakout!',
  'guardians of the galaxy - mission: breakout!': 'Guardians of the Galaxy - Mission: Breakout!',
};

/** The lookup key: lower case, straight apostrophes, plain hyphens, no wrapping quotes. */
export function rideNameKey(name: string): string {
  return name.toLocaleLowerCase('en-US')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*[\u2013\u2014]\s*/g, ' - ')
    .replace(/^"+|"+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function plainRideName(name: string | null | undefined): string {
  if (typeof name !== 'string') return '';
  const plain = name.replace(MARKS, '').replace(/\s{2,}/g, ' ').trim();
  return RIDE_DISPLAY_NAMES[rideNameKey(plain)] ?? plain;
}

/** The same, for a list of rows with a `name` (returns new rows only when one changed). */
export function withPlainNames<T extends { name: string }>(rows: readonly T[]): T[] {
  return rows.map(row => {
    const plain = plainRideName(row.name);
    return plain === row.name ? row : { ...row, name: plain };
  });
}

/** The same for any name field ("ride_name", "task_name") on a list of rows. */
export function withPlainField<T>(rows: readonly T[] | null | undefined, key: keyof T & string): T[] {
  if (!Array.isArray(rows)) return rows as unknown as T[];
  return rows.map(row => {
    const value = row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined;
    if (typeof value !== 'string') return row;
    const plain = plainRideName(value);
    return plain === value ? row : { ...row, [key]: plain };
  });
}

/**
 * The map's opportunities (/me/current-redeemables): ride coins and secret coins carry ride names
 * that label the map, so they go through the same plain-name path as every other ride list.
 */
export function withPlainTaskNames<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of ['tasks', 'secret_tasks']) {
    const rows = out[key];
    if (Array.isArray(rows)) {
      out[key] = rows.map((row) => (row && typeof row === 'object' && typeof (row as { name?: unknown }).name === 'string'
        ? withPlainNames([row as { name: string }])[0] : row));
    }
  }
  return out as T;
}

type Named = { readonly name?: unknown };
type RideNamed = { readonly ride_name?: unknown };
const plainNamed = <T>(row: T): T => {
  const value = row && typeof row === 'object' ? (row as Named).name : undefined;
  if (typeof value !== 'string') return row;
  const plain = plainRideName(value);
  return plain === value ? row : { ...row, name: plain };
};
const plainRideNamed = <T>(row: T): T => {
  const value = row && typeof row === 'object' ? (row as RideNamed).ride_name : undefined;
  if (typeof value !== 'string') return row;
  const plain = plainRideName(value);
  return plain === value ? row : { ...row, ride_name: plain };
};

/**
 * The coin PLAY! is up for (/me/current-redeemable): its name labels the pill under PLAY!, the coin card and
 * the win card, so it reads like the guide card above it (hold R2: "Matterhorn Bobsleds" on the card and
 * "Matterhorn" under PLAY!). Only ride and secret coins carry a ride name.
 */
export function withPlainRedeemableName<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const r = data as { type?: unknown; model?: unknown };
  if ((r.type !== 'task' && r.type !== 'secret_task') || !r.model) return data;
  const model = plainNamed(r.model);
  return model === r.model ? data : { ...data, model } as T;
}

/** Today's Adventure (its ride, the choices and both stamps): the ticket sheet names the ride like the card does. */
export function withPlainAdventureNames<T>(ticket: T): T {
  if (!ticket || typeof ticket !== 'object') return ticket;
  const t = ticket as Record<string, unknown>;
  const out: Record<string, unknown> = { ...t };
  for (const key of ['ride', 'discover', 'play']) if (t[key]) out[key] = plainRideNamed(t[key]);
  if (Array.isArray(t.ride_choices)) out.ride_choices = t.ride_choices.map(plainRideNamed);
  return out as T;
}

/** A coin game's result: the win card's ride name and its Ride Control line. */
export function withPlainAttemptNames<T>(response: T): T {
  if (!response || typeof response !== 'object') return response;
  const attempt = (response as { attempt?: { rewards?: Record<string, unknown> | null } }).attempt;
  const rewards = attempt?.rewards;
  if (!attempt || !rewards || typeof rewards !== 'object') return response;
  const next: Record<string, unknown> = { ...rewards };
  if (typeof rewards.task_name === 'string') next.task_name = plainRideName(rewards.task_name);
  if (rewards.ride_control && typeof rewards.ride_control === 'object') next.ride_control = plainRideNamed(rewards.ride_control);
  return { ...response, attempt: { ...attempt, rewards: next } } as T;
}
