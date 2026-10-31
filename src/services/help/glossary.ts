/**
 * One glossary for every currency, badge and game word a player meets.
 *
 * The six economy currencies come from the server (`GET /api/economy`,
 * EconomyGlossary.php) so the app and the server say the same thing. The local
 * list is the offline fallback and covers every other term. Pure data and
 * functions: safe for tests, no React, no network.
 */
import { resolveIconName, type GameIconName } from '../../ui/iconNames';

import countText from '../../helpers/countText';
/**
 * LinePlay's own icon on help pages (Dustin, Oct 28, ledger 37): the gold posts and rope
 * ('line', added to the icon set by the lineplay-ride lane). Until that icon is in the build,
 * help pages keep the ride cart, never the pocket watch (Wait Times only).
 */
export const LINEPLAY_ICON: GameIconName = resolveIconName('line') ?? 'ride';

export type GlossaryKey =
  | 'coins' | 'tickets' | 'energy' | 'ride_parts' | 'ride_coins' | 'rescue_pass'
  | 'keys' | 'swords' | 'xp' | 'coin_levels' | 'limited_coins' | 'ride_challenge'
  | 'lineplay' | 'ride_passport' | 'coin_guide' | 'adventure_ticket' | 'park_goal'
  | 'stamps' | 'sets' | 'pins' | 'home_finds' | 'crew' | 'standings' | 'daily_chest'
  | 'day_streak' | 'travel_mode' | 'ride_control' | 'vip' | 'supplies' | 'bonus_ads'
  | 'map_spin' | 'daily3_streak';

export interface GlossaryTerm {
  readonly key: GlossaryKey;
  /** The one name the game uses for it. */
  readonly label: string;
  readonly icon: GameIconName;
  /** What it is or does. One sentence. */
  readonly what: string;
  /** How to get it or where to find it. One sentence. */
  readonly earn: string;
  /** The How to play card that covers it. */
  readonly topic: HelpTopicId;
}

export type HelpTopicId =
  | 'basics' | 'home' | 'park' | 'ride_challenge' | 'lineplay' | 'coins_levels'
  | 'collections' | 'teams' | 'standings' | 'shop' | 'extras';

/** Currencies the server describes. Their wording wins when it loads. */
export const SERVER_CURRENCY_KEYS: readonly GlossaryKey[] = [
  'coins', 'ride_coins', 'tickets', 'energy', 'ride_parts', 'rescue_pass',
];

