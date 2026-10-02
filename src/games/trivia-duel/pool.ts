/**
 * Offline authored pool for a ride/park: the chapter's ride questions first,
 * then park, then general (the same eligibility as LinePlay's
 * fetchRideTrivia). Loaded once per match; the deck builder picks from it.
 */
import { fetchRideTrivia } from '../../services/lineplay/content';
import { getLinePlayChapterById } from '../../services/lineplay/chapters';
import type { PoolQuestion } from './engine/content';

export interface PoolContext {
  rideId?: number;
  parkId?: number;
  chapterId?: string;
}

const memo = new Map<string, PoolQuestion[]>();

export async function loadPool(ctx: PoolContext): Promise<PoolQuestion[]> {
  const key = `${ctx.rideId ?? ''}:${ctx.parkId ?? ''}:${ctx.chapterId ?? ''}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const chapter = getLinePlayChapterById(ctx.chapterId);
  const chapterN = chapter?.trivia.length ?? 0;
  const out: PoolQuestion[] = [];
  const seen = new Set<string>();
  for (let s = 0; s < chapterN + 140; s++) {
    try {
      const q = await fetchRideTrivia(ctx.rideId, ctx.parkId, s, ctx.chapterId);
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      out.push({ ...q, rideId: q.rideId ?? (s < chapterN ? ctx.rideId : undefined) });
    } catch {
      break;
    }
  }
  memo.set(key, out);
  return out;
}
