/** Resolve to null if `promise` takes longer than `ms` (no infinite loading states). */
export const LOAD_TIMEOUT_MS = 12_000;

export function withTimeout<T>(promise: Promise<T | null>, ms: number = LOAD_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}
