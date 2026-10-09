/**
 * One glossary for every currency, badge and game word a player meets.
 *
 * The six economy currencies come from the server (`GET /api/economy`,
 * EconomyGlossary.php) so the app and the server say the same thing. The local
 * list is the offline fallback and covers every other term. Pure data and
 * functions: safe for tests, no React, no network.
 */
import type { GameIconName } from '../../ui/iconNames';

export type GlossaryKey =
  | 'coins' | 'tickets' | 'energy' | 'ride_parts' | 'ride_coins' | 'rescue_pass'
  | 'keys' | 'swords' | 'xp' | 'coin_levels' | 'limited_coins' | 'ride_challenge'
  | 'lineplay' | 'ride_passport' | 'coin_guide' | 'adventure_ticket' | 'park_goal'
  | 'stamps' | 'sets' | 'pins' | 'home_finds' | 'crew' | 'standings' | 'daily_chest'
  | 'day_streak' | 'travel_mode' | 'ride_control' | 'vip' | 'supplies' | 'bonus_ads';

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
  { key: 'coins', label: 'Coins', icon: 'coins', topic: 'basics',
    what: 'Spend them in the Shark Shop and at the Community Center.',
    earn: 'Catch ride coins, open your daily chest and win raids.' },
  { key: 'tickets', label: 'Tickets', icon: 'ticket', topic: 'basics',
    what: 'Each ride challenge costs one Ticket.',
    earn: 'Grab home finds and open your day 7 daily chest.' },
  { key: 'energy', label: 'Energy', icon: 'energy', topic: 'basics',
    what: 'Powers boss raids and ride coin level-ups.',
    earn: 'Home finds, rides and your daily chest. It never runs out on a timer.' },
  { key: 'ride_parts', label: 'Ride Parts', icon: 'parts', topic: 'coins_levels',
    what: 'Belong to one ride. Use them to level that ride coin up.',
    earn: 'Win at that ride, or play LinePlay while you wait in its line.' },
  { key: 'ride_coins', label: 'Ride Coins', icon: 'coin', topic: 'park',
    what: 'One for each ride, show and famous spot at a park. They sit on your park shelf.',
    earn: 'Win a ride challenge at the ride.' },
  { key: 'rescue_pass', label: 'Rescue Pass', icon: 'retry', topic: 'ride_challenge',
    what: 'One more try at a ride coin you do not have yet. You get one free each park day.',
    earn: 'You get it when you run out of tickets at the park. Supplies sells them too.' },
  { key: 'keys', label: 'Keys', icon: 'lock', topic: 'park',
    what: 'Open treasure vaults on the park map.',
    earn: 'Pick up keys you spot on the park map.' },
  { key: 'swords', label: 'Swords', icon: 'swords', topic: 'teams',
    what: 'Attack another team at a park gym. One attack costs 2 Swords.',
    earn: 'Pick up swords you spot on the park map.' },
  { key: 'xp', label: 'XP', icon: 'xp', topic: 'basics',
    what: 'Points that raise your shark level.',
    earn: 'You get it for home finds, ride wins, LinePlay and chests.' },
  { key: 'coin_levels', label: 'Coin levels', icon: 'star', topic: 'coins_levels',
    what: 'Every ride coin can level up, from Level 1 to Level 10. Each level gives it a new look.',
    earn: 'Tap a coin on your park shelf. Then spend Energy and that ride\'s Ride Parts.' },
  { key: 'limited_coins', label: 'Limited coins', icon: 'timer', topic: 'park',
    what: 'Special ride coins that are only out for a while.',
    earn: 'Win the ride challenge before the date on the coin.' },
  { key: 'ride_challenge', label: 'Ride challenge', icon: 'ride', topic: 'ride_challenge',
    what: 'A quick mini-game at a ride. Win it and that ride coin goes on your shelf.',
    earn: 'Walk up to a ride coin on the park map and tap Play Ride! It costs one Ticket.' },
  { key: 'lineplay', label: 'LinePlay', icon: 'queue', topic: 'lineplay',
    what: 'Games and stories for while you wait in a ride\'s line.',
    earn: 'Start it from Wait Times or the map when you get in line. Time near the ride earns its Ride Parts.' },
  { key: 'ride_passport', label: 'Ride Passport', icon: 'coin', topic: 'park',
    what: 'Just the rides on a park\'s shelf. Catch every ride to earn its stamp.',
    earn: 'Tap your shark on the park map to see this park\'s shelf.' },
  { key: 'coin_guide', label: 'Coin Guide', icon: 'search', topic: 'park',
    what: 'The list of every ride and coin at this park.',
    earn: 'Open a park\'s shelf and scroll to Coin Guide. Search by ride name.' },
  { key: 'adventure_ticket', label: 'Adventure Ticket', icon: 'map', topic: 'park',
    what: 'A 3-step quest at one ride. Win its coin, play its LinePlay story, then celebrate.',
    earn: 'Tap the Adventure card at the top of the park map.' },
  { key: 'park_goal', label: 'Park goal', icon: 'map', topic: 'home',
    what: 'The ride coin you plan to catch next. It waits on your map when you get to the park.',
    earn: 'Open a park\'s coin shelf and tap Set Goal on the ride you want next.' },
  { key: 'stamps', label: 'Stamps', icon: 'medal1', topic: 'collections',
    what: 'Badges for milestones, like your first ride coin or a 7-day streak.',
    earn: 'See them all in your Stamp Book, from the menu or your profile.' },
  { key: 'sets', label: 'Sets', icon: 'gift', topic: 'collections',
    what: 'Every home find belongs to a set, like the Churro Collection.',
    earn: 'Finish a set to win energy, tickets, XP and a title. Open Collections from the menu.' },
  { key: 'pins', label: 'Pins', icon: 'pin', topic: 'extras',
    what: 'Collectible pins for your profile.',
    earn: 'Open Pin Packs from your profile, or swap with players in Pin Trading.' },
  { key: 'home_finds', label: 'Home finds', icon: 'gift', topic: 'home',
    what: 'Snacks and treasures that pop up on the map near you, even at home. Each one leaves after a while.',
    earn: 'Walk close to a find, then tap it to catch it.' },
  { key: 'crew', label: 'Crew', icon: 'heart', topic: 'lineplay',
    what: 'The people in line with you. Your crew plays together on one phone.',
    earn: 'In LinePlay, tap Add your crew and pass the phone.' },
  { key: 'standings', label: 'Standings', icon: 'trophy', topic: 'standings',
    what: 'Lists that rank players by ride coins, ride wins and XP.',
    earn: 'Tap Standings in the bottom bar.' },
  { key: 'daily_chest', label: 'Daily chest', icon: 'chest', topic: 'basics',
    what: 'A free chest every day. Day 7 has a Ticket inside.',
    earn: 'It opens on the home map once a day.' },
  { key: 'day_streak', label: 'Day streak', icon: 'streak', topic: 'basics',
    what: 'How many days in a row you have played.',
    earn: 'Open the game every day to keep it growing.' },
  { key: 'travel_mode', label: 'Travel Mode', icon: 'map', topic: 'home',
    what: 'You are away from a park. The map shows home finds around you.',
    earn: 'Hunt home finds now to stock up tickets and energy for your next park day.' },
  { key: 'ride_control', label: 'Teams and Ride Control', icon: 'crown', topic: 'teams',
    what: 'Three teams race to control the rides at each park.',
    earn: 'Pick a team. Your ride wins claim rides for it. Tap the team bar on the park map.' },
  { key: 'vip', label: 'VIP', icon: 'member', topic: 'shop',
    what: 'A monthly plan a grown-up buys with real money. VIP members get bigger rewards and skip bonus ads.',
    earn: 'Tap Member on the Social screen to see what VIP gives you.' },
  { key: 'supplies', label: 'Supplies', icon: 'gift', topic: 'shop',
    what: 'Packs of tickets, coins, energy and Rescue Passes. A grown-up buys them with real money.',
    earn: 'Open the Shark Shop and tap Supplies. Ride Parts, ride coins and coin levels are never sold.' },
  { key: 'bonus_ads', label: 'Bonus ads', icon: 'play', topic: 'shop',
    what: 'Short, optional ads. Each one gives a small bonus, like a free ticket.',
    earn: 'Tap a Watch button when you see one. Skipping is fine. Each one works a few times a day.' },
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
  'shark coins': 'Coins', 'shark coin': 'Coins', 'park tickets': 'Tickets', 'park ticket': 'Tickets',
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

