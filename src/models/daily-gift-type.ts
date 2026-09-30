export interface DailyGiftRewardType {
  readonly day: number;
  readonly coins: number;
  readonly energy: number;
  readonly tickets: number;
}

export interface DailyGiftAmountsType {
  readonly coins: number;
  readonly energy: number;
  readonly tickets: number;
}

export interface DailyGiftMilestoneType extends DailyGiftAmountsType {
  readonly label: string;
  readonly day?: number;
  readonly days_away?: number;
}

export interface DailyGiftType {
  readonly id: number;
  readonly coins: number;
  readonly redeemed_at: string | null;
  /** Today's place on the 7-day ladder (newer servers). */
  readonly day?: number;
  readonly ladder?: readonly DailyGiftRewardType[];
  /** Consecutive days including today; keeps counting across weekly loops. */
  readonly streak?: number;
  /** What today's chest holds: the ladder day plus any milestone bonus. */
  readonly reward?: DailyGiftAmountsType;
  /** What the server actually paid, once opened. The app shows only this. */
  readonly granted?: DailyGiftAmountsType | null;
  readonly milestone?: DailyGiftMilestoneType | null;
  readonly next_milestone?: DailyGiftMilestoneType | null;
}
