import type { ParkProject } from '../../api/endpoints/me/park-projects';
import type { ActivityItem, MiniGameId } from './LinePlaySession';

export interface ProjectMission {
  readonly title: string;
  readonly prompt: string;
  readonly gameName: string;
  readonly game: Extract<ActivityItem, { kind: 'minigame' }>;
}

const GAME_NAMES: Partial<Record<MiniGameId, string>> = {
  shark: 'Sharky Swim',
  memory: 'Memory Match',
  tap: 'Whack-a-Shark',
  banana: 'Banana Basket',
};

/** The server authors text and chooses a supported game; the client checks it. */
export function resolveProjectMission(project: ParkProject): ProjectMission | null {
  const mission = project.play_mission;
  // Rhythm Tap is out of queue rotation; a server mission that still names it
  // plays Whack-a-Shark instead of disappearing.
  const gameId: MiniGameId | undefined = mission?.game_id === 'timing' ? 'tap' : mission?.game_id;
  if (!mission || !mission.title?.trim() || !mission.prompt?.trim() || !gameId ||
      !Object.prototype.hasOwnProperty.call(GAME_NAMES, gameId)) return null;
  const branch = project.play_chapter ?? 'opening';
  // The server prompt was written for Rhythm Tap ("keep the beat"). When the
  // mission is remapped, say what the guest will actually play.
  const remapped = mission.game_id === 'timing';
  return {
    title: mission.title,
    prompt: remapped
      ? 'Bop every shark that pops up to keep your crew’s project moving.'
      : mission.prompt,
    gameName: GAME_NAMES[gameId]!,
    game: {
      kind: 'minigame',
      id: `project-${project.id}-stage-${project.stage}-${branch}-${gameId}`,
      gameId,
      seed: (project.id * 101 + project.stage * 11 + (branch === 'b' ? 3 : 1)) % 100000,
    },
  };
}
