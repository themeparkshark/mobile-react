/**
 * Tutorial steps: all tutorial content and flow definitions.
 */
import { TutorialStep, TutorialSequence } from './types';

/**
 * ONBOARDING: First time entering the app after username/team/membership
 * This is the main tutorial that runs on first ExploreScreen visit
 */
/**
 * Home: teach by doing. Finn says hi, then the first find (always spawned
 * within reach) opens right after, and one line after the first catch says
 * why it matters. No wall of text before the player touches anything.
 */
const homeOnboardingSteps: TutorialStep[] = [
  {
    id: 'welcome', sequence: 'onboarding',
    text: "Hi, I'm Finn! Treats pop up near you, even at home.",
    subtitle: 'One is right next to you!',
    sharkPosition: 'bottom-center', sharkMood: 'waving', nextText: 'Grab it!', delay: 400,
    // A find lands at the middle of the map: Finn stands beside his bubble so the
    // find and its pointing hand stay in view. Every home hello (sniffing, ready,
    // no find, welcome back) inherits this, so the bubble never jumps between them.
    beside: true,
  },
];

/**
 * Right after the first home find: one idea, with a walking picture. Energy is
 * taught at the first boss and Tickets at the first ride challenge, where they
 * are used, never three currencies in one bubble.
 */
export const HOME_FIRST_FIND_COPY = { title: 'Nice catch!', text: 'Walk around to find more!' } as const;
const homeFirstFindSteps: TutorialStep[] = [
  {
    id: 'home_first_find', sequence: 'home_first_find',
    title: HOME_FIRST_FIND_COPY.title, text: HOME_FIRST_FIND_COPY.text, picture: 'walk',
    sharkPosition: 'bottom-center', sharkMood: 'celebrating', nextText: 'Let’s hunt!',
  },
];

/** Play first. Costs and mastery belong beside the actual ride challenge/coin. */
const parkOnboardingSteps: TutorialStep[] = [
  {
    id: 'welcome', sequence: 'onboarding', title: 'Your first adventure',
    text: "I'm Finn. Let's match four pairs together!",
    subtitle: 'A free warm-up. Then choose your first ride coin on the map.',
    activity: 'memory_warmup', sharkPosition: 'bottom-center', sharkMood: 'waving',
    showSkip: true, nextText: 'Play a quick round', delay: 200,
  },
  {
    id: 'park_ride', sequence: 'onboarding', title: 'Start your collection',
    // Copy stands on its own: it must read right whether or not the card is spotlit. The picture is
    // park help page 1 ("Win ride coins"), so a new player never needs the "?" to learn the loop, and
    // the guide card is the next thing on screen (blueprint 6.2).
    text: 'Every ride has a coin. Follow the glowing coin, tap PLAY! and win it.',
    subtitle: 'It lands on your park shelf.',
    picture: 'win_coins',
    // Spotlights the "YOUR NEXT PARK COIN" card once ParkCollectionHeader calls
    // registerRef('next_park_coin') (change request filed with its owner). Until then
    // there is no spotlight and Finn keeps his default spot.
    spotlightRef: 'next_park_coin', placement: 'above-spotlight',
    sharkPosition: 'bottom-center', sharkMood: 'pointing', nextText: 'Follow the coin!',
  },
];

/** Home-first players get the same hands-on introduction when they reach a park. */
const parkArrivalSteps: TutorialStep[] = parkOnboardingSteps.map((step, index) => ({
  ...step, sequence: 'park_arrival', id: index === 0 ? 'park_arrival_coin' : 'park_arrival_line',
}));

/**
 * PARK: First time entering ParkScreen
 */
const parkSteps: TutorialStep[] = [
  {
    id: 'park_intro',
    sequence: 'park',
    text: 'This is your park shelf. Every coin you win lands here.',
    subtitle: 'The next coin is on top. Tap GO and follow the path.',
    sharkPosition: 'bottom-center',
    sharkMood: 'excited',
    nextText: 'Got it!',
  },
];

/**
 * STORE: First time entering StoreScreen
 */
const storeSteps: TutorialStep[] = [
  {
    id: 'store_intro',
    sequence: 'store',
    text: 'Welcome to the Shark Shop! Use Shark Coins to buy gear for your shark.',
    subtitle: 'Supplies cost real money, so a grown-up buys them.',
    sharkPosition: 'bottom-center',
    sharkMood: 'happy',
    nextText: 'Cool!',
  },
];

/**
 * GYM: First time entering GymBattleScreen
 */
const gymSteps: TutorialStep[] = [
  {
    id: 'gym_intro',
    sequence: 'gym',
    text: 'This is the Arena! Your team checks in here to hold it.',
    subtitle: 'Find swords on the map to help your team.',
    sharkPosition: 'bottom-center',
    sharkMood: 'excited',
    nextText: 'Ready to battle!',
  },
];

/**
 * COMMUNITY CENTER: First time entering CommunityCenterScreen
 */
const communityCenterSteps: TutorialStep[] = [
  {
    id: 'community_center_intro',
    sequence: 'community_center',
    text: 'This is the Community Center! Leave a gift for another shark, or claim one someone left for you.',
    subtitle: 'Leaving a gift costs 350 coins and gives you 2 Tickets. Claiming one gives you 1 Ticket.',
    sharkPosition: 'bottom-center',
    sharkMood: 'happy',
    nextText: 'Nice!',
  },
];

