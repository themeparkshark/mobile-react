/**
 * What the XP potion should play when its level or progress changes. Pure, so
 * the level-up path is tested without a renderer (tools/tests/profile-v2).
 *
 * `reduced` is the Reduce Motion preference: null until the OS answers. While
 * it is unknown the potion waits and keeps the previous state, so a level up
 * that happened while the player was elsewhere still plays once the answer
 * arrives (the round 1 bug: the hook started as "reduced", snapped the vial
 * and recorded the new level, so the level up never played).
 */
export type PotionState = { readonly level: number; readonly progress: number };

export type PotionTransition =
  | 'wait' // preference unknown: change nothing, remember nothing
  | 'levelUp' // brim, burst, drain, refill (or a still level up under Reduce Motion)
  | 'gain' // rise with a slosh and fizz, count the XP up
  | 'pour' // first time this player's potion is seen: pour in from empty
  | 'settle'; // nothing to celebrate: ease to the value

export function potionTransition(prev: PotionState | null, next: PotionState, reduced: boolean | null): PotionTransition {
  if (reduced === null) return 'wait';
  if (prev && next.level > prev.level) return 'levelUp';
  if (!prev) return 'pour';
  if (next.level === prev.level && next.progress > prev.progress + 0.001) return 'gain';
  return 'settle';
}
