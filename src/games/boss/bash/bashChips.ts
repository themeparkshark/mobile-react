/** Boss Bash result chips. Pure, so tools/tests can load it. */

/**
 * The round's brags as the shared chips: at most two, never a zero, and a
 * count of one reads singular (1 PERFECT, not 1 Perfects). Pure (tested).
 */
export function bashChips(meta: Record<string, unknown>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const add = (n: number, one: string, many: string) => { if (n > 0 && out.length < 2) out.push({ label: n === 1 ? one : many, value: String(n) }); };
  add(Number(meta.bonks ?? 0), 'BONK', 'BONKS');
  add(Number(meta.smashes ?? 0), 'SMASH', 'SMASHES');
  const blocks = Number(meta.blocks ?? 0);
  if (blocks > 0) add(blocks, 'BLOCK', 'BLOCKS'); else add(Number(meta.perfects ?? 0), 'PERFECT', 'PERFECTS');
  return out;
}
