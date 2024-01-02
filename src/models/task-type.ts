export interface TaskType {
  readonly coin_url: string;
  readonly coins: number;
  readonly completion_goal: number;
  readonly experience: number;
  readonly id: number;
  readonly latitude: string;
  readonly longitude: string;
  readonly name: string;
  readonly times_completed: number;
  readonly has_completed: boolean;
}
