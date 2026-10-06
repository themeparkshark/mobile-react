import type { LineSignalSummary } from '../../api/endpoints/me/inline-timer/types';

export interface CrewLivePrompt {
  readonly label: string;
  readonly title: string;
  readonly action: string;
  readonly pageId: 'crew-signal' | 'crew-puzzle';
}

/** Pick the next shared action without shifting the queue activity carousel. */
export function crewLivePrompt(
  signal: LineSignalSummary | null,
  completedIds: ReadonlySet<string>,
): CrewLivePrompt | null {
  if (!signal) return null;
  const route = signal.unlocked_route ?? signal.solo_route;
  if (!route) {
    const waitingForVote = !signal.player_choice && !signal.can_choose;
    return {
      label: `CREW PATH · ${signal.participants}/${signal.community_target} VOTES`,
      title: signal.player_choice ? 'Your path opens while you wait'
        : waitingForVote ? 'Play now · your vote opens soon' : 'Choose the next round',
      action: signal.player_choice ? 'SEE YOUR PATH'
        : waitingForVote ? 'SEE CREW PATH' : 'VOTE NOW',
      pageId: 'crew-signal',
    };
  }
  const gameId = `signal-bonus-${signal.park_day}-${route}`;
  if (!completedIds.has(gameId)) return {
    label: 'NEW ROUND OPEN',
    title: route === 'route_a' ? 'Shadow Trail is open' : 'Starlight Route is open',
    action: route === 'route_a' ? 'PLAY MEMORY MATCH' : 'PLAY WHACK-A-SHARK',
    pageId: 'crew-signal',
  };
  if (signal.puzzle && !signal.puzzle.completed) return {
    label: 'CREW CODEBREAKER',
    title: `Codebreaker · ${signal.puzzle.stage}/${signal.puzzle.total_stages}`,
    action: 'SOLVE CODEBREAKER',
    pageId: 'crew-puzzle',
  };
  return {
    label: 'CREW ROUTE COMPLETE',
    title: 'Replay the ride’s shared chapter',
    action: 'REPLAY CREW ROUTE',
    pageId: 'crew-signal',
  };
}
