/** Pure rules for the Redeem a code screen (unit tested in tools/tests/redeem-coin-code.test.cjs). */

/** Shark Drop and coin codes are 4 to 20 letters and numbers (SharkDropHandler parseDropCode). */
export const CODE_MIN = 4;
export const CODE_MAX = 20;

/** Uppercase, letters and numbers only, never longer than a real code. */
export function cleanCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_MAX);
}

export function codeReady(code: string): boolean {
  return code.length >= CODE_MIN && code.length <= CODE_MAX;
}

export interface CodeRewardItem {
  readonly name?: string | null;
  readonly icon_url?: string | null;
}

/** The server's reply: the code's own values plus `granted`, what was really added. */
export interface CodeReply {
  readonly coins?: number | null;
  readonly tickets?: number | null;
  readonly energy?: number | null;
  readonly item?: CodeRewardItem | readonly unknown[] | null;
  readonly granted?: {
    readonly coins?: number | null;
    readonly tickets?: number | null;
    readonly energy?: number | null;
    readonly item?: boolean | null;
  } | null;
}

export type RewardIcon = 'coins' | 'ticket' | 'energy' | 'gift';
export interface RewardLine {
  readonly key: string;
  readonly icon: RewardIcon;
  readonly text: string;
  /** Item art from the server, when the code unlocks an item. */
  readonly imageUrl?: string;
}

const count = (value: unknown): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function rewardItem(item: CodeReply['item']): CodeRewardItem | null {
  if (!item || Array.isArray(item) || typeof item !== 'object') return null;
  const named = item as CodeRewardItem;
  return named.name || named.icon_url ? named : null;
}

/**
 * One line per thing the code gave, in kid words. A 0-coin code (tickets,
 * energy or an item only) never shows a coin line. Prefers what the server
 * says was granted (a ticket cap can turn tickets into coins).
 */
export function codeRewardLines(reply: CodeReply | null | undefined): RewardLine[] {
  if (!reply) return [];
  const granted = reply.granted ?? null;
  const coins = count(granted ? granted.coins : reply.coins);
  const tickets = count(granted ? granted.tickets : reply.tickets);
  const energy = count(granted ? granted.energy : reply.energy);
  const item = rewardItem(reply.item);
  const lines: RewardLine[] = [];
  if (item) lines.push({ key: 'item', icon: 'gift', text: item.name ? `${item.name} unlocked!` : 'New item unlocked!',
    imageUrl: item.icon_url || undefined });
  if (coins) lines.push({ key: 'coins', icon: 'coins', text: `+${coins} ${coins === 1 ? 'coin' : 'coins'}` });
  if (tickets) lines.push({ key: 'tickets', icon: 'ticket', text: `+${tickets} ${tickets === 1 ? 'Ticket' : 'Tickets'}` });
  if (energy) lines.push({ key: 'energy', icon: 'energy', text: `+${energy} Energy` });
  return lines;
}

export const REDEEM_COPY = {
  prompt: 'Got a code? Type it here.',
  placeholder: 'CODE',
  open: 'Open the chest',
  again: 'Use another code',
  tooShort: `Codes have at least ${CODE_MIN} letters or numbers.`,
  offline: "Couldn't reach the chest. Check your signal and try again.",
  wrong: "That code didn't work. Check the letters and try again.",
  used: 'You already used this code. Each code works once.',
  usedUp: 'This code ran out. Watch for a new one!',
  dropEnded: 'This Shark Drop is over. Watch for the next one!',
  slowDown: 'Too many tries. Wait a minute, then try again.',
  done: 'Added to your shark!',
  nothing: 'Code used!',
} as const;

export interface RedeemErrorView {
  readonly message: string;
  /** A small picture for the error card. */
  readonly icon: 'retry' | 'lock' | 'timer' | 'search';
}

/**
 * A kid-readable error for a failed redeem. The server's known replies (wrong
 * code, already used, used up, Shark Drop over, too short) map to short kid
 * words. The server's own text is only used for a reply we have never seen.
 */
export function redeemError(error: unknown): RedeemErrorView {
  const response = (error as { response?: { status?: number; data?: { message?: unknown; errors?: unknown } } } | null)?.response;
  const status = Number(response?.status);
  // No reply at all (React Native reports a dropped connection as status 0).
  if (!response || !(status > 0)) return { message: REDEEM_COPY.offline, icon: 'retry' };
  const raw = typeof response.data?.message === 'string' ? response.data.message.trim() : '';
  const said = raw.toLowerCase();
  if (status === 429) return { message: REDEEM_COPY.slowDown, icon: 'timer' };
  if (status === 404 || said.includes('incorrect')) return { message: REDEEM_COPY.wrong, icon: 'search' };
  if (said.includes('already used') || said.includes('already redeemed')) return { message: REDEEM_COPY.used, icon: 'lock' };
  if (said.includes('used up')) return { message: REDEEM_COPY.usedUp, icon: 'lock' };
  if (status === 410 || said.includes('has ended')) return { message: REDEEM_COPY.dropEnded, icon: 'timer' };
  // Laravel validation (too short, too long, not letters and numbers).
  if (status === 422 && response.data?.errors) return { message: REDEEM_COPY.wrong, icon: 'search' };
  if (status >= 500) return { message: REDEEM_COPY.offline, icon: 'retry' };
  return { message: raw || REDEEM_COPY.wrong, icon: 'search' };
}

/** The message alone (see redeemError). */
export function redeemErrorMessage(error: unknown): string {
  return redeemError(error).message;
}