const TERMS: readonly GlossaryTerm[] = [
  // The money is Shark Coins (4.5), so it never shares a word with the ride coins on the shelf.
  { key: 'coins', label: 'Shark Coins', icon: 'coins', topic: 'basics',
    what: 'Spend them in the Shark Shop and Community Center.',
    earn: 'Win ride coins and open your daily chest.' },
  { key: 'tickets', label: 'Tickets', icon: 'ticket', topic: 'basics',
    what: 'Each PLAY! at a ride costs one Ticket.',
    earn: '3 treats at home = 1 Ticket. Stamps and chests give more.' },
  // Level-ups first; no boss promise (bosses are off for most players).
  { key: 'energy', label: 'Energy', icon: 'energy', topic: 'basics',
    what: 'Levels up your ride coins.',
    earn: 'Get it from treats, sets and your daily chest.' },
  { key: 'ride_parts', label: 'Ride Parts', icon: 'parts', topic: 'coins_levels',
    what: 'Belong to one ride. Use them to level that ride coin up.',
    earn: 'Win at that ride, or play LinePlay in its line.' },
  { key: 'ride_coins', label: 'Ride Coins', icon: 'coin', topic: 'park',
    what: 'One for each ride, show and famous sight. They fill your shelf.',
    earn: 'Walk up to the ride and tap PLAY!' },
  { key: 'rescue_pass', label: 'Extra tries', icon: 'retry', topic: 'ride_challenge',
    what: 'One more try at a ride coin you don\'t have yet.',
    earn: 'Today\'s free try comes first. Supplies sells extra tries.' },
  { key: 'keys', label: 'Keys', icon: 'lock', topic: 'park',
    what: 'Open treasure vaults on the park map.',
    earn: 'Grab one whenever you spot it.' },
  { key: 'swords', label: 'Swords', icon: 'swords', topic: 'teams',
    what: 'Attack another team at a park gym. One attack costs 2 Swords.',
    earn: 'Pick up swords you spot on the park map.' },
  { key: 'xp', label: 'XP', icon: 'xp', topic: 'basics',
    what: 'Points that raise your shark level.',
    earn: 'You get it for treats, ride coin wins, LinePlay and chests.' },
  { key: 'coin_levels', label: 'Level up', icon: 'star', topic: 'coins_levels',
    what: 'Ride coins level up. Each level looks new.',
    earn: 'Tap a coin on your shelf. Spend Energy and its Ride Parts.' },
  { key: 'limited_coins', label: 'Limited coins', icon: 'timer', topic: 'park',
    what: 'Special ride coins that are only out for a while.',
    earn: 'Win the coin before the day it leaves.' },
  { key: 'ride_challenge', label: 'PLAY!', icon: 'ride', topic: 'ride_challenge',
    what: 'A quick game at a ride. Win it to get the coin.',
    earn: 'Walk up to a ride coin and tap PLAY! One Ticket.' },
  // The pocket watch means Wait Times only; LinePlay shows its own line icon (ledger 37).
  { key: 'lineplay', label: 'LinePlay', icon: LINEPLAY_ICON, topic: 'lineplay',
    what: 'Stories and games for while you wait in a ride\'s line.',
    earn: 'Stand in a ride\'s line. The guide card offers it.' },
  { key: 'ride_passport', label: 'Ride Passport', icon: 'coin', topic: 'park',
    what: 'The rides part of a park\'s shelf. Catch all for a stamp.',
    earn: 'Open a park\'s shelf. It is the Rides tab.' },
  { key: 'coin_guide', label: 'Coin Guide', icon: 'search', topic: 'park',
    what: 'The list of every ride and coin at this park.',
    earn: 'Open a park\'s shelf and tap Find a coin.' },
  { key: 'adventure_ticket', label: 'Today\'s Adventure', icon: 'map', topic: 'park',
    what: 'A 3-step quest at one ride: win, play its line story, celebrate.',
    earn: 'The guide card shows it at the park.' },
  { key: 'park_goal', label: 'Next coin', icon: 'map', topic: 'home',
    what: 'The coin you want next. The guide card points to it.',
    earn: 'Tap a coin on your shelf, then Make this my next coin.' },
  { key: 'stamps', label: 'Stamps', icon: 'medal1', topic: 'collections',
    what: 'Badges for big moments, like your first ride coin.',
    earn: 'See them all in your Stamp Book, from the menu.' },
  { key: 'sets', label: 'Sets', icon: 'gift', topic: 'collections',
    what: 'Every treat belongs to a set, like the Churro Collection.',
    earn: 'Finish a set for Energy, Tickets, XP and a title.' },
  { key: 'pins', label: 'Pins', icon: 'pin', topic: 'extras',
    what: 'Pins you wear on your lanyard. Park pins never trade.',
    earn: 'Find the Pin of the Day, or trade extras.' },
  { key: 'home_finds', label: 'Treats', icon: 'gift', topic: 'home',
    what: 'Treats pop up near you, even at home. They don\'t stay long.',
    earn: 'Walk close, then tap one. Every 3 treats = 1 Ticket.' },
  { key: 'crew', label: 'Crew', icon: 'heart', topic: 'lineplay',
    what: 'The people in line with you. Play together on one phone.',
    earn: 'In LinePlay, tap Add your crew and pass the phone.' },
  { key: 'standings', label: 'Standings', icon: 'trophy', topic: 'standings',
    what: 'Rank by wins this week, with friends, or all-time ride coins.',
    earn: 'Tap Standings in the bottom bar.' },
  { key: 'daily_chest', label: 'Daily chest', icon: 'chest', topic: 'basics',
    what: 'A free chest every day. Day 7 has a Ticket inside.',
    earn: 'It opens on the home map once a day.' },
  // One flame, one number (4.5): the flame is the streak; the chest ladder says "Day 3 of 7".
  { key: 'day_streak', label: 'The flame', icon: 'streak', topic: 'basics',
    what: 'How many days in a row you opened your Daily Chest.',
    earn: 'Open your Daily Chest every day to keep it growing.' },
  // While Daily 3 is on, the flame counts Daily 3 days instead (one flame number in the game).
  { key: 'daily3_streak', label: 'The flame', icon: 'streak', topic: 'basics',
    what: 'How many days in a row you finished your Daily 3.',
    earn: 'Finish your Daily 3 every day to keep it growing.' },
  { key: 'travel_mode', label: 'Home Hunt', icon: 'map', topic: 'home',
    what: 'You are away from a park. Treats pop up nearby.',
    earn: 'Grab treats to fill your Tickets for the next park day.' },
  { key: 'ride_control', label: 'Teams and Ride Control', icon: 'crown', topic: 'teams',
    what: 'Three teams race to control the rides at each park.',
    earn: 'Pick a team. Your ride coin wins claim rides for it.' },
  { key: 'vip', label: 'VIP', icon: 'member', topic: 'shop',
    what: 'A plan a grown-up buys. Bigger rewards at home and the park.',
    earn: 'Tap Member on the Social screen to see what VIP gives you.' },
  { key: 'supplies', label: 'Supplies', icon: 'gift', topic: 'shop',
    what: 'Packs of Tickets, coins and Energy. A grown-up pays real money.',
    earn: 'In the Shark Shop. Ride Parts and ride coins are never sold.' },
  { key: 'bonus_ads', label: 'Bonus ads', icon: 'play', topic: 'shop',
    what: 'Short ads you can skip. Watch one for a small bonus.',
    earn: 'Tap Watch when you see one. Skipping costs nothing.' },
  // Motion stream (claude/fb-motion): the map's shark-finder button. Revert this commit if motion is left out.
  { key: 'map_spin', label: 'Map Spin', icon: 'shark', topic: 'basics',
    what: 'Spins the map with you, or keeps it still.',
    earn: 'Tap the round button to switch. Map moved away? Tap it again.' },
];

