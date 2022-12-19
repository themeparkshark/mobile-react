export interface CoinType {
  readonly id: number;
  readonly latitude: string;
  readonly longitude: string;
  readonly pivot: {
    readonly active_from: string;
    readonly active_to: string;
    readonly coins: number;
    readonly experience: number;
  };
}