/**
 * FRIENDS: First time entering FriendsScreen
 */
const friendsSteps: TutorialStep[] = [
  {
    id: 'friends_intro',
    sequence: 'friends',
    text: 'Here are your friends! Search for other sharks to add, and send compliments to your favorites.',
    subtitle: 'Swipe on a friend to send a compliment or manage your list.',
    sharkPosition: 'bottom-center',
    sharkMood: 'waving',
    nextText: 'Awesome!',
  },
];

/**
 * PIN COLLECTIONS: First time entering PinCollectionsScreen
 */
const pinSteps: TutorialStep[] = [
  {
    id: 'pin_collections_intro',
    sequence: 'pins',
    text: 'Pins! Collect them, and swap with other sharks in Pin Trading.',
    sharkPosition: 'bottom-center',
    sharkMood: 'excited',
    nextText: 'Sweet!',
  },
];

/**
 * All steps organized by sequence
 */
export const TUTORIAL_SEQUENCES: Record<TutorialSequence, TutorialStep[]> = {
  onboarding: homeOnboardingSteps,
  home_first_find: homeFirstFindSteps,
  park_arrival: parkArrivalSteps,
  park: parkSteps,
  store: storeSteps,
  gym: gymSteps,
  community_center: communityCenterSteps,
  friends: friendsSteps,
  pins: pinSteps,
};

/**
 * Finn never promises a treat that is not there. At home the screen waits a
 * few seconds for the first find; when none has landed yet he says how finds
 * work instead, and Grab it! becomes Let's hunt!.
 */
const homeNoFindSteps: TutorialStep[] = [{
  ...homeOnboardingSteps[0],
  text: "Hi, I'm Finn! Treats pop up near you, even at home.",
  subtitle: 'Walk around to find one!',
  nextText: 'Let’s hunt!',
}];

/**
 * A guest who played Finn's taste before signing in (services/guestTaste) is
 * greeted as a returning shark, and never replays the warm-up they already won.
 */
export const GUEST_WELCOME_BACK = {
  title: 'You’re back!',
  ready: { text: 'A treat is right next to you!', button: 'Grab it!' },
  waiting: { text: 'Real treats pop up near you.', subtitle: 'Walk around to find one!', button: 'Let’s hunt!' },
} as const;
const guestWelcomeBackSteps = (findReady: boolean): TutorialStep[] => [{
  ...homeOnboardingSteps[0],
  title: GUEST_WELCOME_BACK.title,
  text: findReady ? GUEST_WELCOME_BACK.ready.text : GUEST_WELCOME_BACK.waiting.text,
  subtitle: findReady ? undefined : GUEST_WELCOME_BACK.waiting.subtitle,
  nextText: findReady ? GUEST_WELCOME_BACK.ready.button : GUEST_WELCOME_BACK.waiting.button,
}];
/**
 * At home Finn says hi within about a second, sniffing around while the first
 * find loads, so there is no silent map. His line then changes on its own: to
 * Grab it! the moment a find lands, or to "walk around" if none has after a
 * few seconds (HOME_LOOKING_MS).
 */
export const HOME_LOOKING_MS = 3500;
export const HOME_LOOKING = {
  text: "Hi, I'm Finn! Let me sniff out a treat near you!",
  guestText: 'Let me sniff out your first real treat!',
} as const;
const homeLookingSteps = (played: boolean): TutorialStep[] => [{
  ...homeOnboardingSteps[0],
  title: played ? GUEST_WELCOME_BACK.title : undefined,
  text: played ? HOME_LOOKING.guestText : HOME_LOOKING.text,
  subtitle: undefined, sharkMood: 'thinking', waitsForFind: true,
}];
const withoutWarmup = (steps: TutorialStep[]) => steps.filter(step => step.activity !== 'memory_warmup');

export interface TutorialStepOptions {
  readonly inPark?: boolean;
  /** At home, the first find has landed next to the player (Grab it! opens it). */
  readonly findReady?: boolean;
  /** At home, the first find is still loading: Finn sniffs around first (no button). */
  readonly looking?: boolean;
  /** This phone's guest already won Finn's warm-up before signing in. */
  readonly guestPlayed?: boolean;
}

/**
 * Get steps for a given sequence
 */
export function getStepsForSequence(sequence: TutorialSequence, options?: TutorialStepOptions): TutorialStep[] {
  const played = options?.guestPlayed === true;
  if (sequence === 'onboarding' && options?.inPark) return played ? withoutWarmup(parkOnboardingSteps) : parkOnboardingSteps;
  // Home: the copy follows whether a find is really there. Callers that do not
  // say (older paths) keep the original lines.
  const findReady = options?.findReady !== false;
  if (sequence === 'onboarding' && !findReady && options?.looking) return homeLookingSteps(played);
  if (sequence === 'onboarding' && played) return guestWelcomeBackSteps(findReady);
  if (sequence === 'onboarding' && !findReady) return homeNoFindSteps;
  if (sequence === 'park_arrival' && played) return withoutWarmup(parkArrivalSteps);
  return TUTORIAL_SEQUENCES[sequence] || [];
}
