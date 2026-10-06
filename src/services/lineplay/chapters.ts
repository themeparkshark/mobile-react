import type { LoreCard, TriviaQuestion } from './content';
import { deckIdForRideName, type RideDeckId } from '../rideTheme';

export interface LinePlayChapter {
  readonly id: string;
  /** Adaptive chapters use original fiction and general trivia, not verified attraction facts. */
  readonly adaptive?: boolean;
  /** Featured opening mission uses an original playable signal circuit. */
  readonly navigationPanel?: boolean;
  /** Stories this ride rotates through, one per wait (returning players get the next). */
  readonly episodeCount?: number;
  /** Small caps label for a returning player's episode, e.g. "FLIGHT 2 OF 3". */
  readonly episodeLabel?: string;
  /** A returning flight opens on the bigger 4x4 navigation board. */
  readonly returningFlight?: boolean;
  readonly parkLabel: string;
  readonly title: string;
  readonly story: string;
  readonly completedTitle: string;
  readonly completedStory: string;
  readonly progressNoun: string;
  readonly missionNames: readonly [string, string, string];
  readonly finale: { readonly idSuffix: string; readonly title: string; readonly preview: string;
    readonly memoryDeckId: string; readonly gameId?: 'memory' | 'tap' | 'shark' };
  readonly relay: {
    readonly title: string;
    readonly setupStory: string;
    readonly firstTurnTitle: string;
    readonly firstClueFound: string;
    readonly missedClue: string;
    readonly scoreNoun: string;
    readonly routeTitle: string;
    readonly routeOptions: readonly [string, string];
    readonly perfectResult: string;
    readonly otherResult: string;
    readonly alphaResult: string;
    readonly omegaResult: string;
    readonly completionNote: string;
    readonly branchKicker: string;
    readonly branchDone: string;
    readonly routeNames: readonly [string, string];
    readonly epilogues: {
      readonly alpha: { readonly title: string; readonly prompt: string };
      readonly omega: { readonly title: string; readonly prompt: string };
    };
  };
  readonly trivia: readonly TriviaQuestion[];
  readonly fieldNotes: readonly LoreCard[];
  /** Fin-ister Nights haunt lines only: the night palette. Every other chapter stays bright. */
  readonly palette?: 'night';
  /** One line shown as the chapter opens (the Shusher in haunt lines). */
  readonly introLine?: string;
}

const adaptiveChapters = new Map<string, LinePlayChapter>();

type AdaptiveStory = { readonly title: string; readonly artifact: string; readonly clue: string;
  readonly routeA: string; readonly routeB: string };

/** Self-contained fictional clues for a ride without reviewed attraction facts. */
function adaptiveClueQuestions(chapterId: string, story: AdaptiveStory): readonly TriviaQuestion[] {
  return [
    {
      id: `${chapterId}-signal-pattern`,
      question: `A message beside the ${story.artifact} reads star, circle, star, circle, then a gap. Which mark completes it?`,
      choices: ['Star', 'Circle', 'Wave', 'Diamond'], correctIndex: 0,
      difficulty: 'easy', fact: 'The star and circle alternate, so the next mark is a star.',
    },
    {
      id: `${chapterId}-compass-code`,
      question: `Your shark’s compass flashes twice for a real clue and once for a decoy. The ${story.clue} flashes twice. What did the crew find?`,
      choices: ['A real clue', 'A decoy', 'An empty compass', 'The end of the trail'], correctIndex: 0,
      difficulty: 'easy', fact: `Two flashes mean the ${story.clue} is a real clue in this shark story.`,
    },
    {
      id: `${chapterId}-trail-order`,
      question: `The map to the ${story.artifact} says: find the ${story.clue}, then choose a route. What should your crew do first?`,
      choices: [`Find the ${story.clue}`, 'Choose a route', 'Open the treasure', 'Mark the finish'], correctIndex: 0,
      difficulty: 'easy', fact: `The ${story.clue} comes before the route choice. Your crew decides the ending later.`,
    },
    {
      id: `${chapterId}-three-beat-lock`,
      question: `The ${story.artifact} lock shows diamond, circle, circle, diamond, circle, circle. Which mark starts its next beat?`,
      choices: ['Circle', 'Diamond', 'Star', 'Wave'], correctIndex: 1,
      difficulty: 'medium', fact: 'The three-mark beat repeats: diamond, circle, circle.',
    },
    {
      id: `${chapterId}-compass-turn`,
      question: `Your shark traces the ${story.clue} on a compass: north, then east, then south. Which way comes next?`,
      choices: ['North', 'South', 'West', 'East'], correctIndex: 2,
      difficulty: 'medium', fact: 'Each arrow turns one quarter clockwise, so west follows south.',
    },
    {
      id: `${chapterId}-symbol-order`,
      question: `A note beside the ${story.artifact} says 1 is a star, 2 is a circle, 3 is a diamond. What does the code 3-1-2 show?`,
      choices: ['Star, circle, diamond', 'Circle, diamond, star',
        'Diamond, circle, star', 'Diamond, star, circle'], correctIndex: 3,
      difficulty: 'medium', fact: 'Read the key in order: 3 is diamond, 1 is star, and 2 is circle.',
    },
  ];
}

/** Original shark fiction and matching card art; the name supplies a theme, never attraction facts. */
const ADAPTIVE_STORIES: Record<RideDeckId, readonly AdaptiveStory[]> = {
  park: [
    { title: 'The Missing Park Map', artifact: 'park map', clue: 'landmark', routeA: 'Follow the signs', routeB: 'Explore the midway' },
    { title: 'The Lost Golden Ticket', artifact: 'golden ticket', clue: 'stamp', routeA: 'Trace the ticket', routeB: 'Search the fair' },
    { title: 'The Vanishing Parade Plan', artifact: 'parade plan', clue: 'color', routeA: 'Follow the bunting', routeB: 'Check the plaza' },
  ],
  space: [
    { title: 'The Lost Star Chart', artifact: 'star chart', clue: 'starlight', routeA: 'Follow the stars', routeB: 'Chart a new orbit' },
    { title: 'The Silent Space Beacon', artifact: 'space beacon', clue: 'signal', routeA: 'Hold the signal', routeB: 'Search the galaxy' },
    { title: 'The Drifting Moon Capsule', artifact: 'moon capsule', clue: 'orbit', routeA: 'Plot a return', routeB: 'Search the crater' },
  ],
  pirates: [
    { title: 'The Secret Harbor Map', artifact: 'harbor map', clue: 'bearing', routeA: 'Stay the course', routeB: 'Explore the cove' },
    { title: 'The Lost Captain’s Key', artifact: 'captain’s key', clue: 'mark', routeA: 'Follow the map', routeB: 'Search the deck' },
    { title: 'The Missing Lighthouse Lens', artifact: 'lighthouse lens', clue: 'glimmer', routeA: 'Follow the light', routeB: 'Sail into the fog' },
  ],
  mansion: [
    { title: 'The Missing Guest Book', artifact: 'guest book', clue: 'signature', routeA: 'Follow the candlelight', routeB: 'Explore the hall' },
    { title: 'The Whispering Lantern', artifact: 'lantern', clue: 'whisper', routeA: 'Follow the glow', routeB: 'Search the shadows' },
    { title: 'The Vanishing Portrait', artifact: 'portrait', clue: 'outline', routeA: 'Follow the frame', routeB: 'Explore the gallery' },
  ],
  backlot: [
    { title: 'The Missing Backlot Reel', artifact: 'film reel', clue: 'frame', routeA: 'Follow the scene', routeB: 'Search the set' },
    { title: 'The Lost Scene Card', artifact: 'scene card', clue: 'take', routeA: 'Roll the camera', routeB: 'Find another angle' },
    { title: 'The Missing Sound Cue', artifact: 'sound cue', clue: 'echo', routeA: 'Follow the audio', routeB: 'Search backstage' },
  ],
  ocean: [
    { title: 'The Missing Tide Map', artifact: 'tide map', clue: 'current', routeA: 'Follow the current', routeB: 'Explore the reef' },
    { title: 'The Lost Beacon', artifact: 'beacon', clue: 'signal', routeA: 'Hold the signal', routeB: 'Search the deep' },
    { title: 'The Vanishing Reef Pearl', artifact: 'reef pearl', clue: 'shimmer', routeA: 'Follow the bubbles', routeB: 'Search the coral' },
  ],
  jungle: [
    { title: 'The Missing River Log', artifact: 'river log', clue: 'waterline', routeA: 'Follow the bend', routeB: 'Search the shallows' },
    { title: 'The Lost River Compass', artifact: 'river compass', clue: 'bearing', routeA: 'Read the current', routeB: 'Explore the bank' },
    { title: 'The Missing Canopy Signal', artifact: 'canopy signal', clue: 'shadow', routeA: 'Follow the leaves', routeB: 'Search the riverbank' },
  ],
};

/** A repeatable, offline shark adventure for rides without an editorial chapter. */
function adaptiveChapter(parkId: number | undefined, rideSlug: string | undefined, rideName: string,
  episodeSeed?: number): LinePlayChapter {
  const safeName = rideName.trim().slice(0, 60);
  const slug = (rideSlug?.trim() || safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    .toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 70) || 'ride';
  const rideTheme = deckIdForRideName(safeName);
  const stories = ADAPTIVE_STORIES[rideTheme];
  const episode = episodeSeed == null ? null : Math.abs(Math.floor(episodeSeed)) % stories.length;
  const id = `queue-${parkId ?? 0}-${slug}${episode == null ? '' : `-episode-${episode}`}`; // clarity-allow: id
  const cached = adaptiveChapters.get(id);
  if (cached) return cached;

  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const storyIndex = episode ?? hash % stories.length;
  const story = stories[storyIndex];
  const finaleGameId = (['memory', 'tap', 'shark'] as const)[storyIndex % 3];
  const finaleTitle = finaleGameId === 'memory' ? `Rebuild the ${story.artifact}`
    : finaleGameId === 'tap' ? `Follow the ${story.clue}`
      : `Search for the ${story.artifact}`;
  const finalePreview = finaleGameId === 'memory'
    ? 'Match illustrated symbols in a quick memory round. Play solo or let your crew call out the pairs.'
    : finaleGameId === 'tap'
      ? 'Tap the sharks that pop up with the clue and skip the decoys. One thumb is all it takes.'
      : `Guide your shark through a short swim to find the ${story.artifact}. One thumb, about a minute.`;
  const chapter: LinePlayChapter = {
    id, adaptive: true, episodeCount: stories.length, parkLabel: 'YOUR QUEUE',
    title: story.title,
    story: `While you wait for ${safeName}, your shark crew needs to recover a ${story.artifact}. Solve a clue, notice something from your place in line, then rebuild it together.`,
    completedTitle: `${story.artifact[0].toUpperCase()}${story.artifact.slice(1)} recovered!`,
    completedStory: 'Your crew finished this queue adventure. Try the relay or another game while your time near the ride keeps earning Ride Parts.',
    progressNoun: 'clues found',
    missionNames: ['Decode a clue', 'Notice a signal', finaleTitle],
    finale: {
      idSuffix: 'finale', title: finaleTitle, preview: finalePreview,
      memoryDeckId: rideTheme, gameId: finaleGameId,
    },
    relay: {
      title: `${story.title} Crew Relay`,
      setupStory: 'Four short turns let your crew choose the ending. Play solo or pass one phone around your crew as the line shuffles forward.',
      firstTurnTitle: 'Decode the first clue',
      firstClueFound: `The Navigator found the first ${story.clue}.`,
      missedClue: 'The Navigator missed a clue. Your crew can still finish the adventure.',
      scoreNoun: 'Clues solved',
      routeTitle: 'Choose the shark crew’s route',
      routeOptions: [story.routeA, story.routeB],
      perfectResult: 'Adventure complete!', otherResult: 'Your crew chose a route!',
      alphaResult: `Your shark follows the first ${story.clue} toward the ${story.artifact}.`,
      omegaResult: `Your shark explores another way to find the ${story.artifact}.`,
      completionNote: 'Your path opened another extra game in this queue adventure. Your time near the ride earns Ride Parts and tickets.',
      branchKicker: 'YOUR CREW CHANGED THE STORY',
      branchDone: 'Your crew finished its chosen route. It stays in your queue recap.',
      routeNames: [story.routeA, story.routeB],
      epilogues: {
        alpha: { title: story.routeA, prompt: 'Tap the sharks that surface along the chosen route and skip the decoys.' },
        omega: { title: story.routeB, prompt: 'Swim through a quick challenge to explore the route your crew chose.' },
      },
    },
    // These clue questions use only this original shark story. Later free-play
    // rounds can draw from the bundled general deck without inventing ride facts.
    trivia: adaptiveClueQuestions(id, story),
    fieldNotes: [
      { id: `${id}-note-1`, title: 'Find a Crew Signal', body: 'Choose one detail you can notice without leaving your place in line.', challenge: {
        prompt: 'What will your shark crew notice?',
        options: [
          { label: 'A color', task: `Pick a color you can see. How could it help find the ${story.artifact}?` },
          { label: 'A shape', task: `Pick a shape you can see. Turn it into a clue about the ${story.artifact}.` },
          { label: 'A sound', task: `Listen for a nearby sound. Imagine what it tells your shark crew about the ${story.artifact}.` },
        ],
        finish: 'Share your clue with your crew or keep it as a solo discovery. No photo or extra walking needed.',
      } },
      { id: `${id}-note-2`, title: 'Three Word Clue', body: 'Describe one safe detail nearby in three words. Let someone else guess it, or test your own memory a minute from now.', challenge: {
        prompt: 'How will your crew make the clue?',
        options: [
          { label: 'Describe it', task: 'Choose a detail you can see from your place. Give three words and let the crew guess.' },
          { label: 'Guess it', task: 'Ask a crewmate for three words, then guess the detail without leaving your place.' },
          { label: 'Remember it', task: 'Keep three clue words in mind. Test yourself a minute from now.' },
        ],
        finish: 'Keep the clue as part of your shark story. No photo or extra walking needed.',
      } },
      { id: `${id}-note-3`, title: 'Shark Crew Vote', body: `Would your shark choose “${story.routeA}” or “${story.routeB}”? Let everyone give one reason before the captain decides.`, challenge: {
        prompt: 'How will your crew decide?',
        options: [
          { label: 'Known route', task: `Make the case for “${story.routeA}” in one sentence.` },
          { label: 'New route', task: `Make the case for “${story.routeB}” in one sentence.` },
          { label: 'Crew debate', task: 'Hear one reason for each route, then choose the stronger story together.' },
        ],
        finish: 'This is your field-note clue; the later Crew Relay makes the actual route choice.',
      } },
      { id: `${id}-note-4`, title: 'Pattern Watch', body: 'From your place in line, notice a repeating color, shape, or sound. Can your crew predict what comes next?' },
      { id: `${id}-note-5`, title: 'Memory Signal', body: 'Remember three details you can see from your spot. Look away, recall them in order, and compare with a crewmate.' },
      { id: `${id}-note-6`, title: 'After the Ride', body: `Before you board ${safeName}, pick one moment you hope to remember. Ask your crew about theirs after the ride.` },
    ],
  };
  adaptiveChapters.set(id, chapter);
  return chapter;
}

