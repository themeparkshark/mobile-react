/**
 * Plain ride names everywhere (IP rule): drop trademark, registered and copyright marks the
 * wait-times feed and some catalog rows carry ("Indiana Jones™ Adventure" reads
 * "Indiana Jones Adventure"), and tidy the spaces they leave. Words are never changed.
 */
const MARKS = /\s*(?:[™®©℠]|\((?:TM|R|C|SM)\))/giu;

export function plainRideName(name: string | null | undefined): string {
  if (typeof name !== 'string') return '';
  return name.replace(MARKS, '').replace(/\s{2,}/g, ' ').trim();
}

/** The same, for a list of rows with a `name` (returns new rows only when one changed). */
export function withPlainNames<T extends { name: string }>(rows: readonly T[]): T[] {
  return rows.map(row => {
    const plain = plainRideName(row.name);
    return plain === row.name ? row : { ...row, name: plain };
  });
}

/**
 * The map's opportunities (/me/current-redeemables): ride coins and secret coins carry ride names
 * that label the map, so they go through the same plain-name path as every other ride list.
 */
export function withPlainTaskNames<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of ['tasks', 'secret_tasks']) {
    const rows = out[key];
    if (Array.isArray(rows)) {
      out[key] = rows.map((row) => (row && typeof row === 'object' && typeof (row as { name?: unknown }).name === 'string'
        ? withPlainNames([row as { name: string }])[0] : row));
    }
  }
  return out as T;
}