export const LOCAL_GLOSSARY: Readonly<Record<GlossaryKey, GlossaryTerm>> =
  Object.freeze(Object.fromEntries(TERMS.map(term => [term.key, term])) as Record<GlossaryKey, GlossaryTerm>);

export const GLOSSARY_KEYS: readonly GlossaryKey[] = TERMS.map(term => term.key);

export function isGlossaryKey(value: unknown): value is GlossaryKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LOCAL_GLOSSARY, value);
}

function cleanLine(value: unknown, max = 220): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > max) return null;
  // House rule: no em dashes in player copy, even if the server sends one.
  return text.replace(/\s*—\s*/g, ', ');
}

/** Old names an older server may still send. The app says the one glossary name. */
const RETIRED_LABELS: Readonly<Record<string, string>> = {
  'coins': 'Shark Coins', 'coin': 'Shark Coins', 'park tickets': 'Tickets', 'park ticket': 'Tickets',
  'park coins': 'Ride Coins', 'park coin': 'Ride Coins',
};

function cleanLabel(value: unknown): string | null {
  const text = cleanLine(value, 40);
  return text ? RETIRED_LABELS[text.toLowerCase()] ?? text : null;
}

/**
 * Overlay the server's currency wording onto the local glossary. Only known
 * currency keys are taken, and only the label/what/earn strings; anything
 * malformed keeps the local line. Never throws.
 */
export function mergeServerGlossary(
  local: Readonly<Record<GlossaryKey, GlossaryTerm>>,
  payload: unknown,
): Record<GlossaryKey, GlossaryTerm> {
  const merged = { ...local } as Record<GlossaryKey, GlossaryTerm>;
  const currencies = (payload as { currencies?: unknown } | null | undefined)?.currencies;
  if (Array.isArray(currencies)) {
    for (const entry of currencies) {
      if (!entry || typeof entry !== 'object') continue;
      const key = (entry as { key?: unknown }).key;
      if (!isGlossaryKey(key) || !SERVER_CURRENCY_KEYS.includes(key)) continue;
      const base = merged[key];
      merged[key] = {
        ...base,
        label: cleanLabel((entry as { label?: unknown }).label) ?? base.label,
        what: cleanLine((entry as { what?: unknown }).what) ?? base.what,
        earn: cleanLine((entry as { earn?: unknown }).earn) ?? base.earn,
      };
    }
  }
  const energyRule = cleanLine((payload as { energy_rule?: unknown } | null | undefined)?.energy_rule, 260);
  if (energyRule) {
    // The rule is "what" and "earn" in one; keep it whole on the earn line.
    merged.energy = { ...merged.energy, earn: energyRule };
  }
  return merged;
}

