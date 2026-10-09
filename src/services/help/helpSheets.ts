/**
 * The "?" help sheets: one short visual explainer per screen.
 *
 * Every "?" in the app opens the same HelpSheet (src/components/help/HelpSheet.tsx).
 * A sheet is 1 to 3 pages. Each page is one idea: a hero (a small live picture
 * of the real screen, made from the art players already see), a headline of
 * 5 words or fewer, and up to 3 points of 12 words or fewer, each led by an icon.
 *
 * Pure data, no art (HelpHero maps `hero` keys to scenes). No emoji, no em dashes.
 * Facts here match the screen they open over; anything a server decides (prizes,
 * odds) is described without a number unless the number comes from the server.
 */
import type { GameIconName } from '../../ui/iconNames';

export type HelpHeroKey =
  | 'standings_climb' | 'standings_podium' | 'standings_boards'
  | 'pins_swap' | 'pins_clock'
  | 'shop_gear' | 'shop_daily' | 'shop_supplies'
  | 'park_shelf' | 'park_levels'
  | 'redeem_chest'
  | 'social_share' | 'social_safe'
  | 'basics_map' | 'basics_park' | 'basics_line'
  | 'term' | 'odds' | 'rules';

export interface HelpPoint {
  readonly icon: GameIconName;
  readonly text: string;
}

export interface HelpPage {
  readonly key: string;
  readonly hero: HelpHeroKey;
  readonly headline: string;
  readonly points: readonly HelpPoint[];
}

export type HelpSheetId = 'standings' | 'pins' | 'shop' | 'park' | 'park_map' | 'redeem' | 'social' | 'basics';

export interface HelpSheetSpec {
  readonly id: string;
  /** What the sheet is about, for VoiceOver ("Standings help"). */
  readonly name: string;
  readonly pages: readonly HelpPage[];
}

/** Brevity rules, checked by tools/tests/help-sheets.test.cjs. */
export const HELP_LIMITS = { pages: 3, points: 3, pointWords: 12, headlineWords: 5 } as const;

/** How long a picked pin is held for you (the server's default hold, see pinTradeModel). */
const PIN_HOLD_MINUTES = 2;

export const HELP_SHEETS: Readonly<Record<HelpSheetId, HelpSheetSpec>> = {
  standings: {
    id: 'standings', name: 'Standings',
    pages: [
      { key: 'climb', hero: 'standings_climb', headline: 'Win rides, climb up',
        points: [
          { icon: 'ride', text: 'Every ride challenge you win is 1 point.' },
          { icon: 'retry', text: 'Each ride counts once per park day.' },
          { icon: 'timer', text: 'A new week starts every Monday.' },
        ] },
      { key: 'podium', hero: 'standings_podium', headline: 'Top 3 win prizes',
        points: [
          { icon: 'crown', text: 'The top 3 each week earn a title.' },
          { icon: 'ticket', text: 'They get bonus Tickets too.' },
          { icon: 'star', text: 'Hit your weekly goals for extra XP.' },
        ] },
      { key: 'boards', hero: 'standings_boards', headline: 'Three ways to rank',
        points: [
          { icon: 'timer', text: 'This Week: rides won this week.' },
          { icon: 'heart', text: 'Friends: you and your friends.' },
          { icon: 'trophy', text: 'All-Time: every ride coin you own.' },
        ] },
    ],
  },
  pins: {
    id: 'pins', name: 'Pin Trading',
    pages: [
      { key: 'swap', hero: 'pins_swap', headline: 'Swap pins with fans',
        points: [
          { icon: 'star', text: 'Pick a pin you like on the board.' },
          { icon: 'swap', text: 'Give one of your pins for it.' },
          { icon: 'gift', text: 'The new pin is yours to keep.' },
        ] },
      { key: 'clock', hero: 'pins_clock', headline: 'Take your time',
        points: [
          { icon: 'timer', text: `Your pick is saved for ${PIN_HOLD_MINUTES} minutes.` },
          { icon: 'retry', text: 'Trade as many times as you like.' },
          { icon: 'lock', text: 'Trades are final, so pick a favorite.' },
        ] },
    ],
  },
  shop: {
    id: 'shop', name: 'Shark Shop',
    pages: [
      { key: 'gear', hero: 'shop_gear', headline: 'Dress up your shark',
        points: [
          { icon: 'coin', text: 'Spend Shark Coins on gear.' },
          { icon: 'shark', text: 'Try it on before you buy.' },
          { icon: 'heart', text: 'Tap the heart to save it for later.' },
        ] },
      { key: 'daily', hero: 'shop_daily', headline: 'New gear every day',
        points: [
          { icon: 'new', text: 'Fresh pieces land on the Daily shelf.' },
          { icon: 'timer', text: 'Some pieces leave, so grab favorites early.' },
        ] },
      { key: 'supplies', hero: 'shop_supplies', headline: 'Supplies are for grown-ups',
        points: [
          { icon: 'ticket', text: 'Packs of Tickets, Energy and more.' },
          { icon: 'lock', text: 'A grown-up buys them with real money.' },
          { icon: 'play', text: 'Bonus ads are optional. Skipping costs nothing.' },
        ] },
    ],
  },
  park: {
    id: 'park', name: 'Park shelf',
    pages: [
      { key: 'shelf', hero: 'park_shelf', headline: 'Your ride coin shelf',
        points: [
          { icon: 'ride', text: 'Win a ride challenge to earn its coin.' },
          { icon: 'coin', text: 'Every coin from this park lands here.' },
          { icon: 'search', text: 'Secret coins hide off the map.' },
        ] },
      { key: 'levels', hero: 'park_levels', headline: 'Level up your coins',
        points: [
          { icon: 'coin', text: 'Tap a coin to level it up.' },
          { icon: 'parts', text: 'Use Energy and that ride\'s Ride Parts.' },
          { icon: 'queue', text: 'Earn Ride Parts waiting in that ride\'s line.' },
        ] },
    ],
  },
  park_map: {
    id: 'park_map', name: 'Park map',
    pages: [
      { key: 'coins', hero: 'basics_park', headline: 'Win ride coins',
        points: [
          { icon: 'map', text: 'Ride coins wait at the rides on the map.' },
          { icon: 'ticket', text: 'Walk up and tap Play Ride. One Ticket, one try.' },
          { icon: 'coin', text: 'Win to put the coin on your shelf.' },
        ] },
      { key: 'line', hero: 'basics_line', headline: 'Line time pays',
        points: [
          { icon: 'queue', text: 'Start LinePlay when you join a ride\'s line.' },
          { icon: 'parts', text: 'Time near the ride earns its Ride Parts.' },
          { icon: 'star', text: 'Mini-games are bonus fun while you wait.' },
        ] },
    ],
  },
  redeem: {
    id: 'redeem', name: 'Redeem',
    pages: [
      { key: 'code', hero: 'redeem_chest', headline: 'Got a coin code?',
        points: [
          { icon: 'edit', text: 'Type the code, then tap Done.' },
          { icon: 'gift', text: 'Win coins, Tickets, Energy or gear.' },
          { icon: 'timer', text: 'Each code works once. Some end fast.' },
        ] },
    ],
  },
  social: {
    id: 'social', name: 'Shark Social',
    pages: [
      { key: 'share', hero: 'social_share', headline: 'Share your park day',
        points: [
          { icon: 'edit', text: 'Tap the pencil to post.' },
          { icon: 'ride', text: 'Rides, snacks, outfits and collections.' },
          { icon: 'heart', text: 'React to the posts you love.' },
        ] },
      { key: 'safe', hero: 'social_safe', headline: 'Kind and safe',
        points: [
          { icon: 'heart', text: 'Nice words only. Mean posts get removed.' },
          { icon: 'lock', text: 'Never share your name, address, school or phone.' },
          { icon: 'info', text: 'See something bad? Tap the dots, then Report.' },
        ] },
    ],
  },
  basics: {
    id: 'basics', name: 'How to play',
    pages: [
      { key: 'home', hero: 'basics_map', headline: 'Hunt at home',
        points: [
          { icon: 'map', text: 'Snacks and treasures pop up near you.' },
          { icon: 'ticket', text: 'Catch them for Tickets and Energy.' },
        ] },
      { key: 'park', hero: 'basics_park', headline: 'Win at the park',
        points: [
          { icon: 'ride', text: 'Spend a Ticket on a ride challenge.' },
          { icon: 'coin', text: 'Win to put that ride\'s coin on your shelf.' },
        ] },
    ],
  },
};

