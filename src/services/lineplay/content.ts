/**
 * LinePlay content loaders — typed trivia, lore, and prediction sources.
 *
 * These feed the LinePlay activity playlist. Everything here is designed to
 * degrade gracefully offline: a ride's authored chapter leads into matching
 * park questions and a bundled general pool. Nothing here throws to the UI.
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
 *   (labels/messages/prompts), not park facts. Until sourced ride content
 *   exists, bundled cards use observation prompts and general ride terms.
 *   TODO(Nova): replace BUNDLED_LORE with a Nova-managed lore feed keyed by
 *   park/ride and fetch it in fetchRideLore.
 */

import { getLinePlayChapterById } from './chapters';

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
  /** Optional short factual reveal after an answer; bundled chapter copy has an editorial source. */
  readonly fact?: string;
  readonly source?: string;
}

export interface LoreCard {
  readonly id: string;
  readonly rideId?: number;
  readonly parkId?: number;
  readonly title: string;
  readonly body: string;
  /** Optional attribution/source line (e.g. "Nova"). */
  readonly source?: string;
  /** Optional stationary, self-reported activity; never awards server currency. */
  readonly challenge?: {
    readonly prompt: string;
    readonly options: readonly {
      readonly label: string;
      readonly task: string;
    }[];
    readonly finish: string;
  };
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
 * General quickfire pool for free play after a ride's opening clues. The
 * original shark puzzles need no network or time-sensitive attraction facts.
 * Park-history questions are checked against the operators' own histories:
 * https://disneyparksblog.com/dlr/today-in-disney-history-disneyland-opens-1955/
 * https://disneyparksblog.com/disney-experiences/yo-ho-yo-ho-the-pirates-conquest-from-disneyland-to-the-big-screen/
 * https://disneyparksblog.com/dlr/today-in-disney-history-haunted-mansion-opening-date-at-disneyland-in-1969/
 * https://disneyparksblog.com/wdw/peak-perfection-space-mountain-at-walt-disney-world-celebrates-50-years/
 * https://disneyparksblog.com/dlr/things-you-might-not-know-about-the-matterhorn-at-disneyland-resort/
 * https://disneyparksblog.com/wdw/disney-world-facts-to-quiz-your-friends-on/
 * https://disneyparksblog.com/dlr/california-adventure-25th-anniversary-offerings/
 * https://www.universalstudioshollywood.com/auditions
 */
const BUNDLED_TRIVIA: readonly TriviaQuestion[] = [
  {
    id: 'gen-1',
    question: 'What is a ride pre-show?',
    choices: ['A themed introduction before boarding', 'The final scene of a ride', 'A parade after closing', 'A queue reserved for performers'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-2',
    question: 'What does the posted wait at an attraction entrance give you?',
    choices: ['An estimate, not an exact boarding time', 'Your exact boarding minute', 'The ride duration', 'The number of vehicles running'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-3',
    question: 'What can happen when a group uses a single-rider queue?',
    choices: ['They may board separately to fill empty seats', 'They always board together', 'They skip every safety check', 'They choose any row'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-4',
    question: 'In park operations, what does a ride vehicle "dispatching" mean?',
    choices: ['It leaves the loading area', 'It changes its theme', 'It opens the park', 'It joins the standby queue'],
    correctIndex: 0,
    difficulty: 'medium',
  },
  {
    id: 'gen-5',
    question: 'What are queue "switchbacks"?',
    choices: ['Back-and-forth lanes that organize a line', 'The first seats on a vehicle', 'A ride vehicle that reverses', 'A park closing announcement'],
    correctIndex: 0,
    difficulty: 'medium',
  },
  {
    id: 'gen-6',
    question: 'What is the "load platform" of an attraction?',
    choices: ['The place guests board the ride vehicle', 'The entrance sign', 'The souvenir store', 'The maintenance workshop'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-7',
    question: 'What does "theming" do in a queue?',
    choices: ['Helps tell the attraction’s story or set its place', 'Guarantees a shorter wait', 'Changes every guest’s ticket', 'Measures the line speed'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-8',
    question: 'What is a dark ride?',
    choices: ['A ride through designed scenes with controlled lighting', 'Any attraction after sunset', 'A ride without a queue', 'Only a roller coaster in a tunnel'],
    correctIndex: 0,
    difficulty: 'medium',
  },
  {
    id: 'gen-9',
    question: 'What is a ride-through video?',
    choices: ['A recording of the experience from a rider’s view', 'A park map animation', 'A live queue camera', 'An employee training badge'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-10',
    question: 'If a ride has temporary downtime, what should your crew expect?',
    choices: ['Operations and the posted wait may change', 'Your boarding minute is guaranteed', 'Every ride in the park closes', 'Your ride coin is automatically awarded'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-11',
    question: 'What does standby usually mean on an attraction sign?',
    choices: ['The regular walk-up queue', 'A separate ride vehicle', 'A private tour', 'A ride photo package'],
    correctIndex: 0,
    difficulty: 'easy',
  },
  {
    id: 'gen-12',
    question: 'What can a repeated symbol in a themed queue do?',
    choices: ['Help guests connect details in the attraction’s story', 'Show the exact wait left', 'Guarantee a hidden prize', 'Replace safety instructions'],
    correctIndex: 0,
    difficulty: 'medium',
  },
  {
    id: 'gen-13', question: 'The shark crew finds ✦ ● ✦ ● ?. Which symbol comes next?',
    choices: ['Star ✦', 'Circle ●', 'Wave ≋', 'Diamond ◆'], correctIndex: 0,
    difficulty: 'easy', fact: 'The two symbols alternate: star, circle, star, circle, star.',
  },
  {
    id: 'gen-14', question: 'A compass points north → east → south → west → ?. Where next?',
    choices: ['North', 'East', 'South', 'West'], correctIndex: 0,
    difficulty: 'medium', fact: 'One more quarter-turn clockwise points north again.',
  },
  {
    id: 'gen-15', question: 'A gate flashes ▲ ▲ ●, then ▲ ▲ ●. What starts the next beat?',
    choices: ['Triangle ▲', 'Circle ●', 'Star ✦', 'Wave ≋'], correctIndex: 0,
    difficulty: 'easy', fact: 'The three-mark beat repeats from its first triangle.',
  },
  {
    id: 'gen-16', question: 'A beacon flashes at 2, 4, and 6 seconds. When is its next flash?',
    choices: ['8 seconds', '7 seconds', '9 seconds', '12 seconds'], correctIndex: 0,
    difficulty: 'easy', fact: 'The beacon flashes every two seconds.',
  },
  {
    id: 'gen-17', question: 'The code says A = wave, B = star, C = shell. What is C-A-B?',
    choices: ['Shell, wave, star', 'Star, wave, shell', 'Wave, shell, star', 'Shell, star, wave'],
    correctIndex: 0, difficulty: 'medium', fact: 'Read C, then A, then B from the code key.',
  },
  {
    id: 'gen-18', question: 'The shell clue comes before the fin; the fin comes before the star. Which is last?',
    choices: ['Star', 'Shell', 'Fin', 'They are tied'], correctIndex: 0,
    difficulty: 'medium', fact: 'Shell → fin → star puts the star last.',
  },
  {
    id: 'gen-19', question: 'Six lanterns glow. Two go dark and one relights. How many glow now?',
    choices: ['Five', 'Four', 'Six', 'Three'], correctIndex: 0,
    difficulty: 'easy', fact: 'Six minus two plus one leaves five glowing lanterns.',
  },
  {
    id: 'gen-20', question: 'One chest holds 3 coins. A second holds twice as many. How many in the second?',
    choices: ['Six', 'Five', 'Nine', 'Three'], correctIndex: 0,
    difficulty: 'easy', fact: 'Twice three coins is six.',
  },
  {
    id: 'gen-21', question: 'Route A takes 3 steps and then 2 more. Route B takes 4. Which is shorter?',
    choices: ['Route B', 'Route A', 'They match', 'Neither has an end'], correctIndex: 0,
    difficulty: 'medium', fact: 'Route A totals five steps; Route B takes four.',
  },
  {
    id: 'gen-22', question: 'Your shark faces north and turns left twice. Which way now?',
    choices: ['South', 'East', 'North', 'West'], correctIndex: 0,
    difficulty: 'medium', fact: 'North → west → south after two left turns.',
  },
  {
    id: 'gen-23', question: 'One bell rings every 2 beats, another every 3. When do they next ring together?',
    choices: ['Beat 6', 'Beat 4', 'Beat 5', 'Beat 9'], correctIndex: 0,
    difficulty: 'hard', fact: 'Six is the first beat divisible by both two and three.',
  },
  {
    id: 'gen-24', question: 'A star chart has 4 rows of 3 stars. How many stars fill it?',
    choices: ['12', '7', '9', '16'], correctIndex: 0,
    difficulty: 'medium', fact: 'Four groups of three stars make twelve.',
  },
  {
    id: 'gen-25', question: 'A note says the safe door is neither red nor blue. The doors are red, blue, and gold. Which one?',
    choices: ['Gold', 'Red', 'Blue', 'None'], correctIndex: 0,
    difficulty: 'easy', fact: 'Gold is the only door left after ruling out red and blue.',
  },
  {
    id: 'gen-26', question: 'The crew must find the map, then the key, then the chest. What comes right before the chest?',
    choices: ['The key', 'The map', 'The chest', 'The compass'], correctIndex: 0,
    difficulty: 'easy', fact: 'The sequence is map → key → chest.',
  },
  {
    id: 'gen-27', question: 'Captain Shark has 5 tickets, uses 2, then finds 1. How many tickets remain?',
    choices: ['Four', 'Three', 'Five', 'Six'], correctIndex: 0,
    difficulty: 'easy', fact: 'Five minus two plus one leaves four tickets.',
  },
  {
    id: 'gen-28', question: 'The shell lock accepts an even number. Which count opens it?',
    choices: ['4 shells', '3 shells', '5 shells', '7 shells'], correctIndex: 0,
    difficulty: 'easy', fact: 'Four is the only even shell count shown.',
  },
  {
    id: 'gen-29', question: 'On this map, a star is worth 2 and a shell is worth 3. What is one of each worth?',
    choices: ['Five', 'Six', 'Four', 'Three'], correctIndex: 0,
    difficulty: 'easy', fact: 'Two plus three equals five.',
  },
  {
    id: 'gen-30', question: 'Every other tile glows, beginning with tile 1. Which tile glows?',
    choices: ['Tile 3', 'Tile 2', 'Tile 4', 'Tile 6'], correctIndex: 0,
    difficulty: 'medium', fact: 'Tiles 1, 3, and 5 glow in that pattern.',
  },
  {
    id: 'gen-31', question: 'Gold is left of blue; red is right of blue. Which mask is in the middle?',
    choices: ['Blue', 'Gold', 'Red', 'None'], correctIndex: 0,
    difficulty: 'medium', fact: 'The only order is gold, blue, red.',
  },
  {
    id: 'gen-32', question: 'Your shark swims 5 steps east, then 5 steps west. Where is it?',
    choices: ['Back at the start', 'Five steps east', 'Five steps west', 'Ten steps east'],
    correctIndex: 0, difficulty: 'easy', fact: 'Equal trips in opposite directions return to the start.',
  },
  {
    id: 'gen-33', question: 'Your shark faces east and turns left. Which way does it face?',
    choices: ['North', 'South', 'West', 'East'], correctIndex: 0,
    difficulty: 'medium', fact: 'A left turn from east points north.',
  },
  {
    id: 'gen-34', question: 'A = 1, B = 2, C = 3. What letters does 3-1-2 spell?',
    choices: ['CAB', 'ABC', 'CBA', 'BAC'], correctIndex: 0,
    difficulty: 'medium', fact: 'Three is C, one is A, and two is B.',
  },
  {
    id: 'gen-35', question: 'Two sharks find 3 clues each, but they both found the same shell. How many different clues?',
    choices: ['Five', 'Six', 'Four', 'Three'], correctIndex: 0,
    difficulty: 'hard', fact: 'Six finds with one shared clue make five different clues.',
  },
  {
    id: 'gen-36', question: 'A bell rings after every 3 steps. How many rings after 9 steps?',
    choices: ['Three', 'Two', 'Four', 'Nine'], correctIndex: 0,
    difficulty: 'easy', fact: 'The bell rings at steps three, six, and nine.',
  },
  {
    id: 'gen-37', parkId: 8, question: 'What year did Disneyland first open?',
    choices: ['1955', '1965', '1975', '1985'], correctIndex: 0,
    difficulty: 'easy', fact: 'Disneyland opened in Anaheim on July 17, 1955.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-38', parkId: 8, question: 'Which Disneyland ride welcomed guests on opening day in 1955?',
    choices: ['Jungle Cruise', 'Haunted Mansion', 'Space Mountain', 'Star Tours'], correctIndex: 0,
    difficulty: 'medium', fact: 'Jungle Cruise was one of Disneyland’s opening-day attractions.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-39', parkId: 8, question: 'Where did Pirates of the Caribbean first open?',
    choices: ['Disneyland', 'Magic Kingdom', 'Tokyo Disneyland', 'Disneyland Paris'], correctIndex: 0,
    difficulty: 'easy', fact: 'The original Pirates of the Caribbean opened at Disneyland in 1967.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-40', parkId: 8, question: 'Before it became a boat ride, what was Pirates of the Caribbean first planned as?',
    choices: ['A walk-through wax museum', 'A spinning coaster', 'A live animal show', 'A train ride'], correctIndex: 0,
    difficulty: 'hard', fact: 'The early Disneyland concept was a walk-through wax museum.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-41', parkId: 8, question: 'What year did Disneyland’s Haunted Mansion open?',
    choices: ['1969', '1955', '1977', '1989'], correctIndex: 0,
    difficulty: 'medium', fact: 'Disneyland’s Haunted Mansion opened on August 9, 1969.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-42', parkId: 8, question: 'Which Space Mountain opened first?',
    choices: ['Magic Kingdom', 'Disneyland', 'Tokyo Disneyland', 'Disneyland Paris'], correctIndex: 0,
    difficulty: 'medium', fact: 'Magic Kingdom opened Space Mountain in 1975; Disneyland followed in 1977.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-43', parkId: 8, question: 'Which year did Disneyland open its Space Mountain?',
    choices: ['1977', '1959', '1969', '1995'], correctIndex: 0,
    difficulty: 'medium', fact: 'Disneyland’s Space Mountain opened on May 27, 1977.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-44', parkId: 8, question: 'Which Disneyland mountain ride opened in 1959?',
    choices: ['Matterhorn Bobsleds', 'Space Mountain', 'Big Thunder Mountain Railroad', 'Splash Mountain'], correctIndex: 0,
    difficulty: 'medium', fact: 'Matterhorn Bobsleds joined Disneyland’s 1959 expansion.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-45', parkId: 8, question: 'The Matterhorn Bobsleds pioneered which coaster feature?',
    choices: ['Tubular steel track', 'Magnetic launch', 'Upside-down loops', 'A wooden track'], correctIndex: 0,
    difficulty: 'hard', fact: 'The Matterhorn was the first roller coaster with tubular steel track.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-46', parkId: 6, question: 'Which holiday shares its date with Animal Kingdom’s 1998 opening?',
    choices: ['Earth Day', 'New Year’s Day', 'Halloween', 'Independence Day'], correctIndex: 0,
    difficulty: 'medium', fact: 'Disney’s Animal Kingdom opened on Earth Day, April 22, 1998.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-47', parkId: 13, question: 'What year did Disney California Adventure open?',
    choices: ['2001', '1982', '1992', '2012'], correctIndex: 0,
    difficulty: 'medium', fact: 'Disney California Adventure opened on February 8, 2001.', source: 'Disney Parks Blog',
  },
  {
    id: 'gen-48', parkId: 1, question: 'In what year did Universal Studios Hollywood’s Studio Tour formally open?',
    choices: ['1964', '1955', '1977', '1990'], correctIndex: 0,
    difficulty: 'hard', fact: 'Universal dates the formal opening of the Studio Tour to 1964.', source: 'Universal Studios Hollywood',
  },
];

/**
 * Bundled placeholder lore. TODO(Nova): replace with a sourced feed.
 * Observation prompts keep the queue activity useful without inventing park facts.
 */
const BUNDLED_LORE: readonly LoreCard[] = [
  { id: 'lore-1', title: 'Set the Scene', body: 'Look around the queue. Which prop tells you the most about the story you are about to enter?' },
  { id: 'lore-2', title: 'Sound Check', body: 'Listen for a sound cue that repeats. Does it feel like a warning, an invitation, or a joke?' },
  { id: 'lore-3', title: 'Beat the Sign', body: 'Remember the posted wait. You can predict whether your actual wait will be shorter when the prediction card appears.' },
  { id: 'lore-4', title: 'A First Impression', body: 'What does the entrance make you expect about this ride? Remember your guess and compare it after boarding.' },
  { id: 'lore-5', title: 'Seat Strategy', body: 'If you could pick any seat, would you choose the view, the thrill, or a spot beside your group?' },
  { id: 'lore-6', title: 'Soundtrack', body: 'Listen from where you stand. Does the queue use music, spoken words, or ambient sound to set its mood?' },
  { id: 'lore-7', title: 'Spot the Detail', body: 'Pick a tiny detail in the queue and show it to someone in your group. Did they spot it first?' },
  { id: 'lore-8', title: 'Dispatch Watch', body: 'If you can see vehicles leave the station, count how many depart in one minute.' },
  { id: 'lore-9', title: 'Story Clue', body: 'Choose a sign, poster, or object you think will matter later in the ride. Check your theory after riding.' },
  { id: 'lore-10', title: 'Line Forecast', body: 'Is your line moving faster or slower than it was five minutes ago? Make a guess before checking the clock.' },
  { id: 'lore-11', title: 'The Reveal', body: 'What do you think the ride is keeping hidden until you board? Tell your crew one prediction.' },
  { id: 'lore-12', title: 'Group Debate', body: 'Everyone in your group gets one vote: what will be the most memorable moment of this ride?' },
  { id: 'lore-13', title: 'Pre-Show Prediction', body: 'If there is a pre-show, guess which detail is a clue to the ride experience.' },
  { id: 'lore-14', title: 'Three Clues', body: 'From your place, notice a color, a shape, and a sound. If the queue is plain, invent the third clue for your shark crew.' },
  { id: 'lore-15', title: 'Scent Memory', body: 'Notice whether this area has a distinctive smell. Does it fit the story or remind you of another attraction?' },
  { id: 'lore-16', title: 'Crew Appreciation', body: 'Watch how the crew keeps boarding moving. What job would you want at this ride?' },
  { id: 'lore-17', title: 'Memory Souvenir', body: 'Before you board, choose one detail you want to remember. Tell your crew, or check whether you can recall it after the ride.' },
  { id: 'lore-18', title: 'Park Debate', body: 'Which nearby ride should your group visit next? Make the case in one sentence.' },
  { id: 'lore-19', title: 'Time Capsule', body: 'Describe this queue in three words. Compare your answer with a friend after the ride.' },
  { id: 'lore-20', title: 'Snack Power-Up', body: 'If your shark could bring one park snack into the queue, what would it choose?' },
];

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function seededPick<T>(items: readonly T[], seed: number): T {
  if (items.length === 0) throw new Error('seededPick: empty array');
  const idx = Math.abs(Math.floor(seed)) % items.length;
  return items[idx];
}

function varyTriviaChoices(question: TriviaQuestion, seed: number): TriviaQuestion {
  const order = question.choices.map((_, index) => index);
  let state = (Math.abs(Math.floor(seed)) + question.id.length + 1) >>> 0;
  for (let index = order.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return {
    ...question,
    choices: order.map((index) => question.choices[index]),
    correctIndex: order.indexOf(question.correctIndex),
  };
}

/**
 * Load a trivia question for this ride. Its eligible deck puts ride and park
 * questions before general fallback questions, avoiding cross-park trivia.
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
  chapterId?: string,
): Promise<TriviaQuestion> {
  const chapter = getLinePlayChapterById(chapterId);
  if (chapter?.trivia.length && seed < chapter.trivia.length)
    return varyTriviaChoices(seededPick(chapter.trivia, seed), seed);
  const rideMatches = rideId == null ? [] : BUNDLED_TRIVIA.filter((q) => q.rideId === rideId);
  const parkMatches = parkId == null ? [] : BUNDLED_TRIVIA.filter((q) => q.parkId === parkId && q.rideId == null);
  const general = BUNDLED_TRIVIA.filter((q) => q.parkId == null && q.rideId == null);
  // Put local fandom first, then use the large general deck. Filtering to only
  // park questions makes a short local deck repeat during the same wait.
  const eligible = parkId == null ? BUNDLED_TRIVIA : [...rideMatches, ...parkMatches, ...general];
  const fallbackSeed = chapter ? Math.max(0, seed - chapter.trivia.length) : seed;
  return varyTriviaChoices(seededPick(eligible, fallbackSeed), seed);
}

/**
 * Load a lore card for this ride/park. Falls back to the bundled general pool.
 * TODO(Nova): fetch from the Nova lore feed here and merge ahead of bundled.
 */
export async function fetchRideLore(
  rideId: number | undefined,
  parkId: number | undefined,
  seed: number,
  chapterId?: string,
): Promise<LoreCard> {
  const chapter = getLinePlayChapterById(chapterId);
  if (chapter) return seededPick(chapter.fieldNotes, seed);
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
