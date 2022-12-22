export interface TaskType {
  readonly coin_url: string;
  readonly coins: number;
  readonly experience: number;
  readonly has_completed: boolean;
  readonly id: number;
  readonly latitude: string;
  readonly longitude: string;
  readonly name: string;
  readonly pivot: {
    readonly active_from: string;
    readonly active_to: string;
    readonly coins: number;
    readonly experience: number;
  };
}
