/**
 * The crew roles payoff: who did what in a finished one-phone Crew Relay, in
 * story order. Pure data so the recap, the relay card and tests agree.
 */
import type { CrewRelayProgress } from './crewRelay';

export interface CrewStoryBeat {
  readonly role: 'navigator' | 'lookout' | 'decoder' | 'captain';
  /** "You" when solo, otherwise the player number who took that turn. */
  readonly who: string;
  readonly action: string;
}

/** Player for turn index 0-3, matching crewRelayRoleNumber's pass-the-phone order. */
function playerFor(turn: number, crewSize: number | null): string {
  if (!crewSize || crewSize <= 1) return 'You';
  return `Player ${(turn % crewSize) + 1}`;
}

export function crewStoryBeats(progress: CrewRelayProgress, routeNames: readonly [string, string]): CrewStoryBeat[] {
  if (progress.step !== 'complete') return [];
  const size = progress.crewSize;
  const route = progress.route === 'omega' ? routeNames[1] : routeNames[0];
  return [
    { role: 'navigator', who: playerFor(0, size),
      action: progress.triviaCorrect ? 'solved the clue' : 'braved the clue' },
    { role: 'lookout', who: playerFor(1, size),
      action: progress.observation ? `spotted a ${progress.observation}` : 'kept watch' },
    { role: 'decoder', who: playerFor(2, size),
      action: progress.memoryCorrect ? 'cracked the code' : 'tried the lock' },
    { role: 'captain', who: playerFor(3, size), action: `chose ${route}` },
  ];
}
