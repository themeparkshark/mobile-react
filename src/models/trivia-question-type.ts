export type TriviaQuestionType = {
  id: number;
  question: string;
  answers: string[];
  time_limit_seconds: number;
  difficulty: 'easy' | 'medium' | 'hard';
};
