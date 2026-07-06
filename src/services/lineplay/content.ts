/**
 * LinePlay content loaders — typed trivia, lore, and prediction sources.
 *
 * These feed the LinePlay activity playlist. Everything here is designed to
 * degrade gracefully offline: ride-keyed content falls back to a park pool,
 * which falls back to a bundled general pool. Nothing here throws to the UI.
 *
 * SERVER TRIVIA NOTE:
 *   The existing server trivia endpoints (src/api/endpoints/tasks/trivia/*) are
 *   TASK-keyed, not ride-keyed, and consume a ticket per start
 *   (POST /tasks/{taskId}/trivia/start). That system is unsuitable for the
 *   passive, free, ride-specific trivia we want while standing in line. So the
 *   in-line trivia loader below reads from a bundled, ride/park-keyed pool.
 *   TODO(server): expose a free, ride-keyed trivia pool endpoint
 *   (e.g. GET /rides/{rideId}/trivia) and wire fetchRideTrivia to it, keeping
 *   the bundled pool as the offline fallback.
 *
 * LORE NOTE:
 *   There is no Nova/crumb-backed lore source for parks/rides today. The
 *   CrumbProvider content bag (src/models/crumbs-type.ts) is UI copy
 *   (labels/messages/prompts), not park facts. Until Nova content exists we
 *   bundle placeholder park facts below.
 *   TODO(Nova): replace BUNDLED_LORE with a Nova-managed lore feed keyed by
 *   park/ride and fetch it in fetchRideLore.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriviaQuestion {
  readonly id: string;
  /** Ride this question is about, when ride-specific. Undefined = park/general. */
  readonly rideId?: number;
  /** Park this question belongs to, when park-specific. */
  readonly parkId?: number;
  readonly question: string;
  readonly choices: readonly string[];
  /** Index into `choices` of the correct answer. */
  readonly correctIndex: number;
  readonly difficulty: 'easy' | 'medium' | 'hard';
}

export interface LoreCard {
  readonly id: string;
  readonly rideId?: number;
  readonly parkId?: number;
  readonly title: string;
  readonly body: string;
  /** Optional attribution/source line (e.g. "Nova"). */
  readonly source?: string;
}

export interface PredictionCard {
  readonly id: string;
  /** The posted wait we are betting against, in minutes. */
  readonly postedWaitMinutes: number;
  readonly prompt: string;
  /** The two sides of the bet, always beat/miss. */
  readonly options: readonly ['beat', 'miss'];
}

export interface PredictionResolution {
  readonly guess: 'beat' | 'miss';
  readonly postedWaitMinutes: number;
  readonly actualWaitMinutes: number;
  readonly beat: boolean;
  /** True when the player's guess matched reality. */
  readonly correct: boolean;
}

// ---------------------------------------------------------------------------
// Bundled fallback content (offline-first)
// ---------------------------------------------------------------------------

/**
 * General trivia pool — used when no ride/park pool matches. Kept small and
 * evergreen so it works in airplane mode on day one.
 */
