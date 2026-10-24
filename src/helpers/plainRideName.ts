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
