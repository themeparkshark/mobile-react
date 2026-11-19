/**
 * Fix w4 T102: a player level-up has a moment where it happens. Every path that learns of one (the server's
 * "You reached Level 3!" line on any reward answer, a stamp claim's levels_gained) notes it here; the app's one host
 * (components/rewards/LevelUpMoment) shows a short pictured toast that points to the Level Chest when one waits.
 * The same level is never announced twice in one app run. Pure queue (no React here).
 */
export const LEVEL_UP_MESSAGE = /^You reached Level (\d+)!$/i;

let announced = 0;
let queue: number[] = [];
const listeners = new Set<() => void>();

/** The level in a "You reached Level N!" line, or null. */
export function levelFromMessage(message: unknown): number | null {
  if (typeof message !== 'string') return null;
  const m = LEVEL_UP_MESSAGE.exec(message.trim());
  const level = m ? Number(m[1]) : NaN;
  return Number.isFinite(level) && level > 1 ? level : null;
}

/** Note a level reached. A level at or below one already announced this run is ignored. */
export function noteLevelUp(level: number | null | undefined): void {
  if (typeof level !== 'number' || !Number.isFinite(level) || level <= 1 || level <= announced) return;
  announced = Math.floor(level);
  queue = [...queue.filter(l => l < announced), announced];
  listeners.forEach(listener => { try { listener(); } catch { /* one bad listener never stops the rest */ } });
}

/**
 * The banner path's split: level lines become moments, everything else stays a banner (useAxiosSetup routes the
 * banner list through here, so a level-up held behind a win card waits with the rest and shows when it lets go).
 */
export function takeLevelUps(messages: readonly string[]): string[] {
  const rest: string[] = [];
  for (const message of messages) {
    const level = levelFromMessage(message);
    if (level) noteLevelUp(level); else rest.push(message);
  }
  return rest;
}

/** The newest level waiting for its moment (older ones fold into it), or null. */
export function takeLevelMoment(): number | null {
  const level = queue.length ? queue[queue.length - 1] : null;
  queue = [];
  return level;
}

export function onLevelUp(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The toast line. With a Level Chest waiting it says where it is. */
export function levelUpLine(level: number, chestWaits: boolean): string {
  return chestWaits ? `Level ${level}! Your Level ${level} Chest is in Rewards` : `You reached Level ${level}!`;
}

/** Tests only. */
export function resetLevelUpsForTests(): void {
  announced = 0;
  queue = [];
  listeners.clear();
}
