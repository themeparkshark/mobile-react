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
import { TREATS_PER_TICKET, type FreeTicketStep } from './freeTickets';

/** What the card's one button does. */
export type GuideAction =
  | 'go'            // draw the dotted path to the target and follow it
  | 'lineplay'      // open LinePlay for the target's line
  | 'claim'         // claim the earned Tickets in place
  | 'play'          // PLAY! (free try or extra try): the same button as the map's PLAY!
  | 'see_ways'      // the free ways to a Ticket
  | 'level_up'      // open the coin card to level it up
  | 'shelf'         // the park shelf
  | 'plan'          // home: open the shelf to plan the next park day
  | 'skip';         // Line story: pick another coin (the guide moves on to the next one)

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
  /** The ticket-to-coin picture that points at PLAY! (the Here state). */
  readonly pointsAtPlay: boolean;
  /** The screen-reader sentence for the whole card. */
  readonly a11y: string;
}

export interface GuideCopyContext {
  readonly parkName: string | null;
  /** Rides known closed right now (the resting message names them as resting). */
  readonly ridesResting: boolean;
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
}

/** "40 m", "1.2 km"; rounded to 5 m so the number does not flicker while walking. */
export function guideDistance(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(5, Math.round(meters / 5) * 5)} m`;
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
  const leaving = target?.reason === 'leaves_soon' ? leavesLine(target.leavesOn) : null;
  const base = { secondary: null, dots: ctx.adventureDots, pointsAtPlay: false } as const;
  const kickerFor = () => target?.reason === 'adventure' || target?.reason === 'line_story' ? 'TODAY\'S ADVENTURE'
    : target?.reason === 'chosen' ? 'YOUR NEXT COIN'
      : target?.reason === 'star_rush' ? 'SHORT WAIT'
        : target?.reason === 'leaves_soon' ? 'LIMITED COIN' : 'NEXT COIN';
  const card = (copy: Omit<GuideCardCopy, 'secondary' | 'dots' | 'pointsAtPlay' | 'a11y'> & Partial<GuideCardCopy>): GuideCardCopy => {
    const out = { ...base, ...copy } as GuideCardCopy;
    const a11y = copy.a11y ?? [out.kicker, out.title, out.line, out.button ? `Button: ${out.button.label}` : null]
      .filter(Boolean).join('. ');
    return { ...out, a11y };
  };

  switch (state) {
    case 'home': {
      const shelf = ctx.shelf;
      const meter = ctx.treatsToTicket && ctx.treatsToTicket > 0
        ? `${ctx.treatsToTicket} more ${ctx.treatsToTicket === 1 ? 'treat' : 'treats'} = 1 Ticket` : `${TREATS_PER_TICKET} treats = 1 Ticket`;
      return card({
        kicker: 'NEXT PARK DAY',
        title: ctx.parkName ? `${ctx.parkName}: ${tickets(ctx.tickets)} ready` : `${tickets(ctx.tickets)} ready`,
        line: ctx.planName ? `Next coin: ${ctx.planName}. ${meter}` : shelf && shelf.total > 0
          ? `Your shelf: ${shelf.owned} of ${shelf.total}. ${meter}` : meter,
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
        button: target ? { label: 'GO', action: 'go' } : { label: 'PLAN', action: 'plan' },
        dots: null,
      });
    }
    case 'arrive':
      return card({
        kicker: `WELCOME TO ${park.toUpperCase()}!`,
        title: target ? `First coin: ${name}` : 'Every ride has a coin',
        line: [far, running].filter(Boolean).join(' · ') || null,
        button: target ? { label: 'GO', action: 'go' } : null,
      });
    case 'walk':
      return card({
        kicker: kickerFor(),
        title: name,
        line: [far, leaving, running].filter(Boolean).join(' · ') || null,
        button: null,
      });
    case 'here':
      return card({
        kicker: kickerFor(),
        title: 'You\'re here! Tap PLAY!',
        line: name,
        button: null,
        pointsAtPlay: true,
      });
    case 'line_story':
      return card({
        kicker: 'TODAY\'S ADVENTURE',
        title: `Play ${name}'s line story`,
        line: far && target && !target.inRange ? far : null,
        button: { label: 'LINEPLAY', action: 'lineplay' },
        secondary: { label: 'Pick another coin', action: 'skip' },
      });
    case 'in_line':
      return card({
        kicker: 'IN LINE?',
        title: `In line for ${name}?`,
        line: 'Your wait powers its coin',
        button: { label: 'LINEPLAY', action: 'lineplay' },
      });
    case 'claim': {
      const n = ctx.freeStep?.kind === 'claim' ? ctx.freeStep.tickets : 0;
      return card({
        kicker: 'FREE TICKETS',
        title: `${n} free ${n === 1 ? 'Ticket is' : 'Tickets are'} waiting`,
        line: name ? `Then win ${name}` : null,
        button: { label: 'CLAIM', action: 'claim' },
      });
    }
    case 'free_try':
      return card({
        kicker: 'FREE TRY',
        title: 'Today\'s free try is ready',
        line: name || null,
        button: { label: 'PLAY!', action: 'play', badge: 'gift' },
      });
    case 'extra_try':
      return card({
        kicker: 'EXTRA TRY',
        title: 'Use an extra try',
        line: name || null,
        button: { label: 'PLAY!', action: 'play', badge: 'ticket' },
      });
    case 'need_ticket': {
      const lines = [`${TREATS_PER_TICKET} treats at home = 1 Ticket.`, 'Tomorrow brings a new free try.'];
      if (ctx.queueTicketsOn) lines.push('Your first wait at a ride earns a Ticket.');
      return card({
        kicker: 'NEED A TICKET',
        title: name ? `Next coin: ${name}` : 'Out of Tickets',
        line: lines.join(' '),
        button: ctx.queueTicketsOn ? { label: 'LINEPLAY', action: 'lineplay' } : { label: 'SEE WAYS', action: 'see_ways' },
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
    case 'resting':
    default:
      if (ctx.allOwned) {
        return card({ kicker: park.toUpperCase(), title: 'Every coin here is on your shelf!', line: 'Level them up from your shelf',
          button: { label: 'SHELF', action: 'shelf' }, dots: null });
      }
      return card({
        kicker: ctx.ridesResting ? 'RIDES ARE RESTING' : park.toUpperCase(),
        title: ctx.ridesResting ? 'The park is closed' : 'Nothing to win right here',
        line: 'See you next park day',
        button: { label: 'SHELF', action: 'shelf' },
        dots: null,
      });
  }
}

/**
 * The resting message when the target is a sight while rides rest: "Rides are resting. Sights stay
 * open: Walt Statue, 60 m". The card keeps its walk or here state; only the words change.
 */
export function restingSightCopy(copy: GuideCardCopy, target: GuideTarget | null, ridesResting: boolean): GuideCardCopy {
  if (!target || target.reason !== 'nearest_sight' || !ridesResting) return copy;
  const far = guideDistance(target.meters);
  return {
    ...copy,
    kicker: 'RIDES ARE RESTING',
    title: `Sights stay open: ${target.name}`,
    line: target.inRange ? 'You\'re here! Tap PLAY!' : far,
    a11y: `Rides are resting. Sights stay open: ${target.name}${far ? `, ${far}` : ''}.`,
  };
}
