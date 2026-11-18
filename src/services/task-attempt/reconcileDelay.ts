/** T033: how long "Checking your score" waits before asking the server again (2, 4, 8, then every 15 s). */
export function reconcileDelayMs(tries: number): number {
  const steps = [2000, 4000, 8000];
  const n = Number.isFinite(tries) && tries > 0 ? Math.floor(tries) : 0;
  return n < steps.length ? steps[n] : 15000;
}
