/**
 * The level-up goal: the owned coin GET RIDE PARTS pointed the guide at.
 *
 * guide.setTarget keeps only the coin id as the plan, so the shelf cannot tell
 * "GO on Tiki Room, then won it" (move on to a new coin) from "GET RIDE PARTS on
 * Haunted Mansion, which you own" (LEVEL UP GOAL, GO to its line). This tiny
 * store remembers the second. It counts only while that coin is still the
 * guide's plan: any other GO or coin pick moves the plan and ends it, and a
 * level-up clears it.
 */
type Listener = () => void;

let goal: number | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(listener => {
  try { listener(); } catch { /* one bad listener never stops the rest */ }
});

export const levelUpGoal = {
  set(taskId: number): void {
    if (!Number.isFinite(taskId) || goal === taskId) return;
    goal = taskId;
    emit();
  },
  get(): number | null {
    return goal;
  },
  /** Forget it (after a level-up of that coin, or with no id for any coin). */
  clear(taskId?: number): void {
    if (goal === null || (taskId != null && goal !== taskId)) return;
    goal = null;
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
