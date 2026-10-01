/**
 * autoplay.ts: dev-only bot for recordings and simulations.
 *
 * EXPO_PUBLIC_MEMORY_AUTOPLAY = clean | mixed | novice | timeout (dev builds only).
 * The bot sees exactly what a player sees: the engine's own knowledge (faces it
 * has flipped or been shown), never the hidden layout.
 */

import { useEffect, type MutableRefObject } from 'react';
import type { MMState } from './engine';
import { BOT, botPick, type BotProfile } from './bot';

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
