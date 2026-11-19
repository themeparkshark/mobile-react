/**
 * Where a ride sits, for line stories (fix pass w4, T077): the land in plain words, one true line about
 * that land, the park's plain name, and which picture deck fits the land. Pure data, no imports, so the
 * chapter builder and its tests stay light.
 *
 * Lands are authored per park (a name can mean two places: Haunted Mansion is New Orleans Square at
 * Disneyland and Liberty Square at Magic Kingdom), keyed by a loose name key so the feed's spellings
 * ("Walt Disney's Enchanted Tiki Room", "Star Wars: Rise of the Resistance") find the same row.
 * A ride with no row reads null: the story then names the park, never a guessed land.
 */

/** A loose key: lower case, straight quotes, letters and digits only. */
export function landKey(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[‘’“”"']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const DISNEYLAND_LANDS: Readonly<Record<string, string>> = {
  'Jungle Cruise': 'Adventureland',
  'Walt Disney\'s Enchanted Tiki Room': 'Adventureland',
  'Enchanted Tiki Room': 'Adventureland',
  'Tiki Room': 'Adventureland',
  'Indiana Jones Adventure': 'Adventureland',
  'Adventureland Treehouse': 'Adventureland',
  'Adventureland Treehouse inspired by Walt Disney\'s Swiss Family Robinson': 'Adventureland',
  'pirates of the caribbean': 'New Orleans Square',
  'haunted mansion': 'New Orleans Square',
  'haunted mansion holiday': 'New Orleans Square',
  'big thunder mountain railroad': 'Frontierland',
  'mark twain riverboat': 'Frontierland',
  'sailing ship columbia': 'Frontierland',
  'pirates lair on tom sawyer island': 'Frontierland',
  'frontierland shootin exposition': 'Frontierland',
  'matterhorn bobsleds': 'Fantasyland',
  'its a small world': 'Fantasyland',
  'its a small world holiday': 'Fantasyland',
  'peter pans flight': 'Fantasyland',
  'mr toads wild ride': 'Fantasyland',
  'mad tea party': 'Fantasyland',
  'king arthur carrousel': 'Fantasyland',
  'alice in wonderland': 'Fantasyland',
  'dumbo the flying elephant': 'Fantasyland',
  'casey jr circus train': 'Fantasyland',
  'storybook land canal boats': 'Fantasyland',
  'pinocchios daring journey': 'Fantasyland',
  'snow whites enchanted wish': 'Fantasyland',
  'sleeping beauty castle walkthrough': 'Fantasyland',
  'space mountain': 'Tomorrowland',
  'star tours': 'Tomorrowland',
  'Star Tours - The Adventures Continue': 'Tomorrowland',
  'buzz lightyear astro blasters': 'Tomorrowland',
  'finding nemo submarine voyage': 'Tomorrowland',
  'autopia': 'Tomorrowland',
  'disneyland monorail': 'Tomorrowland',
  'astro orbitor': 'Tomorrowland',
  'The Many Adventures of Winnie the Pooh': 'Bayou Country',
  'Tiana\'s Bayou Adventure': 'Bayou Country',
  'davy crocketts explorer canoes': 'Bayou Country',
  'roger rabbits car toon spin': "Mickey's Toontown",
  'mickey minnies runaway railway': "Mickey's Toontown",
  'chip n dales gadgetcoaster': "Mickey's Toontown",
  'millennium falcon smugglers run': "Galaxy's Edge",
  'star wars rise of the resistance': "Galaxy's Edge",
  'rise of the resistance': "Galaxy's Edge",
  'ogas cantina': "Galaxy's Edge",
  'ogas cantina at the disneyland resort': "Galaxy's Edge",
  'great moments with mr lincoln': 'Main Street, U.S.A.',
  'main street cinema': 'Main Street, U.S.A.',
};

const MAGIC_KINGDOM_LANDS: Readonly<Record<string, string>> = {
  'seven dwarfs mine train': 'Fantasyland',
  'its a small world': 'Fantasyland',
  'peter pans flight': 'Fantasyland',
  'dumbo the flying elephant': 'Fantasyland',
  'the barnstormer': 'Fantasyland',
  'casey jr splash n soak station': 'Fantasyland',
  'mad tea party': 'Fantasyland',
  'The Many Adventures of Winnie the Pooh': 'Fantasyland',
  'under the sea journey of the little mermaid': 'Fantasyland',
  'enchanted tales with belle': 'Fantasyland',
  'prince charming regal carrousel': 'Fantasyland',
  'mickeys philharmagic': 'Fantasyland',
  'meet ariel at her grotto': 'Fantasyland',
  'meet daring disney pals as circus stars at petes silly sideshow': 'Fantasyland',
  'tron lightcycle run': 'Tomorrowland',
  'space mountain': 'Tomorrowland',
  'astro orbiter': 'Tomorrowland',
  'buzz lightyears space ranger spin': 'Tomorrowland',
  'tomorrowland speedway': 'Tomorrowland',
  'tomorrowland transit authority peoplemover': 'Tomorrowland',
  'walt disneys carousel of progress': 'Tomorrowland',
  'monsters inc laugh floor': 'Tomorrowland',
  'pirates of the caribbean': 'Adventureland',
  'Jungle Cruise': 'Adventureland',
  'swiss family treehouse': 'Adventureland',
  'the magic carpets of aladdin': 'Adventureland',
  'Walt Disney\'s Enchanted Tiki Room': 'Adventureland',
  'Tiki Room': 'Adventureland',
  'A Pirate\'s Adventure ~ Treasures of the Seven Seas': 'Adventureland',
  'big thunder mountain railroad': 'Frontierland',
  'Tiana\'s Bayou Adventure': 'Frontierland',
  'country bear musical jamboree': 'Frontierland',
  'haunted mansion': 'Liberty Square',
  'the hall of presidents': 'Liberty Square',
  'main street vehicles': 'Main Street, U.S.A.',
  'meet mickey at town square theater': 'Main Street, U.S.A.',
  'walt disney world railroad main street u s a': 'Main Street, U.S.A.',
  'walt disney world railroad fantasyland': 'Fantasyland',
  'walt disney world railroad frontierland': 'Frontierland',
};

const keyed = (table: Readonly<Record<string, string>>): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(table).map(([name, land]) => [landKey(name), land]));