/** Every spelling a pill, badge or server currency uses, mapped to one term. */
const NAME_ALIASES: Readonly<Record<string, GlossaryKey>> = {
  'coins': 'coins', 'coin': 'coins', 'shark coins': 'coins', 'shark coin': 'coins',
  'tickets': 'tickets', 'ticket': 'tickets', 'park tickets': 'tickets', 'park ticket': 'tickets',
  'energy': 'energy',
  'ride parts': 'ride_parts', 'ride part': 'ride_parts', 'parts': 'ride_parts', 'part': 'ride_parts',
  'lineplay parts': 'ride_parts',
  'ride coins': 'ride_coins', 'ride coin': 'ride_coins',
  'rescue pass': 'rescue_pass', 'shark rescue pass': 'rescue_pass',
  'keys': 'keys', 'key': 'keys',
  'swords': 'swords', 'sword': 'swords',
  'xp': 'xp', 'experience': 'xp',
  'day streak': 'day_streak', 'streak': 'day_streak',
  'lineplay': 'lineplay', 'line play': 'lineplay',
  'travel mode': 'travel_mode',
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

/** "You have 377 Coins" style line for a sheet opened from a balance. */
export function balanceLine(term: Pick<GlossaryTerm, 'label'>, count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return `You have ${Math.max(0, Math.floor(count)).toLocaleString('en-US')} ${term.label}.`;
}
