/**
 * bot.ts: the memory bot used by dev autoplay and the tuning simulation. It
 * only sees the engine's own knowledge (what a player has seen), never the layout.
 */
import { K_GLIMPSED, K_MATCHED, K_SEEN, type MMState } from './engine';

export type BotProfile = 'clean' | 'mixed' | 'novice' | 'timeout';

export const BOT: Record<BotProfile, { recall: number; minMs: number; maxMs: number }> = {
  clean: { recall: 1, minMs: 380, maxMs: 560 },
  mixed: { recall: 0.8, minMs: 520, maxMs: 820 },
  novice: { recall: 0.5, minMs: 800, maxMs: 1200 },
  timeout: { recall: 0.3, minMs: 1500, maxMs: 2300 },
};

function known(s: MMState, slot: number): boolean {
  return s.know[slot] === K_SEEN || s.know[slot] === K_GLIMPSED;
}

/** Pick the next tap for a bot with the given recall probability. */
export function botPick(s: MMState, recall: number, rand: () => number): number {
  const open: number[] = [];
  const unseen: number[] = [];
  const byFace = new Map<number, number[]>();
  const upNow = s.phase === 2 ? [] : s.up;
  for (let i = 0; i < s.n; i++) {
    if (s.know[i] === K_MATCHED || upNow.indexOf(i) >= 0) continue;
    open.push(i);
    if (!known(s, i)) unseen.push(i);
    else {
      const f = s.faces[i];
      byFace.set(f, [...(byFace.get(f) ?? []), i]);
    }
  }
  if (!open.length) return -1;
  const any = (xs: number[]) => xs[Math.floor(rand() * xs.length)];
  if (s.phase === 1) {
    const fa = s.faces[s.a];
    const partner = (byFace.get(fa) ?? []).find((i) => i !== s.a);
    if (partner != null && rand() < recall) return partner;
    const fresh = unseen.filter((i) => i !== s.a);
    return fresh.length ? any(fresh) : any(open.filter((i) => i !== s.a));
  }
  for (const slots of byFace.values()) {
    if (slots.length >= 2 && rand() < recall) return slots[0];
  }
  return unseen.length ? any(unseen) : any(open);
}

