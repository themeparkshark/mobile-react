/**
 * What the Next Coin guide card says in each state (core loop blueprint 4.1 and 4.5, October 2026).
 *
 * One card, one target, one button. Pure and import-light so the words are unit-tested and the
 * vocabulary test can read them: PLAY!, Tickets, treats, LinePlay, Line story, Today's Adventure,
 * Level up, Shark Coins. Distances are said in meters, dates in words (never a ticking clock),
 * and the line Ticket sentence shows only while queue_tickets is on.
 * Owned by the guide-map lane (src/services/guide/**).
 */
import type { GuideState, GuideTarget } from './nextCoin';
import { shortParkName } from '../../helpers/parkName';
import { plainRideName } from '../../helpers/plainRideName';
import { treatMeterLine, type FreeTicketStep } from './freeTickets';

/** What the card's one button does. */
export type GuideAction =
  | 'go'            // draw the dotted path to the target and follow it
  | 'lineplay'      // open LinePlay for the target's line
  | 'lineplay_here' // open LinePlay for the line the player is standing in (the in-line offer, T074)
  | 'claim'         // claim the earned Tickets in place
  | 'see_ways'      // the free ways to a Ticket
  | 'level_up'      // open the coin card to level it up
  | 'shelf'         // the park shelf
  | 'plan'          // home: open the shelf to plan the next park day
  | 'unfold'        // Today's Adventure souvenir: open its sheet and unfold the souvenir
  | 'skip'          // Line story or souvenir: pick another coin (the guide moves on to the next one)
  | 'story'         // Goodbye: the shelf of the park you just left, with today's park story on top
  | 'near_me'       // NEAR ME: every coin not yet won, one identical row each (the player picks)
  | 'get_tickets'   // the Get Tickets sheet (free ways first)
  | 'clear'         // the X on YOUR PICK: clear the player's own pick
  | 'ok';           // the arrive card's OK: the welcome is read

export interface GuideButton {
  readonly label: string;
  readonly action: GuideAction;
  /** A small picture on the button: the gift for today's free try, the ticket-gift for an extra try. */
  readonly badge?: 'gift' | 'ticket' | null;
}

export interface GuideCardCopy {
  /** Small line above the title (the park name chip sits beside it on park maps). */
  readonly kicker: string;
  readonly title: string;
  /** One short line under the title, or null. */
  readonly line: string | null;
  readonly button: GuideButton | null;
  /** A second, quiet choice (only the Line story state: "Pick another coin"). */
  readonly secondary: GuideButton | null;
  /** Today's Adventure stamps (win its coin, play its line story, celebrate the ride), when the target is its ride. */
  readonly dots: readonly [boolean, boolean, boolean] | null;
  /** The ticket-to-coin picture that points at PLAY! (the Here, free try and extra try states). */
  readonly pointsAtPlay: boolean;
  /** The free try's gift or the extra try's ticket, drawn on the pointer (the try PLAY! will use). */
  readonly badge?: 'gift' | 'ticket' | null;
  /** The screen-reader sentence for the whole card. */
  readonly a11y: string;
  /** YOUR PICK: the X that clears the player's own pick. */
  readonly clear?: GuideButton | null;
  /** The target's served price as Ticket pictures (filled up to the wallet); null hides them. */
  readonly pips?: { readonly price: number; readonly held: number | null } | null;
  /** The park's shelf and the next shelf gift ("9 of 40 · 1 more: +3 Tickets"); the bar only when the gift is served. */
  readonly shelfBar?: ShelfBar | null;
  /** The arrive card's three pictures: tap a coin, walk there, PLAY!. */
  readonly howTo?: boolean;
}

/** The park's shelf for the card: coins won of coins here, and the next shelf gift when the arcade server pays one. */
export interface ShelfBar {
  readonly won: number;
  readonly total: number;
  /** The next gift step (a multiple of 5), or null when no shelf gift is served (today's server). */
  readonly nextAt: number | null;
  readonly tickets: number;
}

/** Every 5th coin won at a park pays 3 Tickets on the arcade server (PLAN section 4). */
export const SHELF_GIFT_EVERY = 5;
export const SHELF_GIFT_TICKETS = 3;

