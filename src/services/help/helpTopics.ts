/**
 * How to play content: one short card per feature, the one-time tip lines,
 * and the how-to card for each mini-game. Pure data, no art (the screen maps
 * `art` keys to images), no em dashes.
 */
import type { GlossaryKey, HelpTopicId } from './glossary';
import type { TipId } from './seenTips';

export interface HelpTopic {
  readonly id: HelpTopicId;
  readonly title: string;
  /** Two short sentences at most per line, two lines at most. */
  readonly lines: readonly string[];
  readonly terms: readonly GlossaryKey[];
  readonly art: HelpArtKey;
}

export type HelpArtKey = 'finn' | 'churro' | 'park' | 'coin' | 'lineplay' | 'level' | 'stamps' | 'teams' | 'standings' | 'shop' | 'extras';

export const HELP_TOPICS: readonly HelpTopic[] = [
  { id: 'basics', title: 'The basics', art: 'finn',
    lines: [
      'At home, grab finds on the map to stock up Park Tickets and Energy.',
      'At a park, spend a Ticket on a ride challenge to win that ride\'s coin.',
    ],
    terms: ['coins', 'tickets', 'energy', 'xp', 'daily_chest', 'day_streak'] },
  { id: 'home', title: 'Hunting at home', art: 'churro',
    lines: [
      'Finds pop up near you and leave after a while. Walk until one is inside your grab zone, then tap it.',
      'Pick a Park goal so your next park day starts with a plan.',
    ],
    terms: ['home_finds', 'travel_mode', 'sets', 'park_goal'] },
  { id: 'park', title: 'At the park', art: 'park',
    lines: [
      'The map switches to the park when you arrive. Ride coins wait at the rides.',
      'Tap your shark in the bottom corner to see this park\'s coin shelf and Coin Guide.',
    ],
    terms: ['ride_coins', 'ride_passport', 'coin_guide', 'limited_coins', 'adventure_ticket', 'keys'] },
  { id: 'ride_challenge', title: 'Ride challenges', art: 'coin',
    lines: [
      'Walk up to a ride coin and tap Play Ride. One Ticket buys one try at a quick mini-game.',
      'Win and the coin joins your shelf. When you run out of Tickets, a Rescue Pass gives one free try at a new coin each park day.',
    ],
    terms: ['ride_challenge', 'tickets', 'rescue_pass'] },
  { id: 'lineplay', title: 'LinePlay', art: 'lineplay',
    lines: [
      'Start LinePlay when you get in a ride\'s line, from Wait Times or the card on the map.',
      'Time near the ride earns its Ride Parts. The games are bonus fun, so look up when the line moves.',
    ],
    terms: ['lineplay', 'ride_parts', 'crew'] },
  { id: 'coins_levels', title: 'Leveling up coins', art: 'level',
    lines: [
      'Tap a coin on your park shelf to open its card. Spend Energy and that ride\'s Ride Parts to level it up.',
      'There are 10 levels, from Classic to Shark Crown, and each one changes the coin\'s look.',
    ],
    terms: ['coin_levels', 'ride_parts', 'energy'] },
  { id: 'collections', title: 'Sets and stamps', art: 'stamps',
    lines: [
      'Every home find fills a set. Finished sets pay Energy, Tickets, XP and a title.',
      'Stamps mark your milestones. Open Collections or the Stamp Book from the menu.',
    ],
    terms: ['sets', 'stamps'] },
  { id: 'teams', title: 'Teams and Ride Control', art: 'teams',
    lines: [
      'Pick one of three teams. Your ride wins claim rides for your team on the park map.',
      'Swords from the park map let you attack another team at a park gym.',
    ],
    terms: ['ride_control', 'swords'] },
  { id: 'standings', title: 'Standings', art: 'standings',
    lines: [
      'This Week counts rides you win, each ride once a day. A new week starts every Monday.',
      'Friends races you and your friends. All-Time shows who has collected the most ride coins.',
    ],
    terms: ['standings'] },
  { id: 'shop', title: 'Shark Shop, Supplies and ads', art: 'shop',
    lines: [
      'Gear dresses your shark with Shark Coins. Supplies sells Tickets, Shark Coins, Energy and Rescue Passes, and lists exactly what each pack holds.',
      'Bonus ads are always optional: watch one for a free daily Ticket or a small boost. VIP players skip the ad.',
    ],
    terms: ['supplies', 'bonus_ads', 'vip', 'coins'] },
  { id: 'extras', title: 'More to explore', art: 'extras',
    lines: [
      'Shark Park is a side game with its own money. Pins come from Pin Packs and Pin Trading.',
      'Ask for help any time from Settings.',
    ],
    terms: ['shark_park', 'pins'] },
];

export function helpTopic(id: HelpTopicId | string | null | undefined): HelpTopic | null {
  return HELP_TOPICS.find(topic => topic.id === id) ?? null;
}

