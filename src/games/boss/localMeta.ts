/**
 * Short-horizon goals shown locally (design v7.1 9.4, 20.6): Daily First Brawl
 * and the part-break sticker book. The client only displays them; WS6 owns the
 * real state (the daily bonus is paid server-side outside the raid cap, the
 * sticker book lives per player and boss). Until that ships, this keeps a
 * local copy so the results card can show the stamp and the book.
 */
export type StickerId = 'hat' | 'tentacle' | 'shell' | 'scale';
export const STICKERS: readonly StickerId[] = ['hat', 'tentacle', 'shell', 'scale'];

export interface BossLocalMeta {
  /** Local park day (YYYY-MM-DD) of the last Daily First Brawl. */
  dailyDay: string | null;
  /** Sticker -> local day it was first stamped. */
  stickers: Partial<Record<StickerId, string>>;
}

export function emptyMeta(): BossLocalMeta {
  return { dailyDay: null, stickers: {} };
}

/** Local calendar day for a timestamp (the park day; WS6 decides the real boundary). */
export function dayKey(ms: number, tzOffsetMin = new Date(ms).getTimezoneOffset()): string {
  const d = new Date(ms - tzOffsetMin * 60000);
  return d.toISOString().slice(0, 10);
}

/** Stickers a round earns: the first break of each part stamps a page; a Break-free finished round catches a Kraken Scale. */
export function stickersFor(breaks: number, finished: boolean): StickerId[] {
  const out: StickerId[] = [];
  if (breaks >= 1) out.push('hat');
  if (breaks >= 2) out.push('tentacle');
  if (breaks >= 3) out.push('shell');
  if (breaks === 0 && finished) out.push('scale');
  return out;
}

export interface MetaUpdate { meta: BossLocalMeta; daily: boolean; fresh: StickerId[]; owned: StickerId[] }

/** Apply one finished round (TKO included: it still counts as the day's first brawl). */
export function applyRound(prev: BossLocalMeta, day: string, breaks: number, finished: boolean): MetaUpdate {
  const meta: BossLocalMeta = { dailyDay: prev.dailyDay, stickers: { ...prev.stickers } };
  const daily = prev.dailyDay !== day;
  meta.dailyDay = day;
  const fresh: StickerId[] = [];
  for (const id of stickersFor(breaks, finished)) {
    if (!meta.stickers[id]) {
      meta.stickers[id] = day;
      fresh.push(id);
    }
  }
  const owned = STICKERS.filter((id) => !!meta.stickers[id]);
  return { meta, daily, fresh, owned };
}

export function parseMeta(raw: string | null): BossLocalMeta {
  if (!raw) return emptyMeta();
  try {
    const m = JSON.parse(raw) as Partial<BossLocalMeta>;
    return { dailyDay: typeof m.dailyDay === 'string' ? m.dailyDay : null, stickers: m.stickers && typeof m.stickers === 'object' ? m.stickers : {} };
  } catch {
    return emptyMeta();
  }
}
