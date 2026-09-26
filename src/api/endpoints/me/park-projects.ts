import client from '../../client';

export interface ParkProject {
  readonly id: number;
  readonly park_id: number;
  readonly park_name: string;
  readonly park_latitude?: number | null;
  readonly park_longitude?: number | null;
  readonly slug: string;
  readonly title: string;
  readonly previous_story?: {
    readonly title: string;
    readonly chosen_chapter: 'a' | 'b';
    readonly chosen_title: string;
    readonly votes: number;
    readonly your_vote: 'a' | 'b' | null;
  } | null;
  readonly description: string;
  readonly story_text: string;
  readonly personal_clue: string | null;
  readonly crew?: {
    readonly points: number;
    readonly target: number;
    readonly friends: number;
    readonly clue: string | null;
  } | null;
  readonly remote_challenge?: {
    readonly prompt: string;
    readonly choices: readonly string[];
    readonly completed: boolean;
    readonly park_day: string;
    readonly index?: number;
    readonly total?: number;
  } | null;
  readonly chapter_a_title: string;
  readonly chapter_b_title: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly goal_points: number;
  readonly total_points: number;
  readonly stage: number;
  readonly ended: boolean;
  readonly my_points: number;
  readonly participated: boolean;
  readonly my_chapter: 'a' | 'b' | null;
  readonly targeted: boolean;
  readonly can_vote: boolean;
  readonly chapter_a_votes: number;
  readonly chapter_b_votes: number;
  readonly leading_chapter: 'a' | 'b' | null;
  readonly play_chapter: 'a' | 'b' | null;
  readonly play_mission: {
    readonly title: string;
    readonly prompt: string;
    readonly game_id: 'shark' | 'memory' | 'timing' | 'tap' | 'banana';
  };
  readonly final_chapter: 'a' | 'b' | null;
  readonly personal_clue_open: boolean;
  readonly contributors: number;
  readonly recent_actions?: readonly {
    readonly kind: 'home_find' | 'fan_challenge' | 'ride_coin' | 'queue_part' | 'vote_a' | 'vote_b' | 'contribution';
    readonly points: number;
    readonly at: string;
  }[];
}

export async function getParkProjects(): Promise<{ active: ParkProject[]; history: ParkProject[] }> {
  const { data } = await client.get<{ data: ParkProject[]; history: ParkProject[] }>('/me/park-projects');
  return { active: data.data, history: data.history };
}

export async function followParkProject(id: number): Promise<ParkProject> {
  const { data } = await client.post<{ data: ParkProject }>(`/me/park-projects/${id}/follow`);
  return data.data;
}

export async function voteParkProject(id: number, chapter: 'a' | 'b'): Promise<ParkProject> {
  const { data } = await client.post<{ data: ParkProject }>(`/me/park-projects/${id}/vote`, { chapter });
  return data.data;
}

export async function answerParkProjectRemote(id: number, choice: number,
  parkDay: string, challengeIndex: number): Promise<{
  correct: boolean;
  explanation: string | null;
  points_awarded?: number;
  data: ParkProject;
}> {
  const { data } = await client.post(`/me/park-projects/${id}/remote-answer`, {
    choice, park_day: parkDay, challenge_index: challengeIndex,
  });
  return data;
}
