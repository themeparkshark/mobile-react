/**
 * How to play content: one short card per feature, the one-time tip lines,
 * and the how-to card for each mini-game. Pure data, no art (the screen maps
 * `art` keys to images), no em dashes.
 */
import { AD_AUDIENCE_13_PLUS_KNOWN } from '../adConfig';
import type { GlossaryKey, HelpTopicId } from './glossary';
import type { TipId } from './seenTips';

/** Ads are talked about only when some player can see one. Today nobody can. */
export const ADS_IN_HELP = AD_AUDIENCE_13_PLUS_KNOWN;

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
      'Every ride has a coin. Walk up, tap PLAY!, win it and it lands on your park shelf.',
      'At home, catch treats on the map: every 3 treats make 1 Ticket for your next park day.',
    ],
    terms: ['coins', 'tickets', 'energy', 'xp', 'daily_chest', 'day_streak'] },
  { id: 'home', title: 'Hunting at home', art: 'churro',
    lines: [
      'Treats pop up on the map near you. Walk close, then tap one to catch it.',
      'Each find leaves after a while, so catch it while you can.',
    ],
    terms: ['home_finds', 'travel_mode', 'sets', 'park_goal'] },
  { id: 'park', title: 'At the park', art: 'park',
    lines: [
      'The map switches to the park when you arrive. Ride coins wait at the rides.',
      'Tap your shark in the bottom corner. You\'ll see this park\'s coin shelf and Coin Guide.',
    ],
    terms: ['ride_coins', 'ride_passport', 'coin_guide', 'limited_coins', 'adventure_ticket', 'keys'] },
  { id: 'ride_challenge', title: 'Win ride coins', art: 'coin',
    lines: [
      'Walk up to a ride coin and tap PLAY! One Ticket gets you one quick game.',
      'Win and the coin lands on your shelf. Out of Tickets, claim the ones you earned, then use today\'s free try.',
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
  // No help text talks about ads while no player can see one (AD_AUDIENCE_13_PLUS_KNOWN, adConfig.ts).
  ADS_IN_HELP ? { id: 'shop', title: 'Shark Shop, Supplies and ads', art: 'shop',
    lines: [
      'Use coins to buy gear for your shark. Supplies are packs a grown-up buys with real money.',
      'Bonus ads are always optional. Watch one for a free Ticket or a small boost, and VIP members skip the ad.',
    ],
    terms: ['supplies', 'bonus_ads', 'vip', 'coins'] }
    : { id: 'shop', title: 'Shark Shop and Supplies', art: 'shop',
    lines: [
      'Use coins to buy gear for your shark. Supplies are packs a grown-up buys with real money.',
      'You never need real money to win a ride coin.',
    ],
    terms: ['supplies', 'vip', 'coins'] },
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

/**
 * The LinePlay Welcome tip's line, told from what the wait card really shows, so the tip never
 * promises Ride Parts beside "No Parts at this ride" (honesty, wave 6):
 * - 'on': this wait earns Parts (the card shows the Parts ring): the full line.
 * - 'none': this ride pays no Parts (the card says so): games only, no Parts promise.
 * - 'unknown': still checking (location, server): a line that is true either way.
 */
export type LinePartsState = 'on' | 'none' | 'unknown';
export const LINEPLAY_INTRO_BODY: Readonly<Record<LinePartsState, string>> = {
  on: 'Stay near the ride and your time in line earns Ride Parts. Games are bonus fun. Look up when the line moves.',
  none: 'Play games while you wait. This ride has no Parts yet. Look up when the line moves.',
  unknown: 'Play games while you wait. Look up when the line moves.',
};

/** One line each. Finn says these once, at the moment they happen. */
export const TIP_COPY: Readonly<Record<Exclude<TipId, `game:${string}`>, TipCopy>> = {
  // The map's shark finder button (FollowButton draws its own bubble from FOLLOW_COPY; this is the record).
  map_compass: { title: 'Map spin', body: 'The map spins with you. Tap to keep it still.' },
  // One short line: it shows over the map on the first park frame, so a 7-year-old reads it at a glance.
  park_hud: { title: 'You\'re at the park!', body: 'Walk to a ride to win its coin.' },
  // Matches the button word for word (PLAY!); the card shows a ticket, an arrow and the coin
  // instead of this line, which VoiceOver reads.
  coin_in_range: { title: 'Tap PLAY!', body: 'One Ticket gets one try. Win the ride coin!' },
  ride_challenge: { title: 'One Ticket, one game',
    body: 'Tap PLAY! to spend a Ticket. Win the game to win this coin.' },
  // LinePlay passes the line that matches its wait card (LINEPLAY_INTRO_BODY); this is the Parts-on default.
  lineplay_intro: { title: 'Welcome to LinePlay',
    body: 'Stay near the ride and your time in line earns Ride Parts. Games are bonus fun. Look up when the line moves.' },
  first_ride_part: { title: 'Your first Ride Part!',
    body: 'Ride Parts belong to this ride. Spend them with Energy to level up its coin on your shelf.' },
  coin_card: { title: 'Level up your coin',
    body: 'Each level costs Energy and this ride\'s Ride Parts. Higher levels give the coin a new look.' },
  supplies_tab: { title: 'Welcome to Supplies',
    body: 'Packs of Tickets, Shark Coins, Energy and extra tries. Each one shows what you get.' },
  bonus_ads: { title: 'Bonus ads are optional',
    body: 'Watch a short ad for a small extra, like a free Ticket or more coins. Skip it and you lose nothing.' },
  first_level_up: { title: 'First level up!',
    body: 'Every level gives your coin a new look. Fill all the dots to max it out!' },
};

/** Mini-game types the selector can start. */
export type MiniGameKind = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'banana' | 'photo' | 'current';

interface GameIntro { readonly name: string; readonly how: string; readonly win: string }

export const GAME_INTROS: Readonly<Record<MiniGameKind, GameIntro>> = {
  tap: { name: 'Whack-a-Shark', how: 'Bonk the sharks. Never bonk the anglerfish.', win: 'Fill the meter before time runs out.' },
  timing: { name: 'Parade Beat', how: 'Tap the drum when a note hits the line.', win: 'Hit 3 of every 4 beats.' },
  memory: { name: 'Memory Match', how: 'Flip two cards. Find the pairs.', win: 'Match every pair to win.' },
  trivia: { name: 'Trivia', how: 'Tap the right answer.', win: 'Right answers earn the stars.' },
  shark: { name: 'Sharky Swim', how: 'Hold to swim up. Let go to sink.', win: 'Reach the finish with hearts left.' },
  banana: { name: 'Banana Basket', how: 'Slide to catch bananas. Bounce the ball.', win: 'Catch as many as you can.' },
  photo: { name: 'Snap the Ride', how: 'Line up the shot and snap it before time runs out.', win: 'A good snap wins.' },
  current: { name: 'Current Quest', how: 'Swipe to swim. Currents carry you.', win: 'Reach the chest.' },
};

export function gameIntroTip(kind: string): TipId {
  return `game:${kind}`;
}
