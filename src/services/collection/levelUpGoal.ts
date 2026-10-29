/**
 * The level-up goal: the owned coin GET RIDE PARTS pointed the guide at.
 *
 * guide.setTarget keeps only the coin id as the plan, so the shelf cannot tell
 * "GO on Tiki Room, then won it" (move on to a new coin) from "GET RIDE PARTS on
 * Haunted Mansion, which you own" (LEVEL UP GOAL, GO to its line). This tiny
 * store remembers the second. It counts only while that coin is still the
 * guide's plan: any other GO or coin pick moves the plan and ends it, and a
 * level-up clears it.
 *
 * It belongs to one player: a goal set by one account never shows for another
 * account on the same phone (getFor with the signed-in player's id), and a
 * sign-out or a different player forgets it.
 */
type Listener = () => void;

let goal: number | null = null;
let owner: number | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(listener => {
  try { listener(); } catch { /* one bad listener never stops the rest */ }
});

export const levelUpGoal = {
  /** Remember GET RIDE PARTS on this coin for this player (no player id: kept for nobody). */
  set(taskId: number, playerId?: number | null): void {
    if (!Number.isFinite(taskId)) return;
    const who = playerId ?? null;
    if (goal === taskId && owner === who) return;
    goal = taskId;
    owner = who;
    emit();
  },
  /** The goal, whoever set it (tests and debugging). Screens read getFor. */
  get(): number | null {
    return goal;
  },
  /** The goal for the signed-in player only: another account, or no account, sees none. */
  getFor(playerId: number | null | undefined): number | null {
    return goal != null && playerId != null && owner === playerId ? goal : null;
  },
  /** Forget it (after a level-up of that coin, or with no id for any coin). */
  clear(taskId?: number): void {
    if (goal === null || (taskId != null && goal !== taskId)) return;
    goal = null;
    owner = null;
    emit();
  },
  /** A sign-out or a different player: forget a goal that belongs to anyone else. */
  forPlayer(playerId: number | null | undefined): void {
    if (goal === null || (playerId != null && owner === playerId)) return;
    goal = null;
    owner = null;
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
