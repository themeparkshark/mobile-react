export type TriviaAnswerResponseType = {
  success: boolean;
  correct: boolean;
  correct_answer: string;
  time_taken: number;
  multiplier: number;
  rewards: {
    xp: number;
    coins: number;
  };
  task: {
    id: number;
    name: string;
    coin_url: string;
  };
};
