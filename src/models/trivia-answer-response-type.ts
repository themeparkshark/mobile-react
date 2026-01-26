import { TriviaQuestionType } from './trivia-question-type';

export type TriviaAnswerResponseType = {
  data: {
    correct: boolean;
    correct_answer_index: number;
    explanation?: string;
    // If game continues
    next_question?: TriviaQuestionType;
    question_number?: number;
    total_questions?: number;
    current_multiplier: number;
    correct_so_far: number;
    // If game ended (all questions answered or wrong answer)
    game_over: boolean;
    final_multiplier?: number;
    rewards_earned?: {
      coins: number;
      experience: number;
    };
  };
};
