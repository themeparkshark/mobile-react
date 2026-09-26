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
  timing: 'Rhythm Tap',
  tap: 'Whack-a-Shark',
  banana: 'Banana Basket',
};

/** The server authors text and chooses a supported game; the client checks it. */
export function resolveProjectMission(project: ParkProject): ProjectMission | null {
  const mission = project.play_mission;
  if (!mission || !mission.title?.trim() || !mission.prompt?.trim() ||
      !Object.prototype.hasOwnProperty.call(GAME_NAMES, mission.game_id)) return null;
  const gameId = mission.game_id;
  const branch = project.play_chapter ?? 'opening';
  return {
    title: mission.title,
    prompt: mission.prompt,
    gameName: GAME_NAMES[gameId]!,
    game: {
      kind: 'minigame',
      id: `project-${project.id}-stage-${project.stage}-${branch}-${gameId}`,
      gameId,
      seed: (project.id * 101 + project.stage * 11 + (branch === 'b' ? 3 : 1)) % 100000,
    },
  };
}