/**
 * The shelf bar from what is known: the server's own shelf_gift when an answer carried one, else the count on the
 * map, with the next step worked out only while the arcade economy is on (today's server pays no shelf gift). Pure.
 */
export function shelfBarFor(input: {
  readonly won: number; readonly total: number; readonly arcade: boolean;
  readonly served?: { readonly won?: unknown; readonly total?: unknown; readonly next_at?: unknown; readonly tickets?: unknown } | null;
}): ShelfBar | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const served = input.served;
  const won = num(served?.won) ?? Math.max(0, Math.floor(input.won));
  const total = num(served?.total) ?? Math.max(0, Math.floor(input.total));
  if (!(total > 0)) return null;
  const servedNext = num(served?.next_at);
  const nextAt = servedNext != null && servedNext > won ? servedNext
    : input.arcade || servedNext != null ? (Math.floor(won / SHELF_GIFT_EVERY) + 1) * SHELF_GIFT_EVERY : null;
  return { won: Math.min(won, total), total, nextAt: nextAt != null && nextAt <= total ? nextAt : null,
    tickets: num(served?.tickets) ?? SHELF_GIFT_TICKETS };
}

/** The park shelf header's gift line: "1 more: +3 Tickets", or null when no gift is served. */
export function shelfGiftHeaderLine(bar: ShelfBar | null | undefined): string | null {
  return bar && bar.nextAt != null ? `${bar.nextAt - bar.won} more: +${bar.tickets} Tickets` : null;
}

/** "9 of 40 coins · 1 more: +3 Tickets", or "9 of 40 coins". */
export function shelfBarLine(bar: ShelfBar | null | undefined): string | null {
  if (!bar) return null;
  const count = `${bar.won} of ${bar.total} ${bar.total === 1 ? 'coin' : 'coins'}`;
  if (bar.nextAt == null) return count;
  return `${count} · ${bar.nextAt - bar.won} more: +${bar.tickets} Tickets`;
}

export interface GuideCopyContext {
  readonly parkName: string | null;
  /** No ride is known open and some are known closed: the park is resting (closed for the night). */
  readonly ridesResting: boolean;
  /** Coins are left to win, but every one is farther than the guide points (1.5 km): head back in. */
  readonly outOfReach?: boolean;
  /** Every coin in this park is already on the player's shelf. */
  readonly allOwned: boolean;
  readonly tickets: number;
  /** The free step the wallet offers now (claim, free try, extra try, line Ticket, treats). */
  readonly freeStep: FreeTicketStep | null;
  readonly queueTicketsOn: boolean;
  /** Today's Adventure stamps when the target is the Adventure ride, else null. */
  readonly adventureDots: readonly [boolean, boolean, boolean] | null;
  /** Home and welcome back: the next park day's shelf. */
  readonly shelf?: { readonly owned: number; readonly total: number } | null;
  /** Home: treats still to find for the next Ticket (1 to 3). */
  readonly treatsToTicket?: number | null;
  /** Home: the coin planned for the next park day, if any. */
  readonly planName?: string | null;
  /** Home: a coin on the shelf with the Ride Parts and Energy to level up now (after coin levels unlock). */
  readonly levelUpName?: string | null;
  /**
   * Line story: the player stands in (or by) the Adventure ride's line, where its story can open
   * (the Adventure sheet's own play gate). False: the card walks them there first (GO). Default true.
   */
  readonly lineStoryNear?: boolean;
  /**
   * Today's Adventure step the Line story state is on: 'play' (its line story) or 'celebrate'
   * (its souvenir, after the line story is played). Default 'play'.
   */
  readonly adventureStep?: 'play' | 'celebrate' | null;
  /** This park was already welcomed today: the arrive window never says "Welcome to ..." again (fix W1 item 10). */
  readonly welcomed?: boolean;
  /** Coins the player already owns in this park: a veteran is never told it is their first. */
  readonly ownedHere?: number;
  /**
   * PLAY! is up on the map right now. PLAY! is the one gold button then: the card's own button steps down to a
   * quiet link (fix W1 item 9, "In line? LINEPLAY never beside PLAY!").
   */
  readonly playUp?: boolean;
  /** Today's free try exists for this player (its switch is on). Off: the card never promises one tomorrow. */
  readonly freeTryDaily?: boolean;
  /** Goodbye: the park the player is leaving and the coins they won there today. */
  readonly leaving?: { readonly parkName: string | null; readonly coins: number } | null;
  /** PLAY! took the card for a coin in passing: the coin the card goes back to once the player walks on (T003, T008). */
  readonly thenName?: string | null;
  /** The guide moved on because the coin it held closed (T008): that coin's name, said in one line while it stays closed. */
  readonly replacedName?: string | null;
  /** The park's shelf and next shelf gift (shelfBarFor), for the "pick any coin" and welcome back cards. */
  readonly shelfBar?: ShelfBar | null;
  /** Tickets the park day gift paid at this check-in (the arcade server's welcome_tickets_granted), else null. */
  readonly parkGiftTickets?: number | null;
  /** The target coin's served price (task.ticket_cost), or null when the server sends none. */
  readonly targetPrice?: number | null;
  /** The arcade server is on (flags.arcade_economy): it pays the park day gift every day, so the card may say so. */
  readonly arcade?: boolean;
}