export function adaptiveEpisodeCountForRide(rideName: string): number {
  return ADAPTIVE_STORIES[deckIdForRideName(rideName)].length;
}

/**
 * Original shark fiction around a real attraction. Factual question answers
 * are checked against Disney's own attraction and 50th-anniversary material:
 * https://disneyworld.disney.go.com/attractions/magic-kingdom/space-mountain/
 * https://disneyparksblog.com/wdw/peak-perfection-space-mountain-at-walt-disney-world-celebrates-50-years/
 * https://disneyparksblog.com/app/uploads/2025/01/Space-Mountain-Walt-Disney-World-Facts.pdf
 * This chapter is for Magic Kingdom only; Disneyland's ride differs.
 */
const MAGIC_KINGDOM_SPACE_MOUNTAIN: LinePlayChapter = {
  id: 'mk-space-mountain',
  navigationPanel: true,
  episodeCount: 3,
  episodeLabel: 'FLIGHT 1 OF 3',
  parkLabel: 'MAGIC KINGDOM',
  title: 'The Lost Star Chart',
  story: 'Your shark navigator lost three signals on the way to the stars. Repair the navigation panel, find a clue in your surroundings, then rebuild the chart together.',
  completedTitle: 'Star chart restored!',
  completedStory: 'Your shark has all three signals. Finish your wait with the crew challenge or another quick game. Your time near the ride still earns Ride Parts.',
  progressNoun: 'signals found',
  missionNames: ['Repair the navigation panel', 'Find the missing signal', 'Rebuild the star chart'],
  finale: { idSuffix: 'star-chart', title: 'Rebuild the Star Chart',
    preview: 'Match space symbols to restore your shark’s missing chart. Race solo or let your crew call out the pairs.',
    memoryDeckId: 'space' },
  relay: {
    title: 'Star Chart Crew Relay',
    setupStory: 'Four short turns build one flight plan. Play solo or pass one phone around your crew as the line shuffles forward.',
    firstTurnTitle: 'Decode the starport',
    firstClueFound: 'The Navigator found the first signal.',
    missedClue: 'The Navigator missed a signal. The crew can still finish the chart.',
    scoreNoun: 'Signals solved',
    routeTitle: 'Choose the flight path',
    routeOptions: ['Alpha · follow the known signal', 'Omega · search for a new one'],
    perfectResult: 'Flight plan complete!', otherResult: 'Your crew made a flight plan!',
    alphaResult: 'Your shark follows the Alpha trail, using the clue your Lookout found to steer toward the next star.',
    omegaResult: 'Your shark follows the Omega trail, taking the long way around to search for a new signal.',
    completionNote: 'Your path opened a new round next in the chapter. Swipe to play it. Your flight plan will appear in the queue recap. Your time near the ride still earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE FLIGHT PLAN',
    branchDone: 'Your crew finished its chosen route. The flight plan stays in your queue recap.',
    routeNames: ['Alpha', 'Omega'],
    epilogues: {
      alpha: { title: 'Hold the Alpha Signal', prompt: 'Tap the signal sharks as they surface along the known flight path. Skip the decoys.' },
      omega: { title: 'Search the Omega Trail', prompt: 'Swim into the unknown and look for the signal your crew missed.' },
    },
  },
  trivia: [
    { id: 'mk-sm-1', question: 'In what year did Magic Kingdom’s Space Mountain open?', choices: ['1975', '1971', '1977', '1983'], correctIndex: 0, difficulty: 'easy', fact: 'Magic Kingdom’s Space Mountain opened in 1975.', source: 'Disney Parks Blog' },
    { id: 'mk-sm-2', question: 'What are the two Magic Kingdom Space Mountain tracks called?', choices: ['Alpha and Omega', 'North and South', 'Comet and Meteor', 'Launch and Landing'], correctIndex: 0, difficulty: 'medium', fact: 'The two ride tracks are named Alpha and Omega.', source: 'Disney Parks Blog' },
    { id: 'mk-sm-3', question: 'Which Magic Kingdom land is home to Space Mountain?', choices: ['Tomorrowland', 'Adventureland', 'Fantasyland', 'Frontierland'], correctIndex: 0, difficulty: 'easy', fact: 'Space Mountain is one of Tomorrowland’s attractions.', source: 'Walt Disney World' },
    { id: 'mk-sm-4', question: 'Which Disney Space Mountain opened first?', choices: ['Magic Kingdom’s', 'Disneyland’s', 'Tokyo Disneyland’s', 'Disneyland Paris’s'], correctIndex: 0, difficulty: 'medium', fact: 'The Magic Kingdom version came first, opening in 1975.', source: 'Disney Parks Blog' },
    { id: 'mk-sm-5', question: 'How many astronauts joined Space Mountain’s 1975 opening celebration?', choices: ['Three', 'One', 'Five', 'Ten'], correctIndex: 0, difficulty: 'medium', fact: 'Three astronauts joined the opening celebration.', source: 'Disney Parks Blog' },
    { id: 'mk-sm-6', question: 'What kind of ride does Disney describe Space Mountain as?', choices: ['A roller coaster in the dark', 'An outdoor boat ride', 'A drop tower', 'A spinning simulator'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes this attraction as a roller coaster through the dark.', source: 'Walt Disney World' },
    { id: 'mk-sm-7', question: 'Which Imagineer designed Space Mountain’s conical exterior?', choices: ['John Hench', 'Mary Blair', 'Marc Davis', 'Bob Gurr'], correctIndex: 0, difficulty: 'hard', fact: 'Imagineer John Hench designed the distinctive conical exterior.', source: 'Disney Parks Blog' },
    { id: 'mk-sm-8', question: 'What year is referenced by “Starport Seven-Five” at the gateway?', choices: ['1975', '1955', '1985', '2005'], correctIndex: 0, difficulty: 'hard', fact: '“Seven-Five” refers to the ride’s 1975 opening year.', source: 'Disney Parks Blog' },
  ],
  fieldNotes: [
    { id: 'mk-sm-note-1', title: 'Mission Control', body: 'Your navigator needs a flight name. Choose one safe clue to notice from your place in line.', challenge: {
      prompt: 'What will your crew use to name its ship?',
      options: [
        { label: 'A shape', task: 'Look for a shape from where you stand. Turn it into the first word of a shark spaceship name.' },
        { label: 'A color', task: 'Spot a color around you. Pair it with a space word to name your shark ship.' },
        { label: 'A sound', task: 'Listen for a sound. Give it a spaceship name your crew can remember.' },
      ],
      finish: 'Tell your crew the name, or keep it as your solo call sign. No photo or extra walking needed.',
    } },
    { id: 'mk-sm-note-2', title: 'Signal Search', body: 'Choose one sound or visual detail you can notice without leaving your place in line. Describe it in three words; let someone else guess what you noticed.', challenge: {
      prompt: 'How will you decode the signal?',
      options: [
        { label: 'Describe it', task: 'Give your crew three words for one detail you can notice from your place.' },
        { label: 'Guess it', task: 'Ask a crewmate for three clue words, then guess the detail.' },
        { label: 'Remember it', task: 'Hold three clue words in mind and recall them a minute from now.' },
      ],
      finish: 'Your three words become this mission’s signal. Stay in your place in line.',
    } },
    { id: 'mk-sm-note-3', title: 'Two Flight Paths', body: 'Disney calls this ride’s two tracks Alpha and Omega. Which name would your shark choose for a first flight?', source: 'Disney Parks Blog', challenge: {
      prompt: 'Which path inspires your clue?',
      options: [
        { label: 'Alpha', task: 'Tell your crew why your shark would follow the known Alpha signal.' },
        { label: 'Omega', task: 'Tell your crew why your shark would search along the Omega trail.' },
        { label: 'Ask the crew', task: 'Let everyone choose a path and hear one reason for each.' },
      ],
      finish: 'This field note inspires the chart; the later Crew Relay chooses the flight path.',
    } },
    { id: 'mk-sm-note-4', title: 'A Dark Voyage', body: 'Disney calls this ride a roller coaster in the dark. Before you ride, guess which sense will help most: sight, sound, or feeling the motion.', source: 'Walt Disney World' },
    { id: 'mk-sm-note-5', title: 'Star Chart', body: 'Pick three objects you can see from your place in line. Remember their order, look away, and ask a friend to quiz you. Solo? Test yourself a minute from now.' },
    { id: 'mk-sm-note-6', title: 'Launch Debate', body: 'Would your shark rather navigate by a star, a comet, or a planet? Everyone gets one vote; explain your pick in one sentence.' },
  ],
};

/**
 * Returning Magic Kingdom navigators fly on. Each wait at Space Mountain is
 * one flight: flight 1 is the original chart above, then a strange signal
 * answers, then a comet crosses the course. Every flight keeps the same three
 * beats (repair the panel, decode the signal, fly the chart home) with its own
 * signal notes, finale and crew endings, and returning flights open on the
 * bigger board. All of it is original shark fiction; the trivia deck and the
 * sourced notes are shared with flight 1 and unchanged.
 */
type SpaceFlight = Pick<LinePlayChapter, 'title' | 'story' | 'completedTitle' | 'completedStory' | 'missionNames'> & {
  readonly finale: { readonly title: string; readonly preview: string };
  readonly relay: Pick<LinePlayChapter['relay'], 'firstTurnTitle' | 'routeTitle' | 'routeOptions' | 'routeNames' |
    'alphaResult' | 'omegaResult' | 'perfectResult' | 'epilogues'>;
  readonly signalNotes: readonly [LoreCard, LoreCard, LoreCard];
};

const MK_SPACE_FLIGHTS: readonly SpaceFlight[] = [
  {
    title: 'The Strange Signal',
    story: 'Last flight your chart came home, and something answered it. A strange signal is pulsing from deep space. Repair the relay, decode who is calling, then fly the chart to its source.',
    completedTitle: 'Signal answered!',
    completedStory: 'Your shark crew found the source of the strange signal. Keep playing while your time near the ride earns Ride Parts.',
    missionNames: ['Repair the signal relay', 'Decode the strange signal', 'Fly to the source'],
    finale: { title: 'Fly to the Source', preview: 'Match space symbols to lock your course onto the strange signal. Race solo or let your crew call out the pairs.' },
    relay: {
      firstTurnTitle: 'Decode the first pulse',
      routeTitle: 'How will your crew answer?',
      routeOptions: ['Beacon · flash a friendly reply', 'Silent · listen before you answer'],
      routeNames: ['Beacon', 'Silent'],
      perfectResult: 'Signal answered!',
      alphaResult: 'Your shark flashes the beacon, and the signal flashes right back. Someone out there wants to meet your crew.',
      omegaResult: 'Your shark goes quiet and listens. The signal repeats, and your crew hears a pattern nobody noticed before.',
      epilogues: {
        alpha: { title: 'Flash the Beacon', prompt: 'Tap the signal sharks as they surface to answer the call. Skip the decoys.' },
        omega: { title: 'Listen in the Dark', prompt: 'Swim quietly through the dark and follow the signal to its source.' },
      },
    },
    signalNotes: [
      { id: 'mk-sm-f2-note-1', title: 'Three Blips and a Pause', body: 'The strange signal repeats: three blips, a pause, one blip. Find something near you that could be its reply.', challenge: {
        prompt: 'What will your crew send back?',
        options: [
          { label: 'A rhythm', task: 'Tap the signal on your leg: three, pause, one. Ask your crew to answer with their own beat.' },
          { label: 'A color', task: 'Pick a color you can see. Tell your crew what the signal would look like in that color.' },
          { label: 'A word', task: 'Give the signal a one-word name your crew will remember.' },
        ],
        finish: 'Your reply is logged. The finale flies toward it.',
      } },
      { id: 'mk-sm-f2-note-2', title: 'Who Is Calling?', body: 'Your navigator thinks the strange signal is a message. Your crew gets one guess about who sent it.', challenge: {
        prompt: 'Who is calling your shark crew?',
        options: [
          { label: 'A lost ship', task: 'In one sentence, tell your crew where the lost ship is trying to go.' },
          { label: 'A new planet', task: 'Name the planet and one thing a shark could find there.' },
          { label: 'An old friend', task: 'Tell your crew which shark from an earlier flight is calling back.' },
        ],
        finish: 'Keep the answer. Your crew finds out at the source.',
      } },
      { id: 'mk-sm-f2-note-3', title: 'Signal Strength', body: 'The signal gets stronger when your crew agrees. Everyone picks a number from one to five in secret. Then show them all at once.', challenge: {
        prompt: 'How will your crew boost the signal?',
        options: [
          { label: 'Match numbers', task: 'Reveal together. Every matching number adds a bar of signal.' },
          { label: 'Count up', task: 'Take turns saying one number each, one to five, without talking over each other.' },
          { label: 'Solo tune', task: 'Pick a number, look away, and see if you remember it a minute from now.' },
        ],
        finish: 'Signal locked. No photo or extra walking needed.',
      } },
    ],
  },
  {
    title: 'The Comet Detour',
    story: 'A comet just crossed your flight path and scrambled the course. Reroute the navigation panel, read the comet’s tail, then rebuild the chart before it passes.',
    completedTitle: 'Course rerouted!',
    completedStory: 'Your shark crew slipped past the comet with the chart in one piece. Keep playing while your time near the ride earns Ride Parts.',
    missionNames: ['Reroute the navigation panel', 'Read the comet’s tail', 'Rebuild the chart'],
    finale: { title: 'Rebuild the Chart', preview: 'Match space symbols before the comet’s tail passes. Race solo or let your crew call out the pairs.' },
    relay: {
      firstTurnTitle: 'Spot the comet',
      routeTitle: 'Which way around the comet?',
      routeOptions: ['Tail · ride the sparkle trail', 'Wide · swing out past it'],
      routeNames: ['Tail', 'Wide'],
      perfectResult: 'Comet cleared!',
      alphaResult: 'Your shark rides the sparkle trail, and the comet dust lights up the missing stars on your chart.',
      omegaResult: 'Your shark swings wide around the comet and spots a brand new star to add to the chart.',
      epilogues: {
        alpha: { title: 'Ride the Sparkle Trail', prompt: 'Tap the sharks that surface in the comet dust. Skip the decoys.' },
        omega: { title: 'Swing Out Wide', prompt: 'Swim the long way around and look for the new star your crew spotted.' },
      },
    },
    signalNotes: [
      { id: 'mk-sm-f3-note-1', title: 'Comet Colors', body: 'The comet’s tail flashes three colors in a row. Pick three colors you can see from your place and put them in order.', challenge: {
        prompt: 'How will your crew read the tail?',
        options: [
          { label: 'Name them', task: 'Say your three colors in order. Can a crewmate repeat them backward?' },
          { label: 'Guess them', task: 'Ask a crewmate for their three colors, then guess which one they saw first.' },
          { label: 'Hold them', task: 'Keep your three colors in mind and check them a minute from now.' },
        ],
        finish: 'The tail is read. Your finale follows those colors.',
      } },
      { id: 'mk-sm-f3-note-2', title: 'Comet Name', body: 'Every comet your crew spots gets a name. Build one from something you can notice without leaving your place.', challenge: {
        prompt: 'What will you name the comet?',
        options: [
          { label: 'A shape', task: 'Pick a shape nearby and turn it into the comet’s first name.' },
          { label: 'A sound', task: 'Listen for a sound and turn it into the comet’s last name.' },
          { label: 'Crew vote', task: 'Everyone offers one name. The funniest one wins.' },
        ],
        finish: 'The comet is named and logged on your chart.',
      } },
      { id: 'mk-sm-f3-note-3', title: 'Brace for Dust', body: 'Comet dust shakes the ship. Your crew picks how the shark pilot holds the course.', challenge: {
        prompt: 'How does your pilot hold on?',
        options: [
          { label: 'Steady', task: 'Tell your crew one thing that keeps you calm on a bumpy ride.' },
          { label: 'Fast', task: 'Tell your crew the fastest ride you have ever been on.' },
          { label: 'Together', task: 'Everyone says one word at the same time. Did anyone match?' },
        ],
        finish: 'The course holds. No photo or extra walking needed.',
      } },
    ],
  },
];

export const MK_SPACE_FLIGHT_COUNT = MK_SPACE_FLIGHTS.length + 1;
const mkSpaceFlights = new Map<number, LinePlayChapter>();

/** Flight 1 is the original chart; flights 2 and 3 are returning-player episodes. */
function magicKingdomSpaceFlight(episode: number): LinePlayChapter {
  const index = ((Math.floor(episode) % MK_SPACE_FLIGHT_COUNT) + MK_SPACE_FLIGHT_COUNT) % MK_SPACE_FLIGHT_COUNT;
  if (index === 0) return MAGIC_KINGDOM_SPACE_MOUNTAIN;
  const cached = mkSpaceFlights.get(index);
  if (cached) return cached;
  const base = MAGIC_KINGDOM_SPACE_MOUNTAIN;
  const flight = MK_SPACE_FLIGHTS[index - 1];
  const chapter: LinePlayChapter = {
    ...base,
    id: `${base.id}-episode-${index}`,
    episodeLabel: `FLIGHT ${index + 1} OF ${MK_SPACE_FLIGHT_COUNT}`,
    returningFlight: true,
    title: flight.title,
    story: flight.story,
    completedTitle: flight.completedTitle,
    completedStory: flight.completedStory,
    missionNames: flight.missionNames,
    finale: { ...base.finale, title: flight.finale.title, preview: flight.finale.preview },
    relay: { ...base.relay, ...flight.relay, title: `${flight.title} Crew Relay`,
      branchKicker: 'YOUR CREW CHANGED THE FLIGHT', otherResult: 'Your crew chose a course!' },
    fieldNotes: [...flight.signalNotes, ...base.fieldNotes.slice(3)],
  };
  mkSpaceFlights.set(index, chapter);
  return chapter;
}

/**
 * Disneyland-specific facts are paraphrased from Disney's attraction page and
 * Disney Parks Blog. The missing launch code and shark crew are original fiction.
 * https://disneyland.disney.go.com/attractions/disneyland/space-mountain/
 * https://disneyparksblog.com/wdw/peak-perfection-space-mountain-at-walt-disney-world-celebrates-50-years/
 */
const DISNEYLAND_SPACE_MOUNTAIN: LinePlayChapter = {
  id: 'dl-space-mountain',
  parkLabel: 'DISNEYLAND',
  title: 'The Missing Launch Code',
  story: 'Your shark’s flight vehicle is ready, but three launch signals have gone missing. Decode Mission Control, spot a signal from your place in line, and restore the code before the countdown.',
  completedTitle: 'Launch code restored!',
  completedStory: 'Your crew can fly again. The relay and arcade stay open while your time near the ride earns Ride Parts.',
  progressNoun: 'launch signals',
  missionNames: ['Decode Mission Control', 'Find a signal', 'Restore the launch code'],
  finale: { idSuffix: 'launch-code', title: 'Restore the Launch Code',
    preview: 'Match space symbols to rebuild the code. Play solo or let your crew call out the pairs.',
    memoryDeckId: 'launch-code' },
  relay: {
    title: 'Launch Crew Relay',
    setupStory: 'Four quick turns choose your shark’s flight path. Play solo or pass one phone around your crew as the line shuffles forward.',
    firstTurnTitle: 'Decode the first signal',
    firstClueFound: 'The Navigator decoded the first launch signal.',
    missedClue: 'The Navigator missed a signal. The crew can still launch.',
    scoreNoun: 'Signals decoded',
    routeTitle: 'Choose the launch path',
    routeOptions: ['Solar route · follow the light', 'Nebula route · enter the swirl'],
    perfectResult: 'Flight plan complete!', otherResult: 'Your crew chose a flight path!',
    alphaResult: 'Your shark follows the solar route and finds the next launch signal.',
    omegaResult: 'Your shark flies into the nebula and recovers the missing code.',
    completionNote: 'Your path opens another extra game and stays in your queue recap. Your time near the ride earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE FLIGHT PATH',
    branchDone: 'Your crew finished its chosen path. It stays in the queue recap.',
    routeNames: ['Solar route', 'Nebula route'],
    epilogues: {
      alpha: { title: 'Hold the Solar Signal', prompt: 'Tap the sharks that pop up in the light. Skip the decoys.' },
      omega: { title: 'Swim the Nebula Trail', prompt: 'Guide your shark through a quick journey into the swirl.' },
    },
  },
  trivia: [
    { id: 'dl-sm-1', question: 'Which Disneyland land is home to Space Mountain?', choices: ['Tomorrowland', 'Adventureland', 'Fantasyland', 'Frontierland'], correctIndex: 0, difficulty: 'easy', fact: 'Disneyland lists Space Mountain in Tomorrowland.', source: 'Disneyland Resort' },
    { id: 'dl-sm-2', question: 'What is the minimum height Disney lists for Disneyland’s Space Mountain?', choices: ['40 inches', '32 inches', '44 inches', '48 inches'], correctIndex: 0, difficulty: 'medium', fact: 'Disney lists a 40-inch minimum height for this attraction.', source: 'Disneyland Resort' },
    { id: 'dl-sm-3', question: 'Where does Disney say the queue heads inside its futuristic space station?', choices: ['Mission Control', 'A harbor', 'A jungle camp', 'A haunted library'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes the path through the space station toward Mission Control.', source: 'Disneyland Resort' },
    { id: 'dl-sm-4', question: 'What does Disney say the rocket passes through before its countdown?', choices: ['A spiral nebula', 'An asteroid mine', 'A moon tunnel', 'A comet garden'], correctIndex: 0, difficulty: 'medium', fact: 'Disney describes a solar field followed by a spiral nebula before the countdown.', source: 'Disneyland Resort' },
    { id: 'dl-sm-5', question: 'What makes Disneyland’s Space Mountain different from Magic Kingdom’s track layout?', choices: ['One track rather than two', 'Three parallel tracks', 'An outdoor track', 'No coaster track'], correctIndex: 0, difficulty: 'hard', fact: 'Disney says Disneyland’s version was built with one track, while Magic Kingdom has two.', source: 'Disney Parks Blog' },
    { id: 'dl-sm-6', question: 'In what year did Space Mountain open at Disneyland?', choices: ['1977', '1975', '1983', '1992'], correctIndex: 0, difficulty: 'medium', fact: 'Disney dates the Disneyland opening to May 27, 1977.', source: 'Disney Parks Blog' },
    { id: 'dl-sm-7', question: 'What helps make Disneyland’s Space Mountain feel immersive, according to Disney?', choices: ['Music and sound effects', 'A live boat captain', 'An outdoor parade', 'A water splash'], correctIndex: 0, difficulty: 'easy', fact: 'Disney highlights music and sound effects as part of the attraction’s sensory experience.', source: 'Disneyland Resort' },
    { id: 'dl-sm-8', question: 'What kind of attraction does Disneyland call Space Mountain?', choices: ['A roller coaster in the dark', 'A riverboat cruise', 'A drop tower', 'A walking maze'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes Space Mountain as a roller-coaster ride through darkness.', source: 'Disneyland Resort' },
  ],
  fieldNotes: [
    { id: 'dl-sm-note-1', title: 'Mission Control Call Sign', body: 'Give your shark flight a call sign. Use one color, shape, or sound you notice from your place in line.', challenge: {
      prompt: 'What will name your flight?',
      options: [
        { label: 'Color', task: 'Choose a color you can see and turn it into a two-word call sign.' },
        { label: 'Shape', task: 'Choose a shape nearby and pair it with a space word.' },
        { label: 'Sound', task: 'Listen for a sound and imagine how Mission Control would name it.' },
      ],
      finish: 'Share the call sign or keep it as your solo clue. Stay in your place in line.',
    } },
    { id: 'dl-sm-note-2', title: 'Countdown Signal', body: 'Remember three details you can notice safely from where you stand. Recall them in reverse order.', challenge: {
      prompt: 'How will your crew decode them?',
      options: [
        { label: 'Solo recall', task: 'Look away and name your three details backward.' },
        { label: 'Crew quiz', task: 'Let a crewmate name one detail you missed.' },
        { label: 'Sound check', task: 'Use a nearby sound as your third detail, then recall all three.' },
      ],
      finish: 'Your memory becomes the second signal. No photo or extra walking needed.',
    } },
    { id: 'dl-sm-note-3', title: 'Solar or Nebula?', body: 'Disney describes a solar field and a spiral nebula. Which path should your shark explore in this fictional mission?', source: 'Disneyland Resort', challenge: {
      prompt: 'Which path inspires your clue?',
      options: [
        { label: 'Solar route', task: 'Give one reason your shark would follow the light.' },
        { label: 'Nebula route', task: 'Give one reason your shark would explore the swirl.' },
        { label: 'Crew debate', task: 'Hear one reason for each path and choose your favorite.' },
      ],
      finish: 'Keep the clue for the finale. The Crew Relay makes the actual path choice.',
    } },
    { id: 'dl-sm-note-4', title: 'Space Station Detail', body: 'Disney describes a futuristic space station. From your place in line, choose one detail that makes a place feel ready for launch.', source: 'Disneyland Resort' },
    { id: 'dl-sm-note-5', title: 'Soundtrack Memory', body: 'If music or sound is audible from your spot, remember one cue. If it is quiet, invent a launch sound for your shark crew.' },
    { id: 'dl-sm-note-6', title: 'After the Flight', body: 'Before you ride, guess what your crew will remember most: the line, the countdown, or the dark ride. Compare after the ride.' },
  ],
};

/**
 * A separate Disneyland Pirates chapter. Ride history and setting are checked against
 * Disney's attraction page and park history; prompts are original shark fiction.
 * https://disneyland.disney.go.com/attractions/disneyland/pirates-of-the-caribbean/
 * https://disneyparksblog.com/disney-experiences/yo-ho-yo-ho-the-pirates-conquest-from-disneyland-to-the-big-screen/
 */
/**
 * Disneyland Jungle Cruise facts are paraphrased from Disney's attraction page.
 * The missing skipper's log, crew choices, and shark story are original fiction.
 * https://disneyland.disney.go.com/attractions/disneyland/jungle-cruise/
 */
const DISNEYLAND_JUNGLE_CRUISE: LinePlayChapter = {
  id: 'dl-jungle-cruise',
  parkLabel: 'DISNEYLAND',
  title: 'The Missing Skipper’s Log',
  story: 'Your shark crew found an empty logbook beside the river. Gather three clues from your place in line, then choose a course to bring the skipper’s lost pages home.',
  completedTitle: 'Skipper’s log recovered!',
  completedStory: 'Your crew restored the log. The relay and quick games are still open while your time near the ride earns Ride Parts.',
  progressNoun: 'river clues',
  missionNames: ['Read a river clue', 'Spot a crew signal', 'Restore the log'],
  finale: { idSuffix: 'skipper-log', title: 'Restore the Skipper’s Log',
    preview: 'Match river symbols to recover the missing pages. Play solo or let your crew call out the pairs.',
    memoryDeckId: 'jungle' },
  relay: {
    title: 'River Crew Relay',
    setupStory: 'Four quick turns decide where your shark searches next. Play solo or share one phone from your place in line.',
    firstTurnTitle: 'Read the first river clue',
    firstClueFound: 'The Navigator found the first logbook clue.',
    missedClue: 'The Navigator missed a clue. The crew can still recover the log.',
    scoreNoun: 'Clues solved',
    routeTitle: 'Choose your river route',
    routeOptions: ['Falls route · follow the water', 'Camp route · search the shore'],
    perfectResult: 'Logbook restored!', otherResult: 'Your crew chose a route!',
    alphaResult: 'Your shark follows the river toward the missing pages.',
    omegaResult: 'Your shark searches the shore and finds a page tucked away.',
    completionNote: 'Your path opens another extra game and stays in the queue recap. Your time near the ride earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE COURSE',
    branchDone: 'Your crew finished its chosen route. The logbook ending stays in your recap.',
    routeNames: ['Falls route', 'Camp route'],
    epilogues: {
      alpha: { title: 'Follow the Falls', prompt: 'Tap the sharks that pop up along the river. Skip the decoys.' },
      omega: { title: 'Search the Shore', prompt: 'Swim through a quick challenge to find the shore clue.' },
    },
  },
  trivia: [
    { id: 'dl-jc-1', question: 'What year did Jungle Cruise open at Disneyland?', choices: ['1955', '1967', '1971', '1982'], correctIndex: 0, difficulty: 'easy', fact: 'Jungle Cruise opened with Disneyland on July 17, 1955.', source: 'Disneyland Resort' },
    { id: 'dl-jc-2', question: 'What type of Disney films helped inspire the original cruise?', choices: ['True-Life Adventure films', 'Space documentaries', 'Animated musicals', 'Sports films'], correctIndex: 0, difficulty: 'medium', fact: 'Disney says its True-Life Adventure films helped inspire the original attraction.', source: 'Disneyland Resort' },
    { id: 'dl-jc-3', question: 'How was the original Jungle Cruise presented?', choices: ['More educational', 'As a race', 'As a musical', 'As a coaster'], correctIndex: 0, difficulty: 'medium', fact: 'Disney describes the original version as having a more educational tone.', source: 'Disneyland Resort' },
    { id: 'dl-jc-4', question: 'Whose sketches helped add humorous gags in the early 1960s?', choices: ['Marc Davis', 'Ub Iwerks', 'Mary Blair', 'Ward Kimball'], correctIndex: 0, difficulty: 'hard', fact: 'Walt Disney asked animator Marc Davis to sketch humorous gags for the attraction.', source: 'Disneyland Resort' },
    { id: 'dl-jc-5', question: 'What kind of boat carries guests on the cruise?', choices: ['A canopied tramp steamer', 'A submarine', 'A raft with paddles', 'A sailing ship'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes the ride boat as a canopied tramp steamer.', source: 'Disneyland Resort' },
    { id: 'dl-jc-6', question: 'Which animals take over the Safari Camp scene?', choices: ['Gorillas', 'Penguins', 'Camels', 'Flamingos'], correctIndex: 0, difficulty: 'easy', fact: 'The Jungle Cruise Safari Camp scene features curious gorillas.', source: 'Disneyland Resort' },
    { id: 'dl-jc-7', question: 'Which scene features bathing elephants?', choices: ['Indian Elephant Bathing Pool', 'Schweitzer Falls', 'Safari Camp', 'African Veldt'], correctIndex: 0, difficulty: 'medium', fact: 'Disney names the Indian Elephant Bathing Pool among the cruise scenes.', source: 'Disneyland Resort' },
    { id: 'dl-jc-8', question: 'What is the name of the cruise’s famous waterfall?', choices: ['Schweitzer Falls', 'Victoria Falls', 'Paradise Falls', 'Silver Falls'], correctIndex: 0, difficulty: 'medium', fact: 'The official attraction page names Schweitzer Falls as a cruise highlight.', source: 'Disneyland Resort' },
  ],
  fieldNotes: [
    { id: 'dl-jc-note-1', title: 'Crew Call', body: 'Give your shark crew a river name. Use a clue you can see from your place in line.', challenge: {
      prompt: 'What starts your crew name?', options: [
        { label: 'A color', task: 'Choose a color you can see and turn it into a river crew name.' },
        { label: 'A shape', task: 'Choose a nearby shape and turn it into your crew’s emblem.' },
        { label: 'A sound', task: 'Listen for one sound and give your crew a matching name.' },
      ], finish: 'Tell your crew or keep the name for your solo voyage. Stay in your place in line.',
    } },
    { id: 'dl-jc-note-2', title: 'Three River Clues', body: 'Choose a detail you can notice safely nearby. Give three clues so a crewmate can guess it, or test your own memory.', challenge: {
      prompt: 'How will you make the clue?', options: [
        { label: 'Describe it', task: 'Give three words for a detail visible from your place.' },
        { label: 'Guess it', task: 'Ask someone for three clue words, then make one guess.' },
        { label: 'Remember it', task: 'Keep three clue words in mind and test yourself a minute from now.' },
      ], finish: 'Your clue goes into the skipper’s log. No photo or extra walking needed.',
    } },
    { id: 'dl-jc-note-3', title: 'Falls or Camp?', body: 'Your shark can follow the falls or search the camp for the missing pages. Which clue would it trust?', challenge: {
      prompt: 'Where does your crew search?', options: [
        { label: 'Falls', task: 'Tell the crew why the water might lead to a lost logbook page.' },
        { label: 'Camp', task: 'Tell the crew why the shore might hide a lost page.' },
        { label: 'Crew vote', task: 'Hear one reason for each route, then pick your favorite.' },
      ], finish: 'This choice changes the memory round; the Crew Relay chooses the final route. Stay in your place in line.',
    } },
    { id: 'dl-jc-note-4', title: 'Skipper Style', body: 'Disney says the skippers add lively narration. What one-line introduction would your shark skipper give your crew?', source: 'Disneyland Resort' },
    { id: 'dl-jc-note-5', title: 'River Pattern', body: 'From your place, notice a repeating color, shape, or sound. Invent a three-step river signal if the queue is plain.' },
    { id: 'dl-jc-note-6', title: 'After the Cruise', body: 'Before boarding, choose one scene or joke you hope to remember. Ask your crew which moment stuck with them after the ride.' },
  ],
};

const DISNEYLAND_PIRATES: LinePlayChapter = {
  id: 'dl-pirates',
  parkLabel: 'DISNEYLAND',
  title: 'The Vanishing Compass',
  story: 'A shark cartographer has lost the compass that points to a secret harbor. Assemble a crew, read the bayou clues, and choose a course before your boat arrives.',
  completedTitle: 'Compass recovered!',
  completedStory: 'Your crew rebuilt the three clues to the secret harbor. Try the crew challenge or another quick game while you wait. Your time near the ride still earns Ride Parts.',
  progressNoun: 'clues found',
  missionNames: ['Read the old map', 'Notice the bayou', 'Rebuild the compass'],
  finale: { idSuffix: 'compass', title: 'Rebuild the Compass',
    preview: 'Match nautical symbols to rebuild your shark’s missing compass. Race solo or let your crew call out the pairs.',
    memoryDeckId: 'pirates' },
  relay: {
    title: 'Harbor Crew Relay',
    setupStory: 'Four short turns lead your shark crew toward a hidden harbor. Play solo or pass one phone around your crew as the line shuffles forward.',
    firstTurnTitle: 'Read the old map',
    firstClueFound: 'The Navigator found the first clue.',
    missedClue: 'The Navigator missed a clue. The crew can still recover the compass.',
    scoreNoun: 'Clues solved',
    routeTitle: 'Choose the sea route',
    routeOptions: ['Harbor · follow the marked channel', 'Open Sea · search for another passage'],
    perfectResult: 'Compass recovered!', otherResult: 'Your crew chose a course!',
    alphaResult: 'Your shark follows the marked channel toward the harbor.',
    omegaResult: 'Your shark searches the open sea for another way to the harbor.',
    completionNote: 'Your choice opened a new round next in the chapter. Swipe to play it. Your path will appear in the queue recap. Your time near the ride still earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE COURSE',
    branchDone: 'Your crew finished its chosen route. The course stays in your queue recap.',
    routeNames: ['Harbor', 'Open Sea'],
    epilogues: {
      alpha: { title: 'Steady Through the Channel', prompt: 'Tap the harbor sharks as they surface. Skip the decoys.' },
      omega: { title: 'Search the Open Sea', prompt: 'Swim into the unknown and find the passage your crew chose.' },
    },
  },
  trivia: [
    { id: 'dl-potc-1', question: 'In what year did Pirates of the Caribbean open at Disneyland?', choices: ['1967', '1955', '1973', '1983'], correctIndex: 0, difficulty: 'easy', fact: 'The Disneyland attraction opened on March 18, 1967.', source: 'Disneyland Resort' },
    { id: 'dl-potc-2', question: 'Which Disneyland land is home to Pirates of the Caribbean?', choices: ['New Orleans Square', 'Adventureland', 'Frontierland', 'Fantasyland'], correctIndex: 0, difficulty: 'easy', fact: 'Pirates of the Caribbean is in New Orleans Square.', source: 'Disneyland Resort' },
    { id: 'dl-potc-3', question: 'How did Walt Disney first imagine this attraction?', choices: ['A wax museum and walk-through', 'A roller coaster', 'A boat race', 'A theater show'], correctIndex: 0, difficulty: 'medium', fact: 'Walt first imagined a walk-through wax museum before the boat ride took shape.', source: 'Disneyland Resort' },
    { id: 'dl-potc-4', question: 'What technology brought the pirate scenes to life?', choices: ['Audio-Animatronics', 'A live cast on every boat', 'Holographic glasses', 'Projection only'], correctIndex: 0, difficulty: 'medium', fact: 'Disney used Audio-Animatronics to bring the pirate characters to life.', source: 'Disneyland Resort' },
    { id: 'dl-potc-5', question: 'Where does the Disneyland voyage begin?', choices: ['A shadowy bayou', 'A mountain summit', 'A spaceport', 'A jungle runway'], correctIndex: 0, difficulty: 'easy', fact: 'Guests begin the boat voyage in a shadowy bayou.', source: 'Disneyland Resort' },
    { id: 'dl-potc-6', question: 'What is the name of the ghostly place after the first drop?', choices: ['Pirates Grotto', 'Mermaid Lagoon', 'Skull Mountain', 'Treasure Hall'], correctIndex: 0, difficulty: 'medium', fact: 'The boat passes through Pirates Grotto after a dark waterfall.', source: 'Disneyland Resort' },
    { id: 'dl-potc-7', question: 'How many guns does the galleon in the battle scene have?', choices: ['Twelve', 'Four', 'Eight', 'Twenty'], correctIndex: 0, difficulty: 'hard', fact: 'The galleon in the battle scene carries twelve guns.', source: 'Disneyland Resort' },
    { id: 'dl-potc-8', question: 'What major event helped inspire the use of Audio-Animatronics?', choices: ['The 1964 New York World’s Fair', 'The 1984 Olympics', 'The first moon landing', 'The opening of EPCOT'], correctIndex: 0, difficulty: 'hard', fact: 'After the 1964 New York World’s Fair, the team chose Audio-Animatronics for the pirate story.', source: 'Disneyland Resort' },
  ],
  fieldNotes: [
    { id: 'dl-potc-note-1', title: 'Crew Manifest', body: 'Give your shark crew a ship name. Choose one safe clue to notice from your place in line.', challenge: {
      prompt: 'Where will your ship name come from?',
      options: [
        { label: 'A color', task: 'Spot a color from your place in line. Make it part of your shark crew’s ship name.' },
        { label: 'A shape', task: 'Find a shape in the queue. Turn it into a ship name for your crew.' },
        { label: 'A sound', task: 'Listen for a sound. Let it inspire a ship name you can tell your crew.' },
      ],
      finish: 'Share the ship name with your crew, or keep it for your solo voyage. No photo or extra walking needed.',
    } },
    { id: 'dl-potc-note-2', title: 'A Course by Sound', body: 'Without moving from your place, listen for one nearby sound. Describe it with three clues and let a crewmate guess. Solo? Save your clues and test yourself a minute from now.', challenge: {
      prompt: 'How will your crew follow the sound?',
      options: [
        { label: 'Describe it', task: 'Give your crew three words for one sound you can hear from your place.' },
        { label: 'Guess it', task: 'Ask a crewmate to describe one nearby sound in three words and guess it.' },
        { label: 'Remember it', task: 'Keep three sound clues in mind and test yourself a minute from now.' },
      ],
      finish: 'Your sound clue becomes a bearing for the shark crew. Stay in your place in line.',
    } },
    { id: 'dl-potc-note-3', title: 'Bayou or Grotto?', body: 'Disney says this voyage begins in a bayou and continues through Pirates Grotto. Which setting would your shark use to hide a compass, and why?', source: 'Disneyland Resort', challenge: {
      prompt: 'Where does your crew search?',
      options: [
        { label: 'Bayou', task: 'Explain why your shark would hide the compass near the quiet bayou.' },
        { label: 'Grotto', task: 'Explain why your shark would hide the compass inside Pirates Grotto.' },
        { label: 'Ask the crew', task: 'Let your crew vote between the bayou and the grotto, then hear one reason.' },
      ],
      finish: 'This field note changes the compass round; the later Crew Relay chooses the course.',
    } },
    { id: 'dl-potc-note-4', title: 'Three Bearings', body: 'Pick three colors or shapes visible from your spot. Remember their order, look away briefly, then ask your crew to quiz you. Solo? Check the sequence a minute from now.' },
    { id: 'dl-potc-note-5', title: 'A Captain’s Choice', body: 'Your compass points toward a quiet harbor or a stormy shortcut. Let each person pick a route and explain the choice in one sentence.' },
    { id: 'dl-potc-note-6', title: 'Pirate Origins', body: 'Walt Disney first imagined Pirates of the Caribbean as a walk-through wax museum. Would your crew rather explore a scene on foot or by boat?', source: 'Disneyland Resort' },
  ],
};

/**
 * Magic Kingdom's attraction details are from Disney's own description.
 * The missing guest-book story and all crew prompts are original shark fiction.
 * https://disneyworld.disney.go.com/attractions/magic-kingdom/haunted-mansion/
 */
const MAGIC_KINGDOM_HAUNTED_MANSION: LinePlayChapter = {
  id: 'mk-haunted-mansion',
  parkLabel: 'MAGIC KINGDOM',
  title: 'The Missing Guest Book',
  story: 'A friendly ghost invited your shark crew to the mansion, but their names vanished from the guest book. Gather three clues from your place in line and choose how to sign in before your Doom Buggy arrives.',
  completedTitle: 'Your crew made the guest list!',
  completedStory: 'Your shark found its invitation. The crew relay and quick games are still here while your time near the ride earns Ride Parts.',
  progressNoun: 'guest-book clues',
  missionNames: ['Find an invitation', 'Decode a ghostly clue', 'Restore the guest book'],
  finale: { idSuffix: 'guest-book', title: 'Restore the Guest Book',
    preview: 'Match eerie symbols to recover your shark crew’s names. Play solo or let your crew call out the pairs.',
    memoryDeckId: 'mansion' },
  relay: {
    title: 'Guest Book Crew Relay',
    setupStory: 'Four short turns decide how your shark crew enters the mansion. Play solo or pass one phone around your crew as the line shuffles forward.',
    firstTurnTitle: 'Find an invitation',
    firstClueFound: 'The Navigator found the first invitation clue.',
    missedClue: 'The Navigator missed a clue. Your crew can still join the guest list.',
    scoreNoun: 'Clues solved',
    routeTitle: 'Choose your crew’s entrance',
    routeOptions: ['Lantern path · follow the warm light', 'Moon path · follow the quiet glow'],
    perfectResult: 'Guest list restored!', otherResult: 'Your crew chose an entrance!',
    alphaResult: 'Your shark follows the lanterns and discovers a blank page waiting for the crew’s names.',
    omegaResult: 'Your shark follows the moonlight and finds the guest book beside a friendly shadow.',
    completionNote: 'Your choice opened another extra round. It will also appear in your queue recap. Your time near the ride earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE STORY',
    branchDone: 'Your crew’s entrance and guest-book ending stay in the queue recap.',
    routeNames: ['Lantern path', 'Moon path'],
    epilogues: {
      alpha: { title: 'Follow the Lanterns', prompt: 'Tap the sharks that appear by the lanterns. Skip the decoys.' },
      omega: { title: 'Swim Through Moonlight', prompt: 'Guide your shark through a moonlit detour to the missing page.' },
    },
  },
  trivia: [
    { id: 'mk-hm-1', question: 'What does Disney call the vehicle that carries guests through Haunted Mansion?', choices: ['Doom Buggy', 'Ghost Ship', 'Specter Sled', 'Mansion Car'], correctIndex: 0, difficulty: 'easy', fact: 'Disney calls the ride vehicle a Doom Buggy.', source: 'Walt Disney World' },
    { id: 'mk-hm-2', question: 'Who narrates the tour through the mansion?', choices: ['The Ghost Host', 'A pirate captain', 'A royal guard', 'A park ranger'], correctIndex: 0, difficulty: 'easy', fact: 'The Ghost Host guides guests through the mansion.', source: 'Walt Disney World' },
    { id: 'mk-hm-3', question: 'Which character appears in the séance room?', choices: ['Madame Leota', 'A space pilot', 'A jungle skipper', 'A sea captain'], correctIndex: 0, difficulty: 'medium', fact: 'Disney names Madame Leota’s séance room among the ride scenes.', source: 'Walt Disney World' },
    { id: 'mk-hm-4', question: 'Which room contains a casket in Disney’s description?', choices: ['The conservatory', 'The library', 'The attic', 'The kitchen'], correctIndex: 0, difficulty: 'medium', fact: 'Disney describes a casket-filled conservatory.', source: 'Walt Disney World' },
    { id: 'mk-hm-5', question: 'What kind of specters fill the graveyard?', choices: ['Singing specters', 'Surfing specters', 'Flying pilots', 'Pirate captains'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes a graveyard of singing specters.', source: 'Walt Disney World' },
    { id: 'mk-hm-6', question: 'Which ghosts might follow guests home?', choices: ['Hitchhiking ghosts', 'Harbor ghosts', 'Starport ghosts', 'Jungle ghosts'], correctIndex: 0, difficulty: 'easy', fact: 'Disney warns guests about the hitchhiking ghosts.', source: 'Walt Disney World' },
    { id: 'mk-hm-7', question: 'What can guests find outside Magic Kingdom’s mansion?', choices: ['A musical crypt', 'A rocket launch', 'A pirate ship', 'A jungle boat'], correctIndex: 0, difficulty: 'medium', fact: 'Disney lists a musical crypt among the outdoor queue experiences.', source: 'Walt Disney World' },
    { id: 'mk-hm-8', question: 'How does Disney describe the ride’s motion?', choices: ['Slow-moving', 'High-speed', 'Free-falling', 'Spinning rapidly'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes the Haunted Mansion as a slow-moving ride.', source: 'Walt Disney World' },
  ],
  fieldNotes: [
    { id: 'mk-hm-note-1', title: 'First Invitation', body: 'Your shark needs an invitation name. Choose one detail you can notice safely from your place.', challenge: {
      prompt: 'What will your crew put on the invitation?',
      options: [
        { label: 'A color', task: 'Choose a color you can see and make it part of your shark crew’s invitation name.' },
        { label: 'A shape', task: 'Choose a nearby shape and turn it into a symbol for your guest-book page.' },
        { label: 'A sound', task: 'Choose a sound you can hear and make it your crew’s secret knock.' },
      ],
      finish: 'Share the clue with your crew or remember it solo. No photos or extra walking needed.',
    } },
    { id: 'mk-hm-note-2', title: 'The Three Word Knock', body: 'Give a safe detail around you a three-word clue. Let a friend guess it, or test your own memory later.', challenge: {
      prompt: 'How will you decode the knock?',
      options: [
        { label: 'Describe it', task: 'Describe a detail from where you stand in exactly three words.' },
        { label: 'Guess it', task: 'Ask someone with you for a three-word clue, then guess the detail.' },
        { label: 'Remember it', task: 'Keep three clue words in mind and test yourself a minute from now.' },
      ],
      finish: 'This clue changes your memory finale. Stay with your place in line.',
    } },
    { id: 'mk-hm-note-3', title: 'Lantern or Moon?', body: 'Would your shark look for a missing guest-book page under a lantern or under moonlight?', challenge: {
      prompt: 'Where should the crew search first?',
      options: [
        { label: 'Lantern', task: 'Make one case for following the lanterns.' },
        { label: 'Moonlight', task: 'Make one case for following the moonlight.' },
        { label: 'Crew vote', task: 'Let your group hear one reason for each choice before voting.' },
      ],
      finish: 'The clue changes the memory round; your later Crew Relay chooses the actual ending.',
    } },
    { id: 'mk-hm-note-4', title: 'Ghost Host or Ghost Crew?', body: 'The Ghost Host narrates the ride. If your shark were the host, what one-sentence welcome would it give?', source: 'Walt Disney World' },
    { id: 'mk-hm-note-5', title: 'Remember the Order', body: 'Choose three colors or shapes visible from your place. Remember their order and quiz someone with you a minute later. Solo? Test yourself.' },
    { id: 'mk-hm-note-6', title: 'Friendly Haunts', body: 'Disney says the mansion’s ghostly residents are friendly. Invent one friendly ghost who would sign your shark’s guest book.', source: 'Walt Disney World' },
  ],
};

/**
 * Disneyland's New Orleans Square setting and attraction facts are sourced from Disney.
 * The portrait-frame mystery and all shark crew choices are original fiction.
 * https://disneyland.disney.go.com/attractions/disneyland/haunted-mansion/
 * https://disneyparksblog.com/dlr/today-in-disney-history-haunted-mansion-opening-date-at-disneyland-in-1969/
 */
const DISNEYLAND_HAUNTED_MANSION: LinePlayChapter = {
  id: 'dl-haunted-mansion',
  parkLabel: 'DISNEYLAND PARK',
  title: 'The Vanishing Portrait Frame',
  story: 'In New Orleans Square, your shark crew finds an empty portrait frame. Three clues will help you imagine who belongs in it. Choose a route and reveal your crew’s own ghostly portrait before your mansion visit.',
  completedTitle: 'Your portrait is complete!',
  completedStory: 'Your shark crew chose a face for the frame. The relay and short games remain available while your time near the ride earns Ride Parts.',
  progressNoun: 'portrait clues',
  missionNames: ['Find the first detail', 'Decode a shadow', 'Reveal the portrait'],
  finale: { idSuffix: 'portrait', title: 'Reveal the Portrait',
    preview: 'Match mansion symbols to bring your shark’s portrait into focus. Play solo or let your crew call out the pairs.',
    memoryDeckId: 'mansion' },
  relay: {
    title: 'Portrait Crew Relay',
    setupStory: 'Four quick turns decide which portrait your crew reveals. Play solo or pass one phone around your crew as the line shuffles forward.',
    firstTurnTitle: 'Find the frame’s first detail',
    firstClueFound: 'The Navigator found the first portrait detail.',
    missedClue: 'One detail stayed hidden. Your crew can still finish the portrait.',
    scoreNoun: 'Details uncovered',
    routeTitle: 'Choose the frame’s secret',
    routeOptions: ['Gallery route · follow the shifting colors', 'Garden route · follow the quiet shapes'],
    perfectResult: 'Portrait revealed!', otherResult: 'Your crew chose a portrait!',
    alphaResult: 'Your shark follows the gallery colors. Inside the frame is a ghostly crew member wearing a bright explorer hat.',
    omegaResult: 'Your shark follows the garden shapes. Inside the frame is a friendly ghost carrying a tiny lantern.',
    completionNote: 'Your path opens one more extra game and appears in the queue recap. Your time near the ride earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE PORTRAIT',
    branchDone: 'Your chosen portrait stays in the queue recap.',
    routeNames: ['Gallery portrait', 'Garden portrait'],
    epilogues: {
      alpha: { title: 'Steady the Gallery', prompt: 'Tap the sharks that pop out of the gallery frames. Skip the decoys.' },
      omega: { title: 'Light the Garden', prompt: 'Guide your shark through the garden to reveal the lantern portrait.' },
    },
  },
  trivia: [
    { id: 'dl-hm-1', question: 'Which Disneyland land is home to Haunted Mansion?', choices: ['New Orleans Square', 'Tomorrowland', 'Fantasyland', 'Adventureland'], correctIndex: 0, difficulty: 'easy', fact: 'Disney places the original Disneyland Haunted Mansion in New Orleans Square.', source: 'Disney Parks Blog' },
    { id: 'dl-hm-2', question: 'In what year did Disneyland’s Haunted Mansion first open?', choices: ['1969', '1955', '1971', '1983'], correctIndex: 0, difficulty: 'medium', fact: 'Disney dates the Disneyland opening to August 9, 1969.', source: 'Disney Parks Blog' },
    { id: 'dl-hm-3', question: 'What changes in the Portrait Chamber?', choices: ['The walls appear to stretch', 'The floor becomes a boat', 'The ceiling launches a rocket', 'The windows turn into screens'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes the Portrait Chamber walls appearing to stretch.', source: 'Disneyland Resort' },
    { id: 'dl-hm-4', question: 'What does Disney call the vehicle for the mansion tour?', choices: ['Doom Buggy', 'Ghost Gondola', 'Spirit Car', 'Moon Coach'], correctIndex: 0, difficulty: 'easy', fact: 'Disney calls the ride vehicle a Doom Buggy.', source: 'Disneyland Resort' },
    { id: 'dl-hm-5', question: 'Who appears in the mansion’s séance scene?', choices: ['Madame Leota', 'A jungle skipper', 'Captain Nemo', 'A space pilot'], correctIndex: 0, difficulty: 'medium', fact: 'Disney lists Madame Leota’s séance room among the scenes.', source: 'Disneyland Resort' },
    { id: 'dl-hm-6', question: 'Where does Disney place the Hatbox Ghost in its Disneyland history?', choices: ['The attic', 'The loading area', 'The conservatory', 'The garden'], correctIndex: 0, difficulty: 'medium', fact: 'Disney’s Disneyland history places the Hatbox Ghost in the attic scene.', source: 'Disney Parks Blog' },
    { id: 'dl-hm-7', question: 'What kind of party appears in the Grand Hall?', choices: ['A ghostly gathering', 'A pirate auction', 'A jungle campout', 'A space launch'], correctIndex: 0, difficulty: 'easy', fact: 'Disney describes dancing spirits and a birthday cake in the Grand Hall.', source: 'Disney Parks Blog' },
    { id: 'dl-hm-8', question: 'Which ghosts may try to follow visitors home?', choices: ['Hitchhiking ghosts', 'Harbor ghosts', 'River ghosts', 'Star ghosts'], correctIndex: 0, difficulty: 'easy', fact: 'Disney warns of hitchhiking ghosts at the end of the tour.', source: 'Disneyland Resort' },
  ],
  fieldNotes: [
    { id: 'dl-hm-note-1', title: 'The Empty Frame', body: 'Your shark needs a first portrait detail. Pick something you can notice from your place in line.', challenge: {
      prompt: 'What becomes the first detail?',
      options: [
        { label: 'A color', task: 'Choose a visible color for the portrait background.' },
        { label: 'A shape', task: 'Choose a shape for the frame’s border.' },
        { label: 'A sound', task: 'Choose a sound your portrait character might make.' },
      ],
      finish: 'Tell your crew or remember it solo. Stay in your place; no photo needed.',
    } },
    { id: 'dl-hm-note-2', title: 'A Changing Shadow', body: 'The frame shows one mysterious shadow. Make a short clue about it without leaving your spot.', challenge: {
      prompt: 'How will you decode the shadow?',
      options: [
        { label: 'Three words', task: 'Describe your invented ghost in exactly three words.' },
        { label: 'Crew guess', task: 'Give a friend three clues and let them guess your ghost.' },
        { label: 'Solo recall', task: 'Remember three details, then test yourself a minute from now.' },
      ],
      finish: 'Your answer colors the memory finale. The later relay chooses the portrait ending.',
    } },
    { id: 'dl-hm-note-3', title: 'Gallery or Garden?', body: 'Should the missing portrait belong in a bright gallery or a quiet garden? Your shark crew can debate both.', challenge: {
      prompt: 'Which route gets the first clue?',
      options: [
        { label: 'Gallery', task: 'Make one case for following the changing colors.' },
        { label: 'Garden', task: 'Make one case for following quiet shapes.' },
        { label: 'Crew vote', task: 'Ask your crew to give one reason for each route, then vote.' },
      ],
      finish: 'Your clue affects the memory round; the Crew Relay decides the final portrait.',
    } },
    { id: 'dl-hm-note-4', title: 'Stretch the Story', body: 'Disney’s Portrait Chamber appears to stretch. Imagine what surprising detail would appear if your shark’s portrait grew taller.', source: 'Disneyland Resort' },
    { id: 'dl-hm-note-5', title: 'Three-Detail Recall', body: 'From your spot, remember three colors or shapes in order. Quiz a friend a minute later, or test yourself solo later.' },
    { id: 'dl-hm-note-6', title: 'A Friendly Haunt', body: 'Invent one friendly ghost for the empty portrait. Give it a name and one unusual hobby. No camera or extra walking needed.' },
  ],
};

/**
 * Original shark backlot fiction. Attraction facts are from Universal's
 * current Studio Tour description, not inferred from the queue setting:
 * https://www.universalstudioshollywood.com/web/en/us/things-to-do/rides-and-attractions/the-world-famous-studio-tour
 */
const UNIVERSAL_STUDIO_TOUR: LinePlayChapter = {
  id: 'ush-studio-tour',
  parkLabel: 'UNIVERSAL STUDIOS HOLLYWOOD',
  title: 'The Missing Backlot Reel',
  story: 'Your shark crew is making a tiny backlot movie, but three frames vanished from its reel. Find clues from your place in line, rebuild the scene, and choose the final cut before your tour begins.',
  completedTitle: 'Backlot reel restored!',
  completedStory: 'Your shark crew has a finished scene. Try the crew relay or another short game while your time near the ride keeps earning Ride Parts.',
  progressNoun: 'frames found',
  missionNames: ['Find the first frame', 'Design a sound cue', 'Rebuild the final cut'],
  finale: { idSuffix: 'final-cut', title: 'Rebuild the Final Cut',
    preview: 'Match movie-making symbols to put your shark’s missing frames in order. Play solo or let your crew call out the pairs.',
    memoryDeckId: 'backlot' },
  relay: {
    title: 'Backlot Crew Relay',
    setupStory: 'Four short turns turn your clues into a movie scene. Play solo or pass one phone around your crew as the line shuffles forward.',
    firstTurnTitle: 'Find the first frame',
    firstClueFound: 'The Navigator found the opening frame.',
    missedClue: 'The first frame is fuzzy. The crew can still finish the scene.',
    scoreNoun: 'Frames restored',
    routeTitle: 'Choose the final cut',
    routeOptions: ['Spotlight cut · follow the lights', 'Splash cut · follow the water'],
    perfectResult: 'Scene complete!', otherResult: 'Your crew chose a final cut!',
    alphaResult: 'Your shark follows a spotlight across the backlot and finds the missing frame behind the camera.',
    omegaResult: 'Your shark follows a splash cue and finds the missing frame beside a watery set.',
    completionNote: 'Your cut opened a new extra game next in the chapter. It will appear in the queue recap. Your time near the ride earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE FINAL CUT',
    branchDone: 'Your crew’s cut stays in the queue recap.',
    routeNames: ['Spotlight cut', 'Splash cut'],
    epilogues: {
      alpha: { title: 'Hold the Spotlight', prompt: 'Tap the sharks that pop up on set for the final shot. Skip the decoys.' },
      omega: { title: 'Follow the Splash Cue', prompt: 'Swim through a quick scene to find the watery ending your crew chose.' },
    },
  },
  trivia: [
    { id: 'ush-tour-1', question: 'About how long does Universal say the Studio Tour runs?', choices: ['60 minutes', '10 minutes', '25 minutes', 'Two hours'], correctIndex: 0, difficulty: 'easy', fact: 'Universal says the tour takes about 60 minutes.', source: 'Universal Studios Hollywood' },
    { id: 'ush-tour-2', question: 'Which part of Universal Studios Hollywood has the Studio Tour?', choices: ['Upper Lot', 'Lower Lot', 'CityWalk', 'Super Nintendo World'], correctIndex: 0, difficulty: 'easy', fact: 'Universal lists the Studio Tour in the Upper Lot.', source: 'Universal Studios Hollywood' },
    { id: 'ush-tour-3', question: 'How is the Studio Tour included for a regular park guest?', choices: ['With park admission', 'Only with a separate movie ticket', 'Only after sunset', 'Only with a hotel stay'], correctIndex: 0, difficulty: 'easy', fact: 'Universal says the Studio Tour is included with park admission.', source: 'Universal Studios Hollywood' },
    { id: 'ush-tour-4', question: 'What kind of place does the Studio Tour take guests behind the scenes of?', choices: ['A working movie and TV studio', 'A space center', 'A shipyard', 'An aquarium'], correctIndex: 0, difficulty: 'easy', fact: 'The tour explores Universal’s working studio and backlot.', source: 'Universal Studios Hollywood' },
    { id: 'ush-tour-6', question: 'Which tour experience puts King Kong near a T-Rex?', choices: ['King Kong 360', 'The WaterWorld show', 'Studio Tram Race', 'The Backlot Theater'], correctIndex: 0, difficulty: 'medium', fact: 'Universal describes the King Kong 360 encounter on the Studio Tour.', source: 'Universal Studios Hollywood' },
    { id: 'ush-tour-7', question: 'Jupiter’s Claim is a set from which film featured on the tour?', choices: ['NOPE', 'A silent western', 'A pirate musical', 'A space opera'], correctIndex: 0, difficulty: 'medium', fact: 'Universal says guests can see the Jupiter’s Claim set from Jordan Peele’s NOPE.', source: 'Universal Studios Hollywood' },
    { id: 'ush-tour-8', question: 'Which craft does Universal say helps bring tour scenes to life?', choices: ['Set design and special effects', 'Live animal training only', 'Deep-sea diving', 'Astronaut training'], correctIndex: 0, difficulty: 'medium', fact: 'Universal describes working sets, soundstages, props, and special effects as part of the tour.', source: 'Universal Studios Hollywood' },
  ],
  fieldNotes: [
    { id: 'ush-tour-note-1', title: 'Frame One: Your Opening Shot', body: 'Your shark needs an opening shot. Choose one detail you can safely notice from your place in line.', challenge: {
      prompt: 'What will appear in the first frame?',
      options: [
        { label: 'A color', task: 'Name a color you can see and make it the mood of your shark movie.' },
        { label: 'A shape', task: 'Choose a shape nearby and turn it into a movie prop.' },
        { label: 'A sound', task: 'Choose a sound you hear and make it the first cue in your scene.' },
      ],
      finish: 'Keep the shot in mind or tell your crew. No filming, photos, or extra walking needed.',
    } },
    { id: 'ush-tour-note-2', title: 'Soundstage Clue', body: 'Imagine the sound of your shark arriving on a movie set. Describe it in three words and let a crewmate guess. Solo? Remember your words until the line moves.', challenge: {
      prompt: 'How will you build the sound cue?',
      options: [
        { label: 'Describe it', task: 'Give your crew three words for your imagined shark sound.' },
        { label: 'Guess it', task: 'Ask a crewmate for a three-word sound cue, then guess their scene.' },
        { label: 'Remember it', task: 'Keep three sound words in order and repeat them a minute from now.' },
      ],
      finish: 'Your sound cue becomes the second frame. Stay in your place in line.',
    } },
    { id: 'ush-tour-note-3', title: 'Spotlight or Splash?', body: 'Your shark can follow a spotlight or a watery sound to the final frame. Which cue makes the better ending?', challenge: {
      prompt: 'Where does your crew search?',
      options: [
        { label: 'Spotlight', task: 'Give one reason the missing frame would hide behind the lights.' },
        { label: 'Splash', task: 'Give one reason the missing frame would hide near the water.' },
        { label: 'Crew pitch', task: 'Let each player pitch one ending, then choose the stronger story.' },
      ],
      finish: 'This clue changes the memory round; the Crew Relay chooses the final cut.',
    } },
    { id: 'ush-tour-note-4', title: 'The Movie Trick', body: 'Universal says the tour shows working sets and special effects. Pick one ordinary detail near you. How could a filmmaker make it look enormous on screen?', source: 'Universal Studios Hollywood' },
    { id: 'ush-tour-note-5', title: 'Three-Frame Recall', body: 'Notice three colors or shapes from your spot. Close your eyes briefly, recall their order, and test a crewmate. Solo? Check yourself when the line moves.' },
    { id: 'ush-tour-note-6', title: 'After the Tour', body: 'Before the tour, guess what your crew will remember most: a set, a sound, or a special effect. Compare after the tour.' },
  ],
};

/**
 * Disneyland's Rainbow Ridge story and the attraction facts below are checked
 * against Disney's own ride page and history article. This is Disneyland-only.
 * https://disneyland.disney.go.com/attractions/disneyland/big-thunder-mountain-railroad/
 * https://disneyparksblog.com/dlr/today-in-disney-history-big-thunder-mountain-railroad-opening-date-at-disneyland-in-1979/
 */
const DISNEYLAND_BIG_THUNDER: LinePlayChapter = {
  id: 'dl-big-thunder', parkLabel: 'DISNEYLAND',
  title: 'The Rainbow Ridge Dispatch',
  story: 'A runaway train carried off your shark crew’s dispatch from Rainbow Ridge. Decode the first clue, gather a signal from your place in line, and choose which trail brings the message home.',
  completedTitle: 'Dispatch delivered!',
  completedStory: 'Your crew brought the dispatch back to Rainbow Ridge. Try the relay or another quick round while your time near the ride keeps earning Ride Parts.',
  progressNoun: 'dispatch clues',
  missionNames: ['Decode the mine note', 'Find a ridge signal', 'Rebuild the dispatch'],
  finale: { idSuffix: 'dispatch', title: 'Rebuild the Dispatch',
    preview: 'Match symbols from your shark crew’s lost mine note. Play solo or let your crew call out the pairs.',
    memoryDeckId: 'rainbow-ridge' },
  relay: {
    title: 'Rainbow Ridge Crew Relay',
    setupStory: 'Four short turns recover the dispatch. Share one phone with your crew or play every role yourself.',
    firstTurnTitle: 'Read the mine note',
    firstClueFound: 'The Navigator decoded the first mark.',
    missedClue: 'The Navigator missed a mark. The crew can still finish the dispatch.',
    scoreNoun: 'Marks decoded',
    routeTitle: 'Which trail carries the dispatch?',
    routeOptions: ['Ridge trail · follow the lanterns', 'Canyon trail · search the old mine'],
    perfectResult: 'Dispatch delivered!', otherResult: 'Your crew found a trail!',
    alphaResult: 'Your shark follows the lanterns above Rainbow Ridge and returns the dispatch to the station.',
    omegaResult: 'Your shark searches the canyon, finds a missing mine mark, and takes the dispatch back by the old trail.',
    completionNote: 'Your choice opens another extra round and stays in your queue recap. Your time near the ride earns Ride Parts and tickets.',
    branchKicker: 'YOUR CREW CHANGED THE ROUTE',
    branchDone: 'Your chosen trail is complete and stays in the queue recap.',
    routeNames: ['Ridge trail', 'Canyon trail'],
    epilogues: {
      alpha: { title: 'Follow the Lanterns', prompt: 'Tap the sharks that pop up along the ridge trail. Skip the decoys.' },
      omega: { title: 'Search the Old Mine', prompt: 'Swim through a quick challenge to recover the last mine mark.' },
    },
  },
  trivia: [
    { id: 'dl-bt-1', question: 'Which Disneyland land is home to Big Thunder Mountain Railroad?', choices: ['Frontierland', 'Adventureland', 'Tomorrowland', 'Fantasyland'], correctIndex: 0, difficulty: 'easy', fact: 'Disneyland places the runaway mine train in Frontierland.', source: 'Disneyland Resort' },
    { id: 'dl-bt-2', question: 'What is the tiny town beside Disneyland’s Big Thunder called?', choices: ['Rainbow Ridge', 'Thunder Mesa', 'Miner’s Landing', 'Canyon Crossing'], correctIndex: 0, difficulty: 'easy', fact: 'The miniature town is Rainbow Ridge.', source: 'Disneyland Resort' },
    { id: 'dl-bt-3', question: 'In what year did Disneyland’s Big Thunder Mountain Railroad open?', choices: ['1979', '1955', '1975', '1989'], correctIndex: 0, difficulty: 'medium', fact: 'Disneyland’s Big Thunder opened September 2, 1979.', source: 'Disney Parks Blog' },
    { id: 'dl-bt-4', question: 'Which earlier train attraction gave Rainbow Ridge some of its scenery?', choices: ['Rainbow Caverns Mine Train', 'Casey Jr. Circus Train', 'Disneyland Railroad', 'PeopleMover'], correctIndex: 0, difficulty: 'medium', fact: 'Rainbow Ridge includes elements from the earlier Rainbow Caverns Mine Train.', source: 'Disneyland Resort' },
    { id: 'dl-bt-5', question: 'Which Imagineer was central to Disneyland’s Big Thunder design?', choices: ['Tony Baxter', 'Mary Blair', 'John Hench', 'Harper Goff'], correctIndex: 0, difficulty: 'hard', fact: 'Disney credits Imagineer Tony Baxter with the attraction’s vision.', source: 'Disney Parks Blog' },
    { id: 'dl-bt-6', question: 'Which national park inspired Disneyland’s Big Thunder rock shapes?', choices: ['Bryce Canyon', 'Yellowstone', 'Yosemite', 'Everglades'], correctIndex: 0, difficulty: 'hard', fact: 'Disney says Bryce Canyon in Utah inspired the Disneyland mountain’s spires.', source: 'Disney Parks Blog' },
    { id: 'dl-bt-7', question: 'What does the Big Thunder legend say the trains can do?', choices: ['Race off on their own', 'Fly over the canyon', 'Sail downriver', 'Travel under the sea'], correctIndex: 0, difficulty: 'easy', fact: 'In Disney’s mine legend, the trains take off by themselves.', source: 'Disneyland Resort' },
    { id: 'dl-bt-8', question: 'Which of these is a name on a Disneyland Big Thunder train?', choices: ['U.B. Bold', 'Starport Seven-Five', 'Nautilus', 'Mark Twain'], correctIndex: 0, difficulty: 'hard', fact: 'Disney lists U.B. Bold among the Disneyland train names.', source: 'Disney Parks Blog' },
  ],
  fieldNotes: [
    { id: 'dl-bt-note-1', title: 'Mine Note', body: 'Your shark found a dispatch with one mark missing. Choose a detail from your place in line to become its new symbol.', challenge: {
      prompt: 'What kind of mark will the crew add?',
      options: [
        { label: 'A shape', task: 'Pick a shape you can see without moving. How could it mark a mine trail?' },
        { label: 'A color', task: 'Choose a nearby color. Make it the dispatch’s warning or welcome signal.' },
        { label: 'A sound', task: 'Listen for a sound. Turn its rhythm into a secret knock for your crew.' },
      ], finish: 'Share the mark or keep it as your solo clue. Stay in your place in line.',
    } },
    { id: 'dl-bt-note-2', title: 'Ridge Lookout', body: 'Describe a safe detail around you in three words. Let a crewmate guess, or remember your clue until the line moves.', challenge: {
      prompt: 'How will you send the lookout signal?',
      options: [
        { label: 'Describe it', task: 'Give three words for one detail you can see from your spot.' },
        { label: 'Guess it', task: 'Ask a crewmate for three clue words, then guess their detail.' },
        { label: 'Remember it', task: 'Keep three clue words in order and repeat them a minute from now.' },
      ], finish: 'The lookout signal joins your shark story. No photo or extra walking needed.',
    } },
    { id: 'dl-bt-note-3', title: 'Two Trails', body: 'The crew can follow ridge lanterns or search the old canyon mine. Make a case for one trail before the relay chooses.', challenge: {
      prompt: 'Which trail sounds stronger?',
      options: [
        { label: 'Ridge', task: 'Give one reason the lanterns would lead to the missing dispatch.' },
        { label: 'Canyon', task: 'Give one reason the old mine would hide its last clue.' },
        { label: 'Crew debate', task: 'Hear one reason for each trail, then choose together.' },
      ], finish: 'Hold your choice for the Crew Relay, where it changes the ending.',
    } },
    { id: 'dl-bt-note-4', title: 'Rainbow Ridge', body: 'Disney says the miniature town predates this coaster. Imagine one sign your shark would add to an old mining town.', source: 'Disneyland Resort' },
    { id: 'dl-bt-note-5', title: 'Runaway Legend', body: 'Disney’s story says trains can race off on their own. Give your shark crew a one-sentence legend about why.', source: 'Disneyland Resort' },
    { id: 'dl-bt-note-6', title: 'After the Ride', body: 'Before boarding, predict which scene or sound your crew will remember. Compare answers after you ride.' },
  ],
};

/* ---- Fin-ister Nights haunt lines (DESIGN L2): games-only, night palette, spooky-silly parody deck ---- */

export interface FrightChapterDeck {
  readonly trivia: readonly TriviaQuestion[];
  readonly fieldNotes?: readonly LoreCard[];
}

let frightDeck: FrightChapterDeck | null = null;
const frightChapters = new Map<string, LinePlayChapter>();

/** services/fright/lineplay.ts registers the full content-pack deck; the inline deck below is the fallback. */
export function registerFrightChapterDeck(deck: FrightChapterDeck | null): void {
  frightDeck = deck && deck.trivia.length >= 3 ? deck : null;
  frightChapters.clear();
}

const FRIGHT_FALLBACK_TRIVIA: readonly TriviaQuestion[] = [
  { id: 'fright-lore-1', question: 'What kind of sea critter is Chuckles the Chum Jester?', choices: ['Clownfish', 'Pufferfish', 'Lobster', 'Octopus'], correctIndex: 0, difficulty: 'easy', fact: 'Chuckles is a clownfish in a jester collar.', source: 'Fin-ister Nights lore', deck: 'fright' },
  { id: 'fright-lore-2', question: 'Who keeps the Tidepool Carnival in perfect order?', choices: ['Ringmaster Riptide', 'The Kelp Keeper', 'Clapperclaw', 'Dice'], correctIndex: 0, difficulty: 'easy', fact: 'Ringmaster Riptide is a tidy cuttlefish. Mostly tidy.', source: 'Fin-ister Nights lore', deck: 'fright' },
  { id: 'fright-lore-3', question: 'Who shushes phones in the dark?', choices: ['The Shusher', 'Misty Mirror', 'Host Hammerhead', 'The Tide-Teller'], correctIndex: 0, difficulty: 'easy', fact: 'The Shusher is a seahorse usher with a flashlight.', source: 'Fin-ister Nights lore', deck: 'fright' },
  { id: 'fright-lore-4', question: 'Which town shows up in every Case File?', choices: ['Carp Cove', 'Kelp City', 'Bubble Bay', 'Fin Falls'], correctIndex: 0, difficulty: 'medium', fact: 'Carp Cove welcomes careful visitors.', source: 'Fin-ister Nights lore', deck: 'fright' },
  { id: 'fright-lore-5', question: 'What holds every Case File of the season?', choices: ['The Deep Lantern', 'A treasure chest', 'A coral crown', 'A message bottle'], correctIndex: 0, difficulty: 'easy', fact: 'The Deep Lantern is an anglerfish whose lure holds every file.', source: 'Fin-ister Nights lore', deck: 'fright' },
];

const FRIGHT_FIELD_NOTES: readonly LoreCard[] = [
  { id: 'fright-note-1', title: 'Fog Watch', body: 'Look for one spooky-silly thing from your place in line. It can be a glow, a shape or a sound. Give it a sea-critter name.' },
  { id: 'fright-note-2', title: 'Brave Face Check', body: 'Practice your bravest shark face with your crew. Who can hold it longest without a giggle?' },
  { id: 'fright-note-3', title: 'Scream-o-meter Guess', body: 'Predict it now: will you giggle, jump or scream in this haunt? Check your guess on the way out.' },
];

function frightChapter(parkId: number | undefined, rideSlug: string, rideName: string): LinePlayChapter {
  const name = rideName.trim().slice(0, 60) || 'this haunt';
  const id = `fright-${parkId ?? 0}-${rideSlug.slice('fright-'.length).replace(/[^a-z0-9-]/gi, '').slice(0, 60)}`;
  const cached = frightChapters.get(id);
  if (cached) return cached;
  const chapter: LinePlayChapter = {
    id, palette: 'night', introLine: 'The fog is thick. Play while the line moves.',
    parkLabel: 'FIN-ISTER NIGHTS', title: `The Line to ${name}`,
    story: 'The fog is rolling in and the line is long. Solve a spooky-silly clue, spot something odd, then race the Lantern before the doors open.',
    completedTitle: 'Brave in line!',
    completedStory: 'Your crew is ready. When the doors open, phones go away. See you on the other side.',
    progressNoun: 'clues found',
    missionNames: ['Crack a Case File clue', 'Spot something odd', 'Match the critters'],
    finale: { idSuffix: 'finale', title: 'Match the critters',
      preview: 'Match glowing sea-critter symbols in a quick memory round. Play solo or let your crew call out the pairs.',
      memoryDeckId: 'mansion', gameId: 'memory' },
    relay: {
      title: 'Fog Crew Relay',
      setupStory: 'Four short turns pick how your crew braves the fog. Pass one phone around as the line shuffles forward.',
      firstTurnTitle: 'Crack the first clue', firstClueFound: 'The Navigator cracked the first clue.',
      missedClue: 'The fog hid that clue. Your crew can still finish.', scoreNoun: 'Clues cracked',
      routeTitle: 'Choose how you brave the fog', routeOptions: ['Team Chaos · giggle through', 'Team Control · stay calm'],
      perfectResult: 'Fog conquered!', otherResult: 'Your crew chose a path!',
      alphaResult: 'Your shark giggles through the fog and finds the lantern glowing.',
      omegaResult: 'Your shark stays calm and counts the lantern lights.',
      completionNote: 'Haunt lines are games-only: no Parts, just bragging rights.',
      branchKicker: 'YOUR CREW CHOSE A SIDE', branchDone: 'Your crew braved the fog.',
      routeNames: ['Giggle through', 'Stay calm'],
      epilogues: {
        alpha: { title: 'Giggle Through', prompt: 'Tap the sharks that pop out of the fog. Skip the decoys.' },
        omega: { title: 'Stay Calm', prompt: 'Swim a steady path through the fog to the lantern.' },
      },
    },
    trivia: frightDeck?.trivia ?? FRIGHT_FALLBACK_TRIVIA,
    fieldNotes: frightDeck?.fieldNotes?.length ? frightDeck.fieldNotes : FRIGHT_FIELD_NOTES,
  };
  frightChapters.set(id, chapter);
  return chapter;
}

export function getLinePlayChapter(parkId?: number, rideSlug?: string, rideName?: string,
  episodeSeed?: number): LinePlayChapter | null {
  if (rideSlug?.startsWith('fright-')) return frightChapter(parkId, rideSlug, rideName ?? '');
  if (parkId === 8 &&
      (rideSlug === 'space-mountain-8' || rideName?.trim().toLowerCase() === 'space mountain')) {
    return DISNEYLAND_SPACE_MOUNTAIN;
  }
  if (parkId === 8 &&
      (rideSlug === 'jungle-cruise-8' || rideName?.trim().toLowerCase() === 'jungle cruise')) {
    return DISNEYLAND_JUNGLE_CRUISE;
  }
  if (parkId === 8 &&
      (rideSlug === 'big-thunder-mountain-railroad-8' ||
        rideName?.trim().toLowerCase() === 'big thunder mountain railroad')) {
    return DISNEYLAND_BIG_THUNDER;
  }
  if (parkId === 1 &&
      (rideSlug === 'studio-tour-1' ||
        ['studio tour', 'the world-famous studio tour', 'world famous studio tour']
          .includes(rideName?.trim().toLowerCase() ?? ''))) {
    return UNIVERSAL_STUDIO_TOUR;
  }
  if (parkId === 2 &&
      (rideSlug === 'space-mountain-2' || rideName?.trim().toLowerCase() === 'space mountain')) {
    return episodeSeed == null ? MAGIC_KINGDOM_SPACE_MOUNTAIN : magicKingdomSpaceFlight(episodeSeed);
  }
  if (parkId === 8 &&
      (rideSlug === 'pirates-of-the-caribbean-8' || rideName?.trim().toLowerCase() === 'pirates of the caribbean')) {
    return DISNEYLAND_PIRATES;
  }
  if (parkId === 2 &&
      (rideSlug === 'haunted-mansion-2' || rideName?.trim().toLowerCase() === 'haunted mansion')) {
    return MAGIC_KINGDOM_HAUNTED_MANSION;
  }
  if (parkId === 8 &&
      (rideSlug === 'haunted-mansion-8' || rideName?.trim().toLowerCase() === 'haunted mansion')) {
    return DISNEYLAND_HAUNTED_MANSION;
  }
  return rideName?.trim() ? adaptiveChapter(parkId, rideSlug, rideName, episodeSeed) : null;
}

export function getLinePlayChapterById(id?: string): LinePlayChapter | null {
  if (id?.startsWith('fright-')) return frightChapters.get(id) ?? null;
  if (id === DISNEYLAND_SPACE_MOUNTAIN.id) return DISNEYLAND_SPACE_MOUNTAIN;
  if (id === DISNEYLAND_JUNGLE_CRUISE.id) return DISNEYLAND_JUNGLE_CRUISE;
  if (id === DISNEYLAND_BIG_THUNDER.id) return DISNEYLAND_BIG_THUNDER;
  if (id === UNIVERSAL_STUDIO_TOUR.id) return UNIVERSAL_STUDIO_TOUR;
  if (id === MAGIC_KINGDOM_SPACE_MOUNTAIN.id) return MAGIC_KINGDOM_SPACE_MOUNTAIN;
  const flight = id?.match(/^mk-space-mountain-episode-(\d+)$/);
  if (flight && Number(flight[1]) > 0 && Number(flight[1]) < MK_SPACE_FLIGHT_COUNT) return magicKingdomSpaceFlight(Number(flight[1]));
  if (id === DISNEYLAND_PIRATES.id) return DISNEYLAND_PIRATES;
  if (id === MAGIC_KINGDOM_HAUNTED_MANSION.id) return MAGIC_KINGDOM_HAUNTED_MANSION;
  if (id === DISNEYLAND_HAUNTED_MANSION.id) return DISNEYLAND_HAUNTED_MANSION;
  return id ? adaptiveChapters.get(id) ?? null : null;
}
