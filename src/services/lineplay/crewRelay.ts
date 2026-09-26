export type CrewRelayStep =
  | 'setup'
  | 'trivia'
  | 'observation'
  | 'memory-preview'
  | 'memory-recall'
  | 'route'
  | 'complete';

export type CrewObservation = 'shape' | 'color' | 'sound';
export type CrewRoute = 'alpha' | 'omega';

export interface CrewRelayProgress {
  readonly version: 1;
  readonly seed: number;
  readonly step: CrewRelayStep;
  readonly crewSize: number | null;
  readonly ready: boolean;
  readonly triviaChoice: number | null;
  readonly triviaCorrect: boolean | null;
  readonly observation: CrewObservation | null;
  readonly memorySequence: readonly number[];
  readonly memoryPicks: readonly number[];
  readonly memoryCorrect: boolean | null;
  readonly route: CrewRoute | null;
}

const STEPS: readonly CrewRelayStep[] = [
  'setup', 'trivia', 'observation', 'memory-preview', 'memory-recall', 'route', 'complete',
];
const OBSERVATIONS: readonly CrewObservation[] = ['shape', 'color', 'sound'];
const ROUTES: readonly CrewRoute[] = ['alpha', 'omega'];

export function createCrewRelay(seed: number): CrewRelayProgress {
  let state = (Math.abs(Math.floor(seed)) || 1) >>> 0;
  const memorySequence: number[] = [];
  for (let index = 0; index < 5; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    memorySequence.push((state >>> 16) % 4);
  }
  return {
    version: 1, seed, step: 'setup', crewSize: null, ready: false,
    triviaChoice: null, triviaCorrect: null, observation: null,
    memorySequence, memoryPicks: [], memoryCorrect: null, route: null,
  };
}

export function isCrewRelayProgress(value: unknown): value is CrewRelayProgress {
  if (!value || typeof value !== 'object') return false;
  const item = value as CrewRelayProgress;
  return item.version === 1 && Number.isFinite(item.seed) && STEPS.includes(item.step) &&
    (item.crewSize === null || (Number.isInteger(item.crewSize) && item.crewSize >= 1 && item.crewSize <= 4)) &&
    (item.step === 'setup' || item.crewSize !== null) &&
    typeof item.ready === 'boolean' &&
    (item.triviaChoice === null || (Number.isInteger(item.triviaChoice) && item.triviaChoice >= 0 && item.triviaChoice <= 3)) &&
    (item.triviaCorrect === null || typeof item.triviaCorrect === 'boolean') &&
    (item.observation === null || OBSERVATIONS.includes(item.observation)) &&
    Array.isArray(item.memorySequence) && item.memorySequence.length === 5 &&
    item.memorySequence.every(symbol => Number.isInteger(symbol) && symbol >= 0 && symbol <= 3) &&
    Array.isArray(item.memoryPicks) && item.memoryPicks.length <= 5 &&
    item.memoryPicks.every(symbol => Number.isInteger(symbol) && symbol >= 0 && symbol <= 3) &&
    (item.memoryCorrect === null || typeof item.memoryCorrect === 'boolean') &&
    (item.route === null || ROUTES.includes(item.route)) &&
    (item.step !== 'complete' || item.route !== null);
}

export function chooseCrewSize(state: CrewRelayProgress, count: number): CrewRelayProgress {
  if (state.step !== 'setup' || !Number.isInteger(count) || count < 1 || count > 4) return state;
  return { ...state, crewSize: count, step: 'trivia', ready: true };
}

export function readyForCrewTurn(state: CrewRelayProgress): CrewRelayProgress {
  if (!state.crewSize || state.ready ||
    !['trivia', 'observation', 'memory-preview', 'route'].includes(state.step)) return state;
  return { ...state, ready: true };
}

export function answerCrewTrivia(
  state: CrewRelayProgress, choice: number, correctIndex: number,
): CrewRelayProgress {
  if (state.step !== 'trivia' || !state.ready || !Number.isInteger(choice) || choice < 0 || choice > 3) return state;
  return { ...state, triviaChoice: choice, triviaCorrect: choice === correctIndex,
    step: 'observation', ready: state.crewSize === 1 };
}