/** Within this many meters of its coin, PLAY! is about to rise: the card says "Almost there" (T009), never a number. */
export const ALMOST_THERE_METERS = 16;

/**
 * The in-line offer (T074): standing about 90 s in an open ride line puts "In line? LINEPLAY" on the card as its
 * own picture button under whatever the card says (PLAY!, the path, a pick), feed or no feed, owned coin or not.
 * It never replaces the card, so the card never flips between Tap PLAY! and In line?. Null when the card already
 * is about this line (the in-line or Line story state). Pure.
 */
export function lineOffer(state: string, dwellRideName: string | null | undefined): { readonly title: string; readonly label: string } | null {
  if (!dwellRideName || state === 'in_line' || state === 'line_story' || state === 'goodbye' || state === 'home') return null;
  // N14: the offer names the line it means (two queues can overlap), in the plain display name.
  return { title: `In line for ${plainRideName(dwellRideName)}?`, label: 'LINEPLAY' };
}

/**
 * A tapped queue ride (T078): its callout makes it the guide's target, and the card offers PLAY IN LINE as the
 * white LinePlay picture button, one tap from the map (Wait Times is no longer the only way in). Only for a ride
 * with a real line (the queue catalog resolved it) and while the card is about that ride. Pure.
 */
export function calloutLineOffer(queueRide: { readonly rideId: number } | null | undefined, selectedTaskId: number | null,
  targetTaskId: number | null, state: string): { readonly title: string; readonly label: string; readonly action: GuideAction } | null {
  if (!queueRide || !(queueRide.rideId > 0) || selectedTaskId == null || selectedTaskId !== targetTaskId) return null;
  if (state === 'in_line' || state === 'line_story' || state === 'goodbye' || state === 'home') return null;
  return { title: '', label: 'PLAY IN LINE', action: 'lineplay' };
}

/**
 * One gold button per screen (fix W1 item 9): while PLAY! is up, the card's own gold button becomes its quiet
 * link (or goes, when a quiet link is already there). Pure.
 */
export function oneGoldButton(copy: GuideCardCopy, playUp: boolean): GuideCardCopy {
  if (!playUp || !copy.button) return copy;
  return { ...copy, button: null, secondary: copy.secondary ?? { ...copy.button, badge: null } };
}

/** The park's everyday name (one helper app-wide, src/helpers/parkName.ts). */
export { shortParkName };

/** "40 m", "1.2 km"; rounded to 5 m so the number does not flicker while walking. */
export function guideDistance(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(5, Math.round(meters / 5) * 5)} m`;
}

/** "Jungle Cruise's", and "Soarin's" for a name that already ends in an apostrophe (never "Soarin''s"). */
export function possessive(name: string): string {
  const trimmed = name.trim();
  return /['\u2019]$/.test(trimmed) ? `${trimmed}s` : `${trimmed}'s`;
}

/** The PLAY! range a tapped coin's callout counts down to (the server's redeem radius, 16 m). */
export const CALLOUT_RANGE_METERS = 16;

/**
 * A tapped coin's distance line (core loop 4.1, must-fix 18): "Walk closer: 40 m" until PLAY! can
 * rise, then "You're here". A coin already on your shelf just says how far it is.
 */
