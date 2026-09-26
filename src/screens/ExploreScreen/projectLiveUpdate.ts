import type { ParkProject } from '../../api/endpoints/me/park-projects';

export const PROJECT_STAGE_LABELS = [
  'Signal hidden', 'First clue open', 'Choose the next current', 'Signal restored',
] as const;

const STORY_STAGE_LABELS: Record<string, readonly string[]> = {
  'echo-harbor-chapter': ['Echo hidden', 'Harbor clue open', 'Choose the next passage', 'Echo map complete'],
  'lantern-tide-chapter': ['Lanterns unlit', 'Lantern trail open', 'Choose the next trail', 'Lantern route lit'],
};

export function projectStageLabel(project: Pick<ParkProject, 'slug' | 'stage'>): string {
  if (project.slug?.startsWith('observatory-')) {
    return ['Lens hidden', 'Observatory clue open', 'Choose the final map', 'Crew map recorded'][project.stage]
      ?? 'New chapter open';
  }
  return STORY_STAGE_LABELS[project.slug]?.[project.stage]
    ?? PROJECT_STAGE_LABELS[project.stage]
    ?? 'New chapter open';
}

/** Match the server's one-third, two-thirds, and full-goal story gates. */
export function projectNextMilestone(project: Pick<ParkProject,
  'stage' | 'ended' | 'total_points' | 'goal_points'>): { label: string; remaining: number } {
  if (project.ended) return { label: 'THIS CHAPTER IS ARCHIVED', remaining: 0 };
  if (project.stage >= 3) return { label: 'THE CREW REACHED THE GOAL', remaining: 0 };
  const threshold = project.stage === 0 ? Math.ceil(project.goal_points / 3)
    : project.stage === 1 ? Math.max(2, Math.ceil(project.goal_points * 2 / 3))
      : project.goal_points;
  const label = project.stage === 0 ? 'FIRST CLUE OPENS'
    : project.stage === 1 ? 'COMMUNITY VOTE OPENS' : 'STORY FINALE OPENS';
  return { label, remaining: Math.max(0, threshold - project.total_points) };
}

/** A project's stage, points, and vote total only grow during its lifetime. */
export function preferFreshProjectSnapshot(previous: ParkProject | undefined, next: ParkProject): ParkProject {
  if (!previous || previous.id !== next.id) return next;
  const oldVotes = previous.chapter_a_votes + previous.chapter_b_votes;
  const newVotes = next.chapter_a_votes + next.chapter_b_votes;
  return next.stage < previous.stage || next.total_points < previous.total_points || newVotes < oldVotes
    ? previous : next;
}

/** Describe a server-confirmed change since the last visible project snapshot. */
export function projectLiveUpdate(previous: ParkProject | undefined, next: ParkProject): string | null {
  if (!previous || previous.ended || next.ended) return null;

  if (next.stage > previous.stage) {
    return `${next.park_name}: ${projectStageLabel(next)}`;
  }

  const oldVotes = previous.chapter_a_votes + previous.chapter_b_votes;
  const newVotes = next.chapter_a_votes + next.chapter_b_votes;
  if (newVotes > oldVotes && next.leading_chapter &&
      next.leading_chapter !== previous.leading_chapter) {
    const title = next.leading_chapter === 'a' ? next.chapter_a_title : next.chapter_b_title;
    return `New vote leader: ${title}`;
  }

  const newPoints = next.total_points - previous.total_points;
  if (newPoints > 0) {
    return `+${newPoints} ${newPoints === 1 ? 'signal' : 'signals'} for ${next.park_name}`;
  }

  const addedVotes = newVotes - oldVotes;
  if (addedVotes > 0) {
    return `${addedVotes} new park ${addedVotes === 1 ? 'vote' : 'votes'}`;
  }

  return null;
}