const LANDS_BY_PARK: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  8: keyed(DISNEYLAND_LANDS),
  2: keyed(MAGIC_KINGDOM_LANDS),
};

/** The ride's land at this park, or null when none is authored. */
export function rideLand(parkId: number | null | undefined, rideName: string | null | undefined): string | null {
  const table = parkId == null ? undefined : LANDS_BY_PARK[parkId];
  if (!table) return null;
  const key = landKey(rideName);
  return table[key] ?? null;
}

/** One true, general line about each land: the story of a ride with no checked fact of its own. */
const LAND_LINES: Readonly<Record<string, string>> = {
  'Adventureland': 'Adventureland is the land of jungle rivers, tiki drums and faraway explorers.',
  'New Orleans Square': 'New Orleans Square is styled after the old French Quarter of New Orleans.',
  'Frontierland': 'Frontierland brings back the days of the Old West, with riverboats and mining towns.',
  'Fantasyland': 'Fantasyland is where storybook tales come to life, right behind the castle.',
  'Tomorrowland': 'Tomorrowland is the land of rockets, robots and ideas about the future.',
  'Bayou Country': 'Bayou Country sits on the riverbank, a sleepy bayou full of critters and canoes.',
  "Mickey's Toontown": "Mickey's Toontown is a cartoon town where Mickey and his pals live.",
  "Galaxy's Edge": "Galaxy's Edge is a far-off trading outpost on the planet Batuu.",
  'Main Street, U.S.A.': 'Main Street, U.S.A. is styled after a small American town from around 1900.',
  'Liberty Square': 'Liberty Square is styled after colonial America, with a Liberty Bell of its own.',
};

export function landLine(land: string | null | undefined): string | null {
  return land ? LAND_LINES[land] ?? null : null;
}

/** The park's plain name for a story line, or null. Plain words, never a logo. */
const PARK_NAMES: Readonly<Record<number, string>> = {
  1: 'Universal Studios Hollywood',
  2: 'Magic Kingdom',
  3: 'Universal Studios Florida',
  7: 'Islands of Adventure',
  8: 'Disneyland',
  10: 'Epic Universe',
  13: 'Disney California Adventure',
};

export function parkPlainName(parkId: number | null | undefined): string | null {
  return parkId == null ? null : PARK_NAMES[parkId] ?? null;
}

export type LandDeckId = 'space' | 'jungle' | 'pirates' | 'rainbow-ridge' | 'mansion' | 'park' | 'backlot' | 'ocean';

/** Which picture deck dresses a land's story and puzzles. */
const LAND_DECKS: Readonly<Record<string, LandDeckId>> = {
  'Tomorrowland': 'space',
  "Galaxy's Edge": 'space',
  'Adventureland': 'jungle',
  'New Orleans Square': 'pirates',
  'Frontierland': 'rainbow-ridge',
  'Liberty Square': 'mansion',
  'Bayou Country': 'jungle',
  'Fantasyland': 'park',
  'Main Street, U.S.A.': 'park',
  "Mickey's Toontown": 'park',
};

export function landDeck(land: string | null | undefined): LandDeckId | null {
  return land ? LAND_DECKS[land] ?? null : null;
}