const BUNDLED_TRIVIA: readonly TriviaQuestion[] = [
  {
    id: 'gen-1',
    question: 'What was the first ride to use a launch instead of a lift hill?',
    choices: ['Steel roller coasters generally launch with LSMs', 'All coasters use chains', 'Wooden coasters only', 'None of them'],
    correctIndex: 0,
    difficulty: 'medium',
  },
  {
    id: 'gen-2',
    question: 'A "dark ride" is best described as which of the following?',
    choices: ['An indoor ride through themed scenes', 'A night-only coaster', 'A haunted house only', 'A water ride'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-3',
    question: 'What does "single rider" line usually get you?',
    choices: ['A shorter wait by filling empty seats', 'A private car', 'Front row guaranteed', 'A discount'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-4',
    question: 'On most coasters, where do you feel the most "airtime"?',
    choices: ['Cresting a hill', 'At the station', 'On the lift', 'In the queue'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-5',
    question: 'What is a coaster "inversion"?',
    choices: ['A section that turns riders upside down', 'A backwards launch', 'A tunnel', 'A brake run'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-6',
    question: 'Roughly how fast is 60 mph in a theme-park coaster context?',
    choices: ['A fast thrill coaster', 'A kiddie ride', 'A slow dark ride', 'A parade float'],
    correctIndex: 0,
    difficulty: 'medium',
  },
];

/**
 * Bundled placeholder lore. TODO(Nova): replace with a Nova-managed feed.
 * 20 park facts so the "Line Lore" activity always has something to show.
 */
const BUNDLED_LORE: readonly LoreCard[] = [
  { id: 'lore-1', title: 'Queue Psychology', body: 'Parks bend queue lines back and forth so a long wait feels shorter. If you can’t see the end, your brain stays patient.', source: 'Nova' },
  { id: 'lore-2', title: 'Hidden Theming', body: 'The best queues tell a story before you even board. Look for props, sounds, and lighting that set up the ride.', source: 'Nova' },
  { id: 'lore-3', title: 'The 20-Minute Trick', body: 'Posted waits are often padded. Beating the posted time by a few minutes is the norm, not the exception.', source: 'Nova' },
  { id: 'lore-4', title: 'Launch vs Lift', body: 'A launch coaster trades the slow clank of a lift hill for an instant burst of speed, sometimes 0–60 in seconds.', source: 'Nova' },
  { id: 'lore-5', title: 'Single Rider Secrets', body: 'Single rider lines fill the odd empty seat. You give up sitting together for a much shorter wait.', source: 'Nova' },
  { id: 'lore-6', title: 'Airtime', body: 'That floaty feeling at the top of a hill is "airtime" — the moment your body wants to keep going up while the train dips.', source: 'Nova' },
  { id: 'lore-7', title: 'Onboard Audio', body: 'Many modern coasters sync music to the track. The big drop almost always lands on the loudest beat.', source: 'Nova' },
  { id: 'lore-8', title: 'Ride Capacity', body: 'A ride’s "throughput" is how many guests it moves per hour. Higher capacity means the line drains faster than it looks.', source: 'Nova' },
  { id: 'lore-9', title: 'Weenies', body: 'Walt Disney called tall landmarks "weenies" — visual magnets that pull you toward the next area of the park.', source: 'Nova' },
  { id: 'lore-10', title: 'The Golden Hour', body: 'Waits usually dip right around parade and fireworks times. Trade the show for a walk-on.', source: 'Nova' },
  { id: 'lore-11', title: 'Trims', body: 'Those clicks partway down a coaster are trim brakes, quietly shaving speed to keep every train consistent.', source: 'Nova' },
  { id: 'lore-12', title: 'Rider Swap', body: 'Traveling with little ones? Rider swap lets adults take turns without waiting the full line twice.', source: 'Nova' },
  { id: 'lore-13', title: 'The Pre-Show', body: 'A pre-show room isn’t a delay — it’s part of the ride, buying time while the next batch loads.', source: 'Nova' },
  { id: 'lore-14', title: 'Block Zones', body: 'Coasters split the track into "blocks" so only one train is ever in each section. That’s why trains sometimes pause.', source: 'Nova' },
  { id: 'lore-15', title: 'Themed Scent', body: 'Some dark rides pump in smells — sea salt, smoke, fresh bread — to make a scene feel real.', source: 'Nova' },
  { id: 'lore-16', title: 'The Interlock', body: 'Lap bars and harnesses are checked twice: once by you, once by the ride op. Both have to agree before dispatch.', source: 'Nova' },
  { id: 'lore-17', title: 'Water Ride Timing', body: 'The splashiest seat is usually the front on a flume and the back on a rapids ride. Choose your soak.', source: 'Nova' },
  { id: 'lore-18', title: 'Queue Games', body: 'Interactive queues — puzzles, buttons, screens — exist for one reason: to make the wait vanish.', source: 'Nova' },
  { id: 'lore-19', title: 'The Dispatch Clock', body: 'Ride crews race an invisible clock. A well-run ride dispatches a train every 30–60 seconds.', source: 'Nova' },
  { id: 'lore-20', title: 'Golden Churros', body: 'Snack lines count too. A churro in line is basically a queue power-up. You’re welcome.', source: 'Nova' },
];

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function seededPick<T>(items: readonly T[], seed: number): T {
  if (items.length === 0) throw new Error('seededPick: empty array');
  const idx = Math.abs(Math.floor(seed)) % items.length;
  return items[idx];
}

/**
 * Load a trivia question for this ride. Tries ride-keyed content first, then
 * park-keyed, then the general bundled pool. Never throws.
 *
 * `seed` (e.g. an activity index) keeps selection stable across re-renders and
 * varied across playlist slots.
 *
 * TODO(server): when a free ride-trivia endpoint exists, fetch ride-keyed
 * questions here and merge them ahead of the bundled pool.
 */
export async function fetchRideTrivia(
  rideId: number | undefined,
  parkId: number | undefined,
  seed: number,
): Promise<TriviaQuestion> {
  const rideMatches = rideId != null ? BUNDLED_TRIVIA.filter((q) => q.rideId === rideId) : [];
  if (rideMatches.length > 0) return seededPick(rideMatches, seed);

  const parkMatches = parkId != null ? BUNDLED_TRIVIA.filter((q) => q.parkId === parkId) : [];
  if (parkMatches.length > 0) return seededPick(parkMatches, seed);

  return seededPick(BUNDLED_TRIVIA, seed);
}

/**
 * Load a lore card for this ride/park. Falls back to the bundled general pool.
 * TODO(Nova): fetch from the Nova lore feed here and merge ahead of bundled.
 */
export async function fetchRideLore(
  rideId: number | undefined,
  parkId: number | undefined,
  seed: number,
): Promise<LoreCard> {
  const rideMatches = rideId != null ? BUNDLED_LORE.filter((l) => l.rideId === rideId) : [];
  if (rideMatches.length > 0) return seededPick(rideMatches, seed);

  const parkMatches = parkId != null ? BUNDLED_LORE.filter((l) => l.parkId === parkId) : [];
  if (parkMatches.length > 0) return seededPick(parkMatches, seed);

  return seededPick(BUNDLED_LORE, seed);
}

/**
 * Build the prediction card for this session: will the real wait beat the
 * posted wait? Resolves at session end via resolvePrediction().
 */
export function buildPredictionCard(postedWaitMinutes: number): PredictionCard {
  return {
    id: `pred-${postedWaitMinutes}`,
    postedWaitMinutes,
    prompt: `Posted wait is ${postedWaitMinutes} min. Will your real wait beat it?`,
    options: ['beat', 'miss'],
  };
}

/**
 * Resolve a prediction against the actual elapsed session time.
 */
export function resolvePrediction(
  card: PredictionCard,
  guess: 'beat' | 'miss',
  actualWaitMinutes: number,
): PredictionResolution {
  const beat = actualWaitMinutes < card.postedWaitMinutes;
  return {
    guess,
    postedWaitMinutes: card.postedWaitMinutes,
    actualWaitMinutes,
    beat,
    correct: (guess === 'beat') === beat,
  };
}
