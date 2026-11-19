/**
 * Something true about the ride on its coin card and win card (fix w3 T124, T137): the land it sits
 * in and one fan note. Authored, checked facts only (opening years, famous lines); a ride with no
 * entry shows nothing rather than a guess. Keyed by the one display name (plainRideName), so the
 * coin row, the catalog and the feed spellings all find the same note. Plain words, no logos.
 */
import { plainRideName, rideNameKey } from '../../helpers/plainRideName';

export interface RideFact {
  /** The land, in plain words ("Adventureland"). */
  readonly land: string;
  /** One short fan note, under 70 letters. */
  readonly note: string;
}

const DISNEYLAND: Readonly<Record<string, RideFact>> = {
  'Jungle Cruise': { land: 'Adventureland', note: 'O2H is water backwards: the skippers’ “backside of water” joke.' },
  'Enchanted Tiki Room': { land: 'Adventureland', note: 'Opened in 1963, the first show with talking, singing birds.' },
  'Indiana Jones Adventure': { land: 'Adventureland', note: 'Opened in 1995. No two trips through the temple are quite the same.' },
  'Adventureland Treehouse': { land: 'Adventureland', note: 'Opened in 2023, high in the same big tree.' },
  'Pirates of the Caribbean': { land: 'New Orleans Square', note: 'Opened in 1967. Listen for the singing pirates.' },
  'Haunted Mansion': { land: 'New Orleans Square', note: 'Opened in 1969. 999 happy haunts live inside.' },
  'Big Thunder Mountain Railroad': { land: 'Frontierland', note: 'Opened in 1979: the wildest ride in the wilderness.' },
  'Mark Twain Riverboat': { land: 'Frontierland', note: 'Sailing the river since 1955.' },
  'Matterhorn Bobsleds': { land: 'Fantasyland', note: 'Opened in 1959, the first steel tube coaster.' },
  "It's a Small World": { land: 'Fantasyland', note: "First built for the 1964 New York World's Fair." },
  "Peter Pan's Flight": { land: 'Fantasyland', note: 'Flying over London since opening day in 1955.' },
  "Mr. Toad's Wild Ride": { land: 'Fantasyland', note: 'An opening day ride from 1955.' },
  'Mad Tea Party': { land: 'Fantasyland', note: 'Spinning since opening day in 1955.' },
  'King Arthur Carrousel': { land: 'Fantasyland', note: 'Its horses have galloped since 1955.' },
  'Alice in Wonderland': { land: 'Fantasyland', note: 'Down the rabbit hole since 1958.' },
  'Dumbo the Flying Elephant': { land: 'Fantasyland', note: 'Flying since the park’s first summer, 1955.' },
  'Casey Jr. Circus Train': { land: 'Fantasyland', note: 'Chugging along since 1955.' },
  'Storybook Land Canal Boats': { land: 'Fantasyland', note: 'Tiny villages from the stories line the canal.' },
  "Pinocchio's Daring Journey": { land: 'Fantasyland', note: 'Opened in 1983 with the new Fantasyland.' },
  "Snow White's Enchanted Wish": { land: 'Fantasyland', note: 'Reopened in 2021 with a happier ending.' },
  'Space Mountain': { land: 'Tomorrowland', note: 'Blasting off in the dark since 1977.' },
  'Star Tours': { land: 'Tomorrowland', note: 'First flew in 1987.' },
  'Buzz Lightyear Astro Blasters': { land: 'Tomorrowland', note: 'Opened in 2005. Aim for the big targets.' },
  'Finding Nemo Submarine Voyage': { land: 'Tomorrowland', note: 'Opened in 2007 in the old submarine lagoon.' },
  'Autopia': { land: 'Tomorrowland', note: 'Kids have driven it since opening day in 1955.' },
  'Disneyland Monorail': { land: 'Tomorrowland', note: 'Gliding overhead since 1959.' },
  'Astro Orbitor': { land: 'Tomorrowland', note: 'Steer your rocket up and down.' },
  'The Many Adventures of Winnie the Pooh': { land: 'Bayou Country', note: 'Opened in 2003.' },
  "Tiana's Bayou Adventure": { land: 'Bayou Country', note: 'Opened in 2024 with a big splash.' },
  "Roger Rabbit's Car Toon Spin": { land: "Mickey's Toontown", note: 'Opened in 1994. Spin your cab!' },
  "Mickey & Minnie's Runaway Railway": { land: "Mickey's Toontown", note: 'Opened at Disneyland in 2023.' },
  "Chip 'n' Dale's GADGETcoaster": { land: "Mickey's Toontown", note: 'A little coaster built from big gadgets.' },
  'Millennium Falcon: Smugglers Run': { land: "Galaxy's Edge", note: 'Opened in 2019. Every seat has a job.' },
  'Rise of the Resistance': { land: "Galaxy's Edge", note: 'Opened in 2020.' },
  "Oga's Cantina": { land: "Galaxy's Edge", note: 'A hangout on the edge of the galaxy.' },
  'Great Moments with Mr. Lincoln': { land: 'Main Street, U.S.A.', note: 'First shown at Disneyland in 1965.' },
  "Frontierland Shootin' Exposition": { land: 'Frontierland', note: 'Hit the targets and watch them spring to life.' },
};

/** Sight coins whose short names could mean another park's place: only at Disneyland (park 8). */
const DISNEYLAND_SIGHTS: Readonly<Record<string, RideFact>> = {
  'Castle': { land: 'Fantasyland', note: 'Sleeping Beauty Castle has stood here since 1955.' },
  'Fire Department': { land: 'Main Street, U.S.A.', note: 'Walt Disney\u2019s apartment is upstairs.' },
  'Walt Statue': { land: 'Main Street, U.S.A.', note: 'The Partners statue: Walt and Mickey, hand in hand.' },
};

const keyed = (table: Readonly<Record<string, RideFact>>): ReadonlyMap<string, RideFact> =>
  new Map(Object.entries(table).map(([name, fact]) => [rideNameKey(name), fact]));
const BY_KEY = keyed(DISNEYLAND);
const SIGHTS_8 = keyed(DISNEYLAND_SIGHTS);

/** The coin's land and fan note, or null when none is written for it. */
export function rideFact(name: string | null | undefined, parkId?: number | null): RideFact | null {
  const plain = plainRideName(name);
  if (!plain) return null;
  const key = rideNameKey(plain);
  return BY_KEY.get(key) ?? (Number(parkId) === 8 ? SIGHTS_8.get(key) ?? null : null);
}
