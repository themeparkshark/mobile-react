/**
 * autoplay.ts: dev-only bot for recordings and simulations.
 *
 * EXPO_PUBLIC_MEMORY_AUTOPLAY = clean | mixed | novice | timeout (dev builds only).
 * The bot sees exactly what a player sees: the engine's own knowledge (faces it
 * has flipped or been shown), never the hidden layout.
 */

import { useEffect, type MutableRefObject } from 'react';
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

export function useMemoryAutoplay({ runRef, tapSlot, enabled }: {
  runRef: MutableRefObject<{ eng: MMState; playing: boolean; busy: boolean; ended: boolean; pending: boolean } | null>;
  tapSlot: (slot: number) => void;
  enabled: boolean;
}): void {
  const profile = (typeof __DEV__ !== 'undefined' && __DEV__ ? process.env.EXPO_PUBLIC_MEMORY_AUTOPLAY : undefined) as BotProfile | undefined;
  useEffect(() => {
    if (!profile || !BOT[profile] || !enabled) return;
    const p = BOT[profile];
    let seed = 1234567;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      const r = runRef.current;
      if (r && r.playing && !r.busy && !r.ended && !r.pending) {
        const slot = botPick(r.eng, p.recall, rand);
        if (slot >= 0) tapSlot(slot);
      }
      t = setTimeout(loop, p.minMs + rand() * (p.maxMs - p.minMs));
    };
    t = setTimeout(loop, 1200);
    return () => clearTimeout(t);
  }, [profile, enabled, runRef, tapSlot]);
}
