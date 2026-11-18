/**
 * The guide card's coin art, remembered (fix round w3 T015).
 *
 * The map's coin list carries no art, so the card took the target's picture from today's trip goal read. When that
 * read was late or failed (a slow server right after a win), the card fell back to the generic gold Shark Coin.
 * Every read that names a coin's art (the trip goal's rides, PLAY!'s coin, the park ride catalog) now lands here,
 * so the card keeps the target ride's own coin for the rest of the session. Plain module state, no React.
 */
const art = new Map<number, string>();

export const coinArtCache = {
  remember(taskId: number | null | undefined, url: string | null | undefined): void {
    if (typeof taskId !== 'number' || !Number.isFinite(taskId) || typeof url !== 'string' || !url.trim()) return;
    art.set(taskId, url);
  },
  rememberAll(rows: readonly { readonly task_id?: number | null; readonly coin_url?: string | null }[] | null | undefined): void {
    for (const row of rows ?? []) if (row) coinArtCache.remember(row.task_id ?? null, row.coin_url ?? null);
  },
  get(taskId: number | null | undefined): string | null {
    return typeof taskId === 'number' ? art.get(taskId) ?? null : null;
  },
  /** Tests only. */
  reset(): void { art.clear(); },
};