/**
 * The old "?" buttons pass an information-modal id (src/models/information-modal-enums.ts).
 * Server text for those ids was written for older boards (Park Coins, XP, 5 coin tiers),
 * so the sheet always uses the local pages, which match the screens as they are today.
 */
export const INFO_MODAL_SHEETS: Readonly<Record<number, HelpSheetId>> = {
  1: 'pins',
  2: 'park',
  3: 'shop',
  4: 'social',
  5: 'standings',
};

export function helpSheet(id: HelpSheetId): HelpSheetSpec {
  return HELP_SHEETS[id];
}

export function helpSheetForInfoModal(id: number | null | undefined, fallback: HelpSheetId = 'basics'): HelpSheetSpec {
  const sheetId = id != null ? INFO_MODAL_SHEETS[id] : undefined;
  return HELP_SHEETS[sheetId ?? fallback];
}

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const EM_DASH = String.fromCharCode(0x2014);

/** Problems with a sheet's copy (empty when it follows the rules). Used by tests and dev builds. */
export function helpSheetProblems(sheet: HelpSheetSpec): string[] {
  const problems: string[] = [];
  if (sheet.pages.length < 1 || sheet.pages.length > HELP_LIMITS.pages) problems.push(`${sheet.id}: 1 to ${HELP_LIMITS.pages} pages`);
  sheet.pages.forEach(page => {
    const where = `${sheet.id}/${page.key}`;
    if (wordCount(page.headline) > HELP_LIMITS.headlineWords) problems.push(`${where}: headline over ${HELP_LIMITS.headlineWords} words`);
    if (page.points.length > HELP_LIMITS.points) problems.push(`${where}: over ${HELP_LIMITS.points} points`);
    page.points.forEach(point => {
      if (wordCount(point.text) > HELP_LIMITS.pointWords) problems.push(`${where}: "${point.text}" over ${HELP_LIMITS.pointWords} words`);
    });
    for (const text of [page.headline, ...page.points.map(point => point.text)]) {
      if (EMOJI.test(text)) problems.push(`${where}: emoji in "${text}"`);
      if (text.includes(EM_DASH)) problems.push(`${where}: em dash in "${text}"`);
    }
  });
  return problems;
}
