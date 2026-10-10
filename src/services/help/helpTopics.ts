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
      'At home, grab finds on the map to get Tickets and Energy.',
      'At a park, spend a Ticket on a ride challenge to win that ride\'s coin.',
    ],
    terms: ['coins', 'tickets', 'energy', 'xp', 'daily_chest', 'day_streak'] },
  { id: 'home', title: 'Hunting at home', art: 'churro',
    lines: [
      'Snacks and treasures pop up on the map near you. Walk close, then tap one to catch it.',
      'Each find leaves after a while, so catch it while you can.',
    ],
    terms: ['home_finds', 'travel_mode', 'sets', 'park_goal'] },
  { id: 'park', title: 'At the park', art: 'park',
    lines: [
      'The map switches to the park when you arrive. Ride coins wait at the rides.',
      'Tap your shark in the bottom corner. You\'ll see this park\'s coin shelf and Coin Guide.',
    ],
    terms: ['ride_coins', 'ride_passport', 'coin_guide', 'limited_coins', 'adventure_ticket', 'keys'] },
  { id: 'ride_challenge', title: 'Ride challenges', art: 'coin',
    lines: [
      'Walk up to a ride coin and tap Play Ride. One Ticket gets you one try at a quick game.',
      'Win and the coin goes on your shelf. If you run out of Tickets, a Rescue Pass gives you one free try each park day.',
    ],
    terms: ['ride_challenge', 'tickets', 'rescue_pass'] },
  { id: 'lineplay', title: 'LinePlay', art: 'lineplay',
    lines: [
      'Start LinePlay when you get in a ride\'s line. Tap Wait Times or the card on the map.',
      'Time near the ride earns its Ride Parts. The games are bonus fun, so look up when the line moves.',
    ],
    terms: ['lineplay', 'ride_parts', 'crew'] },
  { id: 'coins_levels', title: 'Leveling up coins', art: 'level',
    lines: [
      'Tap a coin on your park shelf. Spend Energy and that ride\'s Ride Parts to level it up.',
      'There are 10 levels, from Classic to Shark Crown. Each level gives the coin a new look.',
    ],
    terms: ['coin_levels', 'ride_parts', 'energy'] },
  { id: 'collections', title: 'Sets and stamps', art: 'stamps',
    lines: [
      'Every catch fills a set in your collection book. Finish a set to win Energy, Tickets, XP and a title.',
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
      'This Week counts the rides you win, once per ride each day. A new week starts every Monday.',
      'Friends compares you and your friends. All-Time shows who has the most ride coins.',
    ],
    terms: ['standings'] },
  { id: 'shop', title: 'Shark Shop, Supplies and ads', art: 'shop',
    lines: [
      'Use coins to buy gear for your shark. Supplies are packs a grown-up buys with real money.',
      'Bonus ads are always optional. Watch one for a free Ticket or a small boost, and VIP members skip the ad.',
    ],
    terms: ['supplies', 'bonus_ads', 'vip', 'coins'] },
  { id: 'extras', title: 'More to explore', art: 'extras',
    lines: [
      'Open mystery boxes, find park pins, trade extras.',
      'Ask for help any time from Settings.',
    ],
    terms: ['pins'] },
];

export function helpTopic(id: HelpTopicId | string | null | undefined): HelpTopic | null {
  return HELP_TOPICS.find(topic => topic.id === id) ?? null;
}

export interface TipCopy { readonly title: string; readonly body: string }

/** One line each. Finn says these once, at the moment they happen. */
export const TIP_COPY: Readonly<Record<Exclude<TipId, `game:${string}`>, TipCopy>> = {
  park_hud: { title: 'You\'re at the park!',
    body: 'Ride coins wait at the rides. Tap a number up top to learn about it. Tap your shark to see your shelf.' },
  coin_in_range: { title: 'A ride coin is in range',
    body: 'Tap Play Ride! One Ticket gets you one try at a quick game. Win to add the coin to your shelf.' },
  ride_challenge: { title: 'How a ride challenge works',
    body: 'Spend a Ticket to start. The game picks itself. Win to get this coin and the prizes shown here.' },
  lineplay_intro: { title: 'Welcome to LinePlay',
    body: 'Stay near the ride and your time in line earns Ride Parts. Games are bonus fun. Look up when the line moves.' },
  first_ride_part: { title: 'Your first Ride Part!',
    body: 'Ride Parts belong to this ride. Spend them with Energy to level up its coin on your shelf.' },
  coin_card: { title: 'Level up your coin',
    body: 'Each level costs Energy and this ride\'s Ride Parts. Higher levels give the coin a new look.' },
  supplies_tab: { title: 'Welcome to Supplies',
    body: 'Packs of tickets, coins, energy and Rescue Passes. Each one shows what you get.' },
  bonus_ads: { title: 'Bonus ads are optional',
    body: 'Watch a short ad for a small extra, like a free Ticket or more coins. Skip it and you lose nothing.' },
  first_level_up: { title: 'First level up!',
    body: 'There are 10 levels, all the way up to Shark Crown.' },
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
