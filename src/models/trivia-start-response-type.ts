export type TriviaStartResponseType = {
  // When trivia is available
  skip_trivia: boolean;
  trivia?: {
    session_token: string;
    question: string;
    answers: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    time_limit_seconds: number;
  };
  task?: {
    id: number;
    name: string;
    coin_url: string;
  };
  // When trivia is not available
  message?: string;
};
