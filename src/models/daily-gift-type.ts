export interface DailyGiftRewardType {
  readonly day: number;
  readonly coins: number;
  readonly energy: number;
  readonly tickets: number;
}

export interface DailyGiftType {
  readonly id: number;
  readonly coins: number;
  readonly redeemed_at: string | null;
  /** Today's place on the 7-day ladder (newer servers). */
  readonly day?: number;
  readonly ladder?: readonly DailyGiftRewardType[];
}