/** Tickets' earn line while Queue Tickets is on (12 words at most, like every glossary line). */
export const TICKETS_EARN_WITH_LINE = '3 treats = 1 Ticket. Your first wait at a ride earns one.';

/** The player's switches the glossary lines depend on (GET /api/feature-flags). */
export interface GlossarySwitches {
  /** queue_tickets: your first wait at a ride earns a Ticket. */
  readonly queueTickets?: boolean;
  /** ride_boss: boss raids are on for this player. */
  readonly rideBoss?: boolean;
}

/**
 * Every line true for the player's switches (core loop 5.11): Tickets lists the line Ticket only
 * while Queue Tickets is on, and no line promises bosses while they are off, even when an older
 * server's wording does. Never throws; unknown switches read off.
 */
export function glossaryForSwitches(glossary: Readonly<Record<GlossaryKey, GlossaryTerm>>, switches: GlossarySwitches):
  Record<GlossaryKey, GlossaryTerm> {
  const out = { ...glossary } as Record<GlossaryKey, GlossaryTerm>;
  for (const key of Object.keys(out) as GlossaryKey[]) {
    const term = out[key];
    const local = LOCAL_GLOSSARY[key];
    const bossy = (line: string) => /\bboss(es)?\b|\braids?\b/i.test(line);
    const lineTicket = (line: string) => /\b(wait|line)\b[^.]*\bTickets?\b|\bTickets?\b[^.]*\b(wait|line)\b/i.test(line);
    let what = term.what;
    let earn = term.earn;
    if (!switches.rideBoss && bossy(what)) what = local.what;
    if (!switches.rideBoss && bossy(earn)) earn = local.earn;
    if (key === 'tickets' && !switches.queueTickets && lineTicket(earn)) earn = local.earn;
    if (key === 'tickets' && switches.queueTickets && !lineTicket(earn)) earn = TICKETS_EARN_WITH_LINE;
    if (what !== term.what || earn !== term.earn) out[key] = { ...term, what, earn };
  }
  return out;
}

/** Every spelling a pill, badge or server currency uses, mapped to one term. */
const NAME_ALIASES: Readonly<Record<string, GlossaryKey>> = {
  'coins': 'coins', 'coin': 'coins', 'shark coins': 'coins', 'shark coin': 'coins',
  'tickets': 'tickets', 'ticket': 'tickets', 'park tickets': 'tickets', 'park ticket': 'tickets',
  'energy': 'energy',
  'ride parts': 'ride_parts', 'ride part': 'ride_parts', 'parts': 'ride_parts', 'part': 'ride_parts',
  'lineplay parts': 'ride_parts',
  'ride coins': 'ride_coins', 'ride coin': 'ride_coins',
  'rescue pass': 'rescue_pass', 'shark rescue pass': 'rescue_pass', 'extra tries': 'rescue_pass', 'extra try': 'rescue_pass',
  'treats': 'home_finds', 'treat': 'home_finds',
  'keys': 'keys', 'key': 'keys',
  'swords': 'swords', 'sword': 'swords',
  'xp': 'xp', 'experience': 'xp',
  'day streak': 'day_streak', 'streak': 'day_streak',
  'lineplay': 'lineplay', 'line play': 'lineplay',
  'travel mode': 'travel_mode', 'home hunt': 'travel_mode',
  'stamp book': 'stamps', 'stamps': 'stamps',
  'supplies': 'supplies', 'ads': 'bonus_ads', 'bonus ads': 'bonus_ads', 'vip': 'vip',
};

/** Map any visible name ("Coins", "Park Tickets", "Keys") to its glossary term. */
export function glossaryKeyForName(name: string | null | undefined): GlossaryKey | null {
  if (typeof name !== 'string') return null;
  const normal = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normal) return null;
  if (isGlossaryKey(normal)) return normal;
  return NAME_ALIASES[normal] ?? null;
}

/** "You have 377 Shark Coins" style line for a sheet opened from a balance. */
export function balanceLine(term: Pick<GlossaryTerm, 'label'>, count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return `You have ${countText(Math.max(0, Math.floor(count)))} ${term.label}.`;
}