export function chooseCrewObservation(
  state: CrewRelayProgress, observation: CrewObservation,
): CrewRelayProgress {
  if (state.step !== 'observation' || !state.ready || !OBSERVATIONS.includes(observation)) return state;
  const offset = OBSERVATIONS.indexOf(observation);
  return { ...state, observation,
    // The Lookout's signal changes the Decoder's actual code, not just its copy.
    memorySequence: state.memorySequence.map((symbol, index) =>
      (symbol + offset + (offset > 0 && index % 2 === 1 ? 1 : 0)) % 4),
    step: 'memory-preview', ready: state.crewSize === 1 };
}

export function hideCrewMemory(state: CrewRelayProgress): CrewRelayProgress {
  if (state.step !== 'memory-preview' || !state.ready) return state;
  return { ...state, step: 'memory-recall' };
}

export function pickCrewMemory(state: CrewRelayProgress, symbol: number): CrewRelayProgress {
  if (state.step !== 'memory-recall' || !Number.isInteger(symbol) || symbol < 0 || symbol > 3) return state;
  const picks = [...state.memoryPicks, symbol];
  if (picks.length < state.memorySequence.length) return { ...state, memoryPicks: picks };
  return {
    ...state, memoryPicks: picks,
    memoryCorrect: picks.every((pick, index) => pick === state.memorySequence[index]),
    step: 'route', ready: state.crewSize === 1,
  };
}

export function undoCrewMemory(state: CrewRelayProgress): CrewRelayProgress {
  if (state.step !== 'memory-recall' || state.memoryPicks.length === 0) return state;
  return { ...state, memoryPicks: state.memoryPicks.slice(0, -1) };
}

export function chooseCrewRoute(state: CrewRelayProgress, route: CrewRoute): CrewRelayProgress {
  if (state.step !== 'route' || !state.ready || !ROUTES.includes(route)) return state;
  return { ...state, route, step: 'complete' };
}

export function crewRelayRoleNumber(state: CrewRelayProgress): number {
  if (!state.crewSize) return 1;
  const index = state.step === 'trivia' ? 0 : state.step === 'observation' ? 1 :
    state.step === 'memory-preview' || state.step === 'memory-recall' ? 2 : 3;
  return (index % state.crewSize) + 1;
}

export function crewRelayScore(state: CrewRelayProgress): number {
  return Number(state.triviaCorrect === true) + Number(state.memoryCorrect === true);
}

/** The crew's route opens a distinct playable epilogue, without creating a client reward. */
export function crewRelayEpilogue(state: CrewRelayProgress, copy?: {
  readonly alpha: { readonly title: string; readonly prompt: string };
  readonly omega: { readonly title: string; readonly prompt: string };
}): {
  readonly route: CrewRoute;
  readonly gameId: 'timing' | 'shark';
  readonly title: string;
  readonly prompt: string;
  readonly seed: number;
} | null {
  if (state.step !== 'complete' || !state.route) return null;
  const observationOffset = state.observation == null ? 0 : OBSERVATIONS.indexOf(state.observation) * 211;
  const signalIntro = state.observation ? `Your ${state.observation} signal changed this round. ` : '';
  return state.route === 'alpha'
    ? { route: 'alpha', gameId: 'timing', title: copy?.alpha.title ?? 'Hold the Alpha Signal',
        prompt: signalIntro + (copy?.alpha.prompt ?? 'Keep a steady rhythm to guide your shark along the known flight path.'),
        seed: (state.seed + 1975 + observationOffset) >>> 0 }
    : { route: 'omega', gameId: 'shark', title: copy?.omega.title ?? 'Search the Omega Trail',
        prompt: signalIntro + (copy?.omega.prompt ?? 'Swim into the unknown and look for the signal your crew missed.'),
        seed: (state.seed + 2005 + observationOffset) >>> 0 };
}
