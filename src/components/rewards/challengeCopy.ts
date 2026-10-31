/**
 * Words for PLAY! and the challenge card (core loop blueprint 4.5 and 5.3),
 * kept pure so they are testable. One word per thing: PLAY! is the action,
 * "Win the X coin" is the card title, "Free try" is only the daily gift,
 * "Extra tries" are held passes, Tickets are Tickets, treats are home pickups.
 * No emoji, no em dashes.
 */
import {
  freeTicketSteps, needTicketLines, nextFreeTicket, orderClaimSources,
  type ClaimSource, type FreeTicketStep,
} from '../../services/guide/freeTickets';

/** The ribbon fits about this many letters before its words shrink too small to read (about 15 pt on an SE). */
export const RIBBON_MAX_CHARS = 30;

/** A coin's name inside a sentence: "the Sword in the Stone", never "the The Sword in the Stone". */
export function coinName(name: string | null | undefined): string {
  const clean = String(name ?? '').trim();
  return clean.replace(/^the\s+/i, '');
}

/**
 * The challenge card's title: "Win the Walt Statue coin". A long name keeps
 * the short title ("Win this coin") on the ribbon; the coin's own name sits
 * under its picture. Secret coins say so.
 */
export function challengeTitle(taskType: 'task' | 'secret_task' | null, name?: string | null): string {
  if (taskType === 'secret_task') return 'Win the secret coin';
  const short = coinName(name);
  const full = short ? `Win the ${short} coin` : 'Win this coin';
  return full.length <= RIBBON_MAX_CHARS ? full : 'Win this coin';
}

/** The punch card's line: "This ride's game", then "Win the X coin!" under the game's name. */
export function punchLines(rideName: string | null | undefined): { kicker: string; win: string } {
  const short = coinName(rideName);
  return { kicker: "THIS RIDE'S GAME", win: short ? `Win the ${short} coin!` : 'Win this coin!' };
}

/** The badge on PLAY! when the player has no Ticket: the daily gift or a held extra try. */
export type PlayBadge = 'free_try' | 'extra_try' | null;

export function playBadge(input: {
  tickets: number; ticketCost: number;
  rescueAvailable: boolean | undefined; rescueSource: string | null | undefined;
  /** Earned Tickets waiting to be claimed. They come first (blueprint 4.1), so no free-try gift while any wait. */
  claimable?: number | null;
}): PlayBadge {
  if ((Number(input.tickets) || 0) >= Math.max(1, Number(input.ticketCost) || 1)) return null;
  if (input.rescueAvailable !== true) return null;
  if ((Number(input.claimable) || 0) > 0) return null;
  return input.rescueSource === 'daily' ? 'free_try' : 'extra_try';
}

/** What the server says about passes for this coin, turned into the free-Tickets contract input. */
export interface ChallengeWallet {
  readonly tickets: number;
  readonly ticketCost: number;
  /** Earned Tickets waiting to be claimed (stamps first). */
  readonly claimable: readonly ClaimSource[];
  readonly rescueAvailable: boolean;
  /** 'daily' (today's free try), 'held' or 'held_retry' (an extra try). */
  readonly rescueSource: string | null | undefined;
  readonly heldPasses: number;
  readonly queueTicketsOn: boolean;
}

/** The free ways to play this coin right now, in the one fixed order (claim, free try, extra tries, line Ticket, treats). */
export function challengeFreeSteps(wallet: ChallengeWallet): FreeTicketStep[] {
  const daily = wallet.rescueAvailable && wallet.rescueSource === 'daily';
  const held = wallet.rescueAvailable && wallet.rescueSource !== 'daily' ? Math.max(1, wallet.heldPasses) : 0;
  return freeTicketSteps({
    tickets: wallet.tickets >= wallet.ticketCost ? wallet.tickets : 0,
    claimable: wallet.claimable,
    freeTryReady: daily,
    extraTries: held,
    queueTicketsOn: wallet.queueTicketsOn,
  });
}

/** The one step the card's big button does at 0 Tickets (null while the player can pay). */
export function challengeNextStep(wallet: ChallengeWallet): FreeTicketStep | null {
  if (wallet.tickets >= wallet.ticketCost) return null;
  const daily = wallet.rescueAvailable && wallet.rescueSource === 'daily';
  const held = wallet.rescueAvailable && wallet.rescueSource !== 'daily' ? Math.max(1, wallet.heldPasses) : 0;
  return nextFreeTicket({
    tickets: 0,
    claimable: wallet.claimable,
    freeTryReady: daily,
    extraTries: held,
    queueTicketsOn: wallet.queueTicketsOn,
  });
}

/** The big button's words for each state of the card. */
export function challengeButtonLabel(step: FreeTicketStep | null, ticketCost: number): string {
  if (!step) return ticketCost > 1 ? `PLAY! ${ticketCost} Tickets` : 'PLAY!';
  switch (step.kind) {
    case 'claim': return `Claim ${step.tickets} free Ticket${step.tickets === 1 ? '' : 's'}`;
    case 'free_try': return 'PLAY! Free try';
    case 'extra_try': return 'PLAY! Extra try';
    default: return 'Ways to get Tickets';
  }
}

/** The short line under the button for each free step (pictures carry the rest). */
export function challengeStepLine(step: FreeTicketStep | null): string | null {
  if (!step) return null;
  switch (step.kind) {
    case 'claim': return 'You earned these. Claim them right here, then play.';
    case 'free_try': return 'Today’s free try. Miss, and you get one more try.';
    case 'extra_try': return step.count > 1 ? `You have ${step.count} extra tries.` : 'You have 1 extra try.';
    default: return null;
  }
}

/** The "Need a Ticket" lines (treats at home, tomorrow's free try, the line Ticket only while it is on). */
export function needTicketCopy(queueTicketsOn: boolean, freeTryUsedToday: boolean): { title: string; lines: string[] } {
  const lines = needTicketLines(queueTicketsOn);
  return {
    title: 'NEED A TICKET?',
    lines: freeTryUsedToday ? lines : lines.filter(line => !/free try/i.test(line)),
  };
}

/** Stamps with Tickets to claim, from the Stamp Book (earned, not yet claimed), stamps first. */
export function stampClaimSources(stamps: readonly {
  id: number; is_earned: boolean; reward_claimed: boolean; rewards?: { tickets?: number } | null;
}[] | null | undefined): ClaimSource[] {
  return orderClaimSources((stamps ?? [])
    .filter(stamp => stamp.is_earned && !stamp.reward_claimed && Number(stamp.rewards?.tickets) > 0)
    .map(stamp => ({ kind: 'stamp' as const, id: stamp.id, tickets: Number(stamp.rewards?.tickets) })));
}
