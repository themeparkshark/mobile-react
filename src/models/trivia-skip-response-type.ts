export type TriviaSkipResponseType = {
  data: {
    skipped: boolean;
    multiplier: number; // Always 1x when skipping
    rewards_earned: {
      coins: number;
      experience: number;
    };
  };
};