export function calloutDistance(meters: number, owned: boolean): string {
  const far = guideDistance(meters) ?? '';
  if (owned) return far;
  return meters <= CALLOUT_RANGE_METERS ? 'You\'re here' : `Walk closer: ${far}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A limited coin's last day in words: "leaves Saturday, Oct 31". Never a countdown. */
export function leavesLine(leavesOn: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(leavesOn ?? ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return `leaves ${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

const tickets = (n: number) => `${n} ${n === 1 ? 'Ticket' : 'Tickets'}`;

/** The card's words for one state. Pure. */
export function guideCardCopy(state: GuideState, target: GuideTarget | null, ctx: GuideCopyContext): GuideCardCopy {
  const park = ctx.parkName ?? 'the park';
  const name = target?.name ?? '';
  const far = guideDistance(target?.meters ?? null);
  const running = target?.checkRunning ? 'Check it\'s running' : null;
  const leaving = target?.leavesOn ? leavesLine(target.leavesOn) : null;
  const base = { secondary: null, dots: ctx.adventureDots, pointsAtPlay: false } as const;
  // One title per state on every phone (T004): TODAY'S ADVENTURE only on today's Adventure ride, always with its stamp
  // dots, whatever set the pointer there (the guide, the ticket's FIND THIS COIN, a Wait Times pick).
  // Every target is the player's own (Dustin, Nov 20): YOUR PICK, or where they stand. never a coin the app chose.
  const kickerFor = () => ctx.adventureDots ? 'TODAY\'S ADVENTURE'
    : target?.reason === 'parts' ? 'GET RIDE PARTS'
      : target?.reason === 'in_range' || target?.reason === 'in_line' ? 'READY TO PLAY' : 'YOUR PICK';
  const price = typeof ctx.targetPrice === 'number' && Number.isFinite(ctx.targetPrice) && ctx.targetPrice > 0 ? Math.floor(ctx.targetPrice) : null;
  const pips = target && price != null ? { price, held: Number.isFinite(ctx.tickets) ? ctx.tickets : null } : null;
  const clear: GuideButton | null = target && target.source !== 'guide' && target.reason !== 'in_range' && target.reason !== 'in_line'
    && target.reason !== 'line_story' ? { label: 'Clear my pick', action: 'clear' } : null;
  const shelfLine = shelfBarLine(ctx.shelfBar);
  const card = (copy: Omit<GuideCardCopy, 'secondary' | 'dots' | 'pointsAtPlay' | 'a11y'> & Partial<GuideCardCopy>): GuideCardCopy => {
    const out = { ...base, ...copy } as GuideCardCopy;
    // Joined into sentences without doubling a stop ("PARK!. " or "U.S.A.. ").
    const a11y = copy.a11y ?? [out.kicker, out.title, out.line, out.button ? `Button: ${out.button.label}` : null]
      .filter(Boolean).map(String).reduce((all, part) =>
        (all ? `${all}${/[.!?]$/.test(all) ? '' : '.'} ${part}` : part), '');
    return { ...out, a11y };
  };

  switch (state) {
    case 'home': {
      const shelf = ctx.shelf;
      const meter = treatMeterLine(ctx.treatsToTicket);
      // Tonight's real goal first (fix round W1 item 17): a coin that can level up now says so, and the one
      // button opens it. Otherwise the plan, the shelf and the ticket meter, as before.
      if (ctx.levelUpName) {
        return card({
          kicker: 'READY TO LEVEL UP',
          title: `Level up ${ctx.levelUpName}!`,
          line: `Ride Parts and Energy ready. ${meter}`,
          button: { label: 'LEVEL UP', action: 'level_up' },
          dots: null,
        });
      }
      return card({
        kicker: 'NEXT PARK DAY',
        title: ctx.parkName ? `${ctx.parkName}: ${tickets(ctx.tickets)} ready` : `${tickets(ctx.tickets)} ready`,
        // PLAN plans (T016): with no coin planned yet the line says what the button does.
        line: ctx.planName ? `Your pick: ${ctx.planName}. ${meter}` : `Tap your shelf to pick a coin. ${meter}`,
        button: { label: 'PLAN', action: 'plan' },
        dots: null,
      });
    }
    case 'welcome_back': {
      const shelf = ctx.shelf;
      return card({
        kicker: 'WELCOME BACK!',
        title: shelf && shelf.total > 0 ? `Your ${park} shelf: ${shelf.owned} of ${shelf.total}` : `Your ${park} shelf is waiting`,
        line: `${tickets(ctx.tickets)} ready`,
        // The shelf is the player's own place to pick from: never GO to a coin the app holds.
        button: { label: 'SHELF', action: 'shelf' },
        dots: null,
      });
    }
    case 'arrive': {
      // The park day gift and how to play (tap any coin, walk there, PLAY!): the app names no ride (Dustin, Nov 20).
      const gift = typeof ctx.parkGiftTickets === 'number' && ctx.parkGiftTickets > 0 ? Math.floor(ctx.parkGiftTickets) : null;
      return card({
        // One welcome per visit: a relaunch or a return to the same park today just names the park.
        kicker: ctx.welcomed ? shortParkName(ctx.parkName).toUpperCase() : `WELCOME TO ${shortParkName(ctx.parkName).toUpperCase()}!`,
        title: gift ? `+${tickets(gift)}: your park day gift` : target ? `Your pick: ${name}` : 'Every ride has a coin. Pick one!',
        line: gift && target ? `Your pick: ${name}` : null,
        button: { label: 'OK', action: 'ok' },
        howTo: true,
        pips: gift ? null : pips,
        dots: null,
      });
    }
    case 'goodbye': {
      const n = Math.max(0, ctx.leaving?.coins ?? 0);
      const left = shortParkName(ctx.leaving?.parkName ?? ctx.parkName);
      return card({
        kicker: `GREAT DAY AT ${left.toUpperCase()}!`,
        title: n > 0 ? `${n} ${n === 1 ? 'coin' : 'coins'} won today` : 'See you next park day',
        line: 'Your park day story is on your shelf',
        button: { label: 'SHELF', action: 'story' },
        dots: null,
      });
    }
    case 'walk': {
      // A few steps out, PLAY! is about to rise: "Almost there", never "5 m" with no button (T009).
      const almost = target?.meters != null && target.meters <= ALMOST_THERE_METERS ? 'Almost there' : null;
      // YOUR PICK: the coin the player chose, how far, its price as Ticket pictures, and X to clear it.
      return card({
        kicker: kickerFor(),
        title: name,
        line: [almost ?? far, leaving, running].filter(Boolean).join(' · ') || null,
        button: null,
        clear,
        pips,
      });
    }
    case 'here':
      // Standing at the coin, PLAY! is the answer even with no live word yet: a small "Check it's running" (T014).
      // A coin in passing says where the card goes next, so the change back is never a surprise (T003, T008).
      // No line about a later coin: the card never names where to go after this coin (Dustin, Nov 20).
      return card({
        kicker: kickerFor(),
        title: `You're at ${name}`,
        line: ['Tap PLAY!', running].filter(Boolean).join(' · '),
        button: null,
        pointsAtPlay: true,
        pips,
      });
    case 'line_story': {
      // Step 3: the line story is played, so the souvenir waits. It unfolds anywhere (no walk).
      if (ctx.adventureStep === 'celebrate') {
        return card({
          kicker: 'TODAY\'S ADVENTURE',
          title: `Unfold your ${name} souvenir`,
          line: null,
          button: { label: 'UNFOLD', action: 'unfold' },
          secondary: { label: 'Pick another coin', action: 'skip' },
        });
      }
      // Its story opens in its line (the Adventure sheet's play gate); farther away, GO walks there first.
      const near = ctx.lineStoryNear !== false;
      return card({
        kicker: 'TODAY\'S ADVENTURE',
        title: `Play ${possessive(name)} line story`,
        line: near ? (far && target && !target.inRange ? far : null) : ['Walk to its line', far].filter(Boolean).join(' · '),
        button: near ? { label: 'LINEPLAY', action: 'lineplay' } : { label: 'GO', action: 'go' },
        secondary: { label: 'Pick another coin', action: 'skip' },
      });
    }
    case 'in_line':
      return card({
        kicker: 'YOUR WAIT',
        title: `In line for ${name}?`,
        line: ctx.queueTicketsOn ? 'Your wait earns its Parts and 1 Ticket' : 'Your wait earns its Ride Parts',
        button: { label: 'LINEPLAY', action: 'lineplay' },
      });
    case 'claim': {
      const n = ctx.freeStep?.kind === 'claim' ? ctx.freeStep.tickets : 0;
      return card({
        // Fix w3 T126: earned Tickets come from stamps, and say so in one word everywhere ("stamp Tickets").
        kicker: 'STAMP TICKETS',
        title: `${n} stamp ${n === 1 ? 'Ticket is' : 'Tickets are'} waiting`,
        line: null,
        button: { label: 'CLAIM', action: 'claim' },
      });
    }
    // The map's own PLAY! starts the try: the card points at it (like the Here state), never a second button.
    case 'free_try':
      return card({
        kicker: 'FREE TRY',
        title: 'Free try! Tap PLAY!',
        line: name || null,
        button: null,
        pointsAtPlay: true,
        badge: 'gift',
      });
    case 'extra_try':
      return card({
        kicker: 'EXTRA TRY',
        title: 'Extra try! Tap PLAY!',
        line: name || null,
        button: null,
        pointsAtPlay: true,
        badge: 'ticket',
      });
    case 'need_ticket': {
      // An empty wallet names no ride: "0 Tickets" and the one sheet of free ways (Get Tickets).
      const ways = [ctx.queueTicketsOn ? '10 minutes in a ride line earns a Ticket.' : null, 'Treats at home earn Tickets.',
        ctx.arcade ? 'Tomorrow at any park: +3.' : null].filter(Boolean).join(' ');
      return card({
        kicker: 'TICKETS',
        title: '0 Tickets',
        line: ways,
        button: { label: 'GET TICKETS', action: 'get_tickets' },
        dots: null,
      });
    }
    case 'level_up':
      return card({
        kicker: 'LEVEL UP',
        title: `${name} is ready to level up`,
        line: null,
        button: { label: 'LEVEL UP', action: 'level_up' },
        dots: null,
      });
    case 'pick':
    case 'resting':
    default:
      if (ctx.allOwned) {
        return card({ kicker: park.toUpperCase(), title: 'Every coin here is on your shelf!', line: 'Level them up from your shelf',
          button: { label: 'SHELF', action: 'shelf' }, dots: null });
      }
      if (ctx.outOfReach && !ctx.ridesResting) {
        return card({ kicker: park.toUpperCase(), title: 'Head back into the park', line: 'The coins wait by the rides',
          button: { label: 'SHELF', action: 'shelf' }, dots: null });
      }
      // Rides resting for the night: no ride and no sight named; NEAR ME lists what is open (sights always are).
      if (ctx.ridesResting) {
        return card({ kicker: 'RIDES ARE RESTING', title: 'Sights stay open', line: shelfLine,
          button: { label: 'NEAR ME', action: 'near_me' }, dots: null, shelfBar: ctx.shelfBar ?? null });
      }
      // Nothing picked: one goal that names no ride, the park's count, and NEAR ME (Dustin, Nov 20).
      return card({
        kicker: park.toUpperCase(),
        title: 'Win any ride coin',
        line: shelfLine ?? 'Tap any coin to pick it',
        button: { label: 'NEAR ME', action: 'near_me' },
        dots: null,
        shelfBar: ctx.shelfBar ?? null,
      });
  }
}

/** Retired (Nov 20): the resting card names no sight. Returns the card unchanged. */
export function restingSightCopy(copy: GuideCardCopy, target: GuideTarget | null, ridesResting: boolean): GuideCardCopy {
  // The guide never picks a sight any more (Dustin, Nov 20), so a sight target is always the player's own pick:
  // its card stays as it is. Kept so older callers compile; it changes nothing.
  void target; void ridesResting;
  return copy;
}

/** The card's kicker with the park's name on the same line ("YOUR PICK · DISNEYLAND"); home and arrive keep theirs. Pure. */
export function cardKicker(kicker: string, parkName: string | null, state: GuideState): string {
  if (!parkName || state === 'arrive') return kicker;
  const park = parkName.toUpperCase();
  return kicker.includes(park) ? kicker : `${kicker} · ${park}`;
}
