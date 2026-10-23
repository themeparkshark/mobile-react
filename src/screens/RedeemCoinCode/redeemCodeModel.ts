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
  done: 'Added to your shark!',
  nothing: 'Code used!',
} as const;

/** A kid-readable message for a failed redeem. The server's own message wins when it sent one. */
export function redeemErrorMessage(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } } | null)?.response;
  const message = response?.data?.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  // No reply at all (React Native reports a dropped connection as status 0).
  if (!response || !(Number(response.status) > 0)) return REDEEM_COPY.offline;
  return REDEEM_COPY.wrong;
}
