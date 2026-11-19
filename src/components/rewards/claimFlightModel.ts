/**
 * The claim moment's numbers (fix round W3, T142), pure: how many Ticket
 * pictures fly (1 to 4, never one per Ticket for a big claim), how long the
 * flight takes and the count-up steps (eased, landing exactly on the total).
 */
export const MAX_CLAIM_PICTURES = 4;

export function claimFlightPlan(amount: number): { pictures: number; flightMs: number; stepMs: number; steps: number[] } | null {
  const n = Number.isFinite(amount) ? Math.floor(amount) : 0;
  if (n <= 0) return null;
  const pictures = Math.min(MAX_CLAIM_PICTURES, n);
  const count = Math.min(10, n);
  const steps = Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return 1 - Math.pow(1 - t, 2);
  });
  steps[steps.length - 1] = 1;
  return { pictures, flightMs: 520 + pictures * 60, stepMs: 45, steps };
}