/**
 * The old "?" buttons ask the server for an information modal by id. When the
 * server has no text, the matching local card fills the sheet instead.
 * Ids from src/models/information-modal-enums.ts.
 */
export const INFO_MODAL_TOPICS: Readonly<Record<number, readonly HelpTopicId[]>> = {
  1: ['extras'],                         // Pin Trading
  2: ['park', 'coins_levels'],           // Park shelf
  3: ['shop'],                           // Shark Shop (Gear and Supplies)
  4: ['extras', 'basics'],               // Social
  5: ['standings'],                      // Standings
};

export interface TipCopy { readonly title: string; readonly body: string }

/** One line each. Finn says these once, at the moment they happen. */
export const TIP_COPY: Readonly<Record<Exclude<TipId, `game:${string}`>, TipCopy>> = {
  park_hud: { title: 'You\'re at the park!',
    body: 'Ride coins wait at the rides. Tap any balance up top to learn what it does, or tap your shark to see your coin shelf.' },
  coin_in_range: { title: 'A ride coin is in range',
    body: 'Tap Play Ride! One Ticket buys one try at a quick game. Win it to add the coin to your shelf.' },
  ride_challenge: { title: 'How a ride challenge works',
    body: 'Spend a Ticket to start. A quick mini-game picks itself. Win and this coin is yours, plus the rewards shown here.' },
  lineplay_intro: { title: 'Welcome to LinePlay',
    body: 'Stay near the ride and your time in line earns its Ride Parts. Games are bonus fun. Look up when the line moves.' },
  first_ride_part: { title: 'Your first Ride Part!',
    body: 'Ride Parts belong to this ride. Spend them with Energy to level up its coin on your shelf.' },
  coin_card: { title: 'Level up your coin',
    body: 'Each level costs Energy plus this ride\'s Ride Parts. Higher levels change the coin\'s look.' },
  supplies_tab: { title: 'Welcome to Supplies',
    body: 'Packs of Tickets, Coins, Energy and Rescue Passes. Each one shows exactly what you get. Ride Parts are never sold.' },
  bonus_ads: { title: 'Bonus ads are optional',
    body: 'Watch a short ad for a small extra, like a free Ticket or double coins. Skip it and you lose nothing.' },
  first_level_up: { title: 'First level up!',
    body: 'Keep going: there are 10 levels, all the way to Shark Crown.' },
};

/** Mini-game types the selector can start. */
export type MiniGameKind = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'banana' | 'photo' | 'current';

interface GameIntro { readonly name: string; readonly how: string; readonly win: string }

export const GAME_INTROS: Readonly<Record<MiniGameKind, GameIntro>> = {
  tap: { name: 'Whack-a-Shark', how: 'Bonk the sharks inside the ring. Never bonk the anglerfish.', win: 'Bonk enough sharks before the timer runs out.' },
  timing: { name: 'Parade Beat', how: 'Tap the drum as each note reaches the line. Blue is the middle, coral is the side.', win: 'Hit 3 of every 4 beats.' },
  memory: { name: 'Memory Match', how: 'Flip two cards at a time to find pairs.', win: 'Match every pair to win.' },
  trivia: { name: 'Trivia', how: 'Tap your answer, then let go to lock it in. Faster right answers score more.', win: 'Right answers earn the stars.' },
  shark: { name: 'Sharky Swim', how: 'Hold to swim up, let go to sink. Skim close for big points.', win: 'Reach the finish with hearts left.' },
  banana: { name: 'Banana Basket', how: 'Slide the basket to catch the bananas and keep the beach ball up.', win: 'Catch as many as you can.' },
  photo: { name: 'Snap the Ride', how: 'Line up the shot and snap it before time runs out.', win: 'A good snap wins.' },
  current: { name: 'Current Quest', how: 'Swipe to swim. Currents carry you along.', win: 'Reach the chest before your strokes run out.' },
};

export function gameIntroTip(kind: string): TipId {
  return `game:${kind}`;
}

export interface HelpSheetSection { readonly key: string; readonly title: string; readonly lines: readonly string[] }

/**
 * What a screen's "?" sheet shows: the server's text when it has any, then the
 * matching How to play cards, so the sheet is never empty or stuck loading.
 */
export function infoSheetSections(id: number | null | undefined, serverContent?: unknown): HelpSheetSection[] {
  const topics = (id != null && INFO_MODAL_TOPICS[id]) || ['basics'];
  const sections: HelpSheetSection[] = [];
  const server = typeof serverContent === 'string'
    ? serverContent.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim() : '';
  if (server) {
    sections.push({ key: 'server', title: 'Good to know',
      lines: server.split(/\n+/).map(line => line.trim().replace(/\s*—\s*/g, ', ')).filter(Boolean) });
  }
  topics.forEach(topicId => {
    const topic = helpTopic(topicId);
    if (topic) sections.push({ key: topic.id, title: topic.title, lines: topic.lines });
  });
  return sections;
}
