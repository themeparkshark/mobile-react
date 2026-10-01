/**
 * The latest rank line ("#12 Orlando Area · 340 pts") for the home map status
 * card. It is set from a redeem response (hunt_week.rank_line) or a week read,
 * and stays null, so the card shows nothing, until the server sends one.
 */
let rankLine: string | null = null;
const listeners = new Set<(line: string | null) => void>();

export function getHomeHuntRankLine(): string | null {
  return rankLine;
}

export function setHomeHuntRankLine(line: string | null | undefined): void {
  const next = typeof line === 'string' && line.trim() ? line.trim() : null;
  if (next === rankLine) return;
  rankLine = next;
  listeners.forEach(listener => listener(rankLine));
}

export function subscribeHomeHuntRankLine(listener: (line: string | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
