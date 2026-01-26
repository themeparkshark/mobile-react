import { TriviaQuestionType } from './trivia-question-type';

export type TriviaGameResponseType = {
  data: {
    session_id: string;
    task_id: number;
    task_name: string;
    question: TriviaQuestionType;
    question_number: number;
    total_questions: number;
    current_multiplier: number;
    correct_so_far: number;
    tickets_remaining: number;
  };
};
