/**
 * One word per thing (core loop blueprint 4.5), for copy the app builds from data.
 *
 * The vocabulary test (tools/tests/vocabulary.test.cjs) catches retired words in string literals;
 * these helpers cover the words a screen assembles at run time (a reward amount, a server line, a
 * route name), so a gate walk never meets "+25 coins", "find 2 snacks", "+120 pass points" or
 * "then Explore" again (fix round after the first gate, items 16 to 18).
 */

/** What a reward amount is called on a card: the money is Shark Coins, never "coins" beside ride coins. */
export type RewardKind = 'coins' | 'tickets' | 'energy' | 'parts';

const REWARD_WORDS: Record<RewardKind, readonly [one: string, many: string]> = {
  coins: ['Shark Coin', 'Shark Coins'],
  tickets: ['Ticket', 'Tickets'],
  energy: ['Energy', 'Energy'],
  parts: ['Ride Part', 'Ride Parts'],
};

/** "Shark Coins", "Ticket", "Energy": the reward's own word for this amount. */
export function rewardWord(kind: RewardKind, amount: number): string {
  const [one, many] = REWARD_WORDS[kind];
  return amount === 1 ? one : many;
}

/**
 * A server line as a kid reads it. The server still calls the home pickup "snacks" or "home finds"
 * ("or find 2 snacks", "Grab 8 home finds"); the app calls them treats everywhere. Food words
 * ("Snack Stand", "a snack in line") are left alone: only a counted snack or a home find changes.
 */
export function kidWords(text: string): string {
  const cap = (m: string, word: string) => (m[0] === m[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word);
  return text
    .replace(/\bhome finds\b/gi, m => cap(m, 'treats'))
    .replace(/\bhome find\b/gi, m => cap(m, 'treat'))
    .replace(/\b(\d+) (more )?snacks\b/gi, (_m, n: string, more: string | undefined) => `${n} ${more ?? ''}treats`)
    .replace(/\b(\d+) (more )?snack\b/gi, (_m, n: string, more: string | undefined) => `${n} ${more ?? ''}treat`)
    .replace(/\b(find|grab|catch) snacks\b/gi, (_m, verb: string) => `${verb} treats`)
    .replace(/\bhome snacks?\b/gi, m => cap(m, /s$/i.test(m) ? 'treats' : 'treat'));
}

/**
 * What a Shark Pass gain says. The pass shows steps ("Step 4 of 50"), never points: a gain of whole
 * steps says how many, and a part of a step says the pass climbs (a kid cannot read "+120 pass points").
 */
export function passGainWords(points: number, pointsPerStep: number | null | undefined, each = false): string | null {
  if (!(points > 0)) return null;
  const per = Number(pointsPerStep) > 0 ? Number(pointsPerStep) : 0;
  if (per > 0 && points % per === 0) {
    const steps = points / per;
    const line = `+${steps} Shark Pass ${steps === 1 ? 'step' : 'steps'}`;
    return each ? `${line} each` : line;
  }
  return each ? 'Each one climbs your Shark Pass' : 'Climbs your Shark Pass';
}

/** The pass screen's "since last time" line: "+1 Shark Pass step since last time!" or "Your Shark Pass climbed since last time!". */
export function passSinceLine(points: number, pointsPerStep: number | null | undefined): string | null {
  const words = passGainWords(points, pointsPerStep);
  if (!words) return null;
  return words.startsWith('+') ? `${words} since last time!` : 'Your Shark Pass climbed since last time!';
}

/** A footer tab's own name (the label under its icon), never the route's internal name ("Explore"). */
export function tabWord(route: string): string {
  switch (route) {
    case 'Explore': return 'the Map';
    case 'Leaderboard': return 'Standings';
    default: return route;
  }
}
