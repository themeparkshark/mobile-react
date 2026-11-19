/**
 * A request that shows its own reward moment (the Watch page's +25 coin
 * modal, the daily chest's flying coins and ticket punch) marks itself with
 * QUIET_COIN_BROADCAST, so the server's matching "You earned 25 coins!" or
 * "You earned 1 Ticket!" banner is not shown a second time (or, worse, slid in
 * behind the chest while it is still opening). Every other broadcast in the
 * same response (level ups, unlocks, XP) still shows.
 */
export const QUIET_COIN_BROADCAST = 'quietCoinBroadcast';

// The server says "You earned 25 coins!" (HasCurrency) and older copy said "Shark Coins"; tickets the same way.
// "You won a ride coin!" lands over the map a beat before the win card says the same thing (core loop row 329).
// Fix W3 T068: a win's "You earned 1 Main Street U.S.A. Ride Parts!" is on the win card's reward row now, so it folds too.
const COIN_EARNED = /^You earned \d+ (?:Shark )?(?:coins?|tickets?)!$|^You won a ride coin!$|^You earned \d+ .+ Ride Parts?!$/i;

export function visibleBroadcasts<T>(broadcasts: readonly T[], quietCoins: boolean): T[] {
  if (!quietCoins) return [...broadcasts];
  return broadcasts.filter(b => !(typeof b === 'string' && COIN_EARNED.test(b.trim())));
}

/**
 * Fix W3 T068: while a ride challenge plays and its win card is up, server news waits (a toast never peeks out from
 * behind the card). The challenge holds the line; when it lets go, what waited shows, in order.
 */
let holders = 0;
let waiting: string[] = [];
let showWaiting: ((messages: string[]) => void) | null = null;
/** The win card on screen already shows this win's XP: its "You earned N XP!" never comes after it. */
let xpOnCard = false;
/**
 * The win's own reward lines the card already carries. Fix w4 T037: "You gained 10 Energy!" waited behind the
 * card and then slid in over the shelf or the map, one more stop after the win (the card shows Energy as a chip,
 * or flies it to the Shelf button before coin levels open).
 */
const XP_EARNED = /^You earned \d+ XP!$|^You gained \d+ Energy!$/i;

export function holdBroadcasts(on: boolean): void {
  holders = Math.max(0, holders + (on ? 1 : -1));
  if (holders === 0) xpOnCard = false;
  if (holders === 0 && waiting.length > 0 && showWaiting) {
    const messages = waiting;
    waiting = [];
    showWaiting(messages);
  }
}

/**
 * The held win card shows this win's XP on its reward row (+25 XP): the server's own XP line for it, which
 * names only part of that total ("You earned 10 XP!" after a +25 XP card), is folded, like its coins and Parts.
 * The win's Energy line folds the same way (fix w4 T037). Only while the hold lasts; XP and Energy news from
 * anything else still shows.
 */
export function foldHeldXp(): void {
  if (holders === 0) return;
  xpOnCard = true;
  waiting = waiting.filter(m => !XP_EARNED.test(m.trim()));
}

/** The response interceptor sends every visible broadcast through here. */
export function routeBroadcasts(messages: readonly string[], show: (messages: string[]) => void): void {
  if (messages.length === 0) return;
  if (holders > 0) {
    waiting.push(...(xpOnCard ? messages.filter(m => !XP_EARNED.test(m.trim())) : messages));
    showWaiting = show;
    return;
  }
  show([...messages]);
}

/** Tests only. */
export function resetBroadcastHoldForTests(): void {
  holders = 0; waiting = []; showWaiting = null; xpOnCard = false;
}
