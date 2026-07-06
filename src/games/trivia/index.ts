/**
 * Trivia+ — public surface.
 *
 * Usage (task mode, server-validated):
 *   const source = createTaskTriviaSource({ taskId });
 *   <TriviaGame visible source={source} seed={taskId} onComplete={..} onClose={..} />
 *
 * Usage (lineplay mode, bundled offline pool):
 *   const source = createLinePlayTriviaSource({ rideId, parkId, seed });
 *   <TriviaGame visible source={source} seed={seed} onComplete={..} onClose={..} />
 */

export { TriviaGame } from './TriviaGame';
export {
  createTaskTriviaSource,
  createLinePlayTriviaSource,
} from './sources';
export type {
  TaskTriviaOptions,
  LinePlayTriviaOptions,
} from './sources';
export type {
  TriviaSource,
  TriviaCard,
  TriviaGrade,
  TriviaMeta,
  FiftyFiftyResult,
} from './types';
export { LIFELINE_ENABLED } from './config';
