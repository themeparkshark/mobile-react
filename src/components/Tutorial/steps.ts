/**
 * Tutorial steps: all tutorial content and flow definitions.
 */
import { TutorialStep, TutorialSequence } from './types';

/**
 * ONBOARDING — First time entering the app after username/team/membership
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
    text: "Hey, new shark! I'm Finn. Treats pop up around you, even at home.",
    subtitle: 'One just landed right next to you. Let’s grab it!',
    sharkPosition: 'bottom-center', sharkMood: 'waving', nextText: 'Grab it!', delay: 400,
  },
];

/** Right after the first home find: why it matters, in one breath. */
const homeFirstFindSteps: TutorialStep[] = [
  {
    id: 'home_first_find', sequence: 'home_first_find',
    text: 'Nice catch! Home finds power your park days.',
    subtitle: 'Energy fuels boss fights. Tickets start ride challenges. Walk around to find more!',
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
    // Copy stands on its own: it must read right whether or not the card is spotlit.
    text: 'Choose a ride coin you are missing on the map. Win its ride challenge to earn it.',
    subtitle: 'Later: Profile, scroll to your parks, tap a park.',
    // Spotlights the "YOUR NEXT PARK COIN" card once ParkCollectionHeader calls
    // registerRef('next_park_coin') (change request filed with its owner). Until then
    // there is no spotlight and Finn keeps his default spot.
    spotlightRef: 'next_park_coin', placement: 'above-spotlight',
    sharkPosition: 'bottom-center', sharkMood: 'pointing', nextText: 'Find a ride coin',
  },
];

/** Home-first players get the same hands-on introduction when they reach a park. */
const parkArrivalSteps: TutorialStep[] = parkOnboardingSteps.map((step, index) => ({
  ...step, sequence: 'park_arrival', id: index === 0 ? 'park_arrival_coin' : 'park_arrival_line',
}));

/**
 * PARK — First time entering ParkScreen
 */
const parkSteps: TutorialStep[] = [
  {
    id: 'park_intro',
    sequence: 'park',
    text: 'This is your park collection. Every ride coin you win moves you closer to completing this park.',
    subtitle: 'Open an uncollected ride to see its challenge, then return to level up the coin you earn.',
    sharkPosition: 'bottom-center',
    sharkMood: 'excited',
    nextText: 'Got it!',
  },
];

/**
 * STORE — First time entering StoreScreen
 */
const storeSteps: TutorialStep[] = [
  {
    id: 'store_intro',
    sequence: 'store',
    text: 'Welcome to the Shark Store! Spend your coins on items to customize your profile.',
    subtitle: 'The store rotates, so check back for new stuff!',
    sharkPosition: 'bottom-center',
    sharkMood: 'happy',
    nextText: 'Cool!',
  },
];

/**
 * GYM — First time entering GymBattleScreen
 */
const gymSteps: TutorialStep[] = [
  {
    id: 'gym_intro',
    sequence: 'gym',
    text: "This is the Arena! Your team battles here for control. Check in, attack with swords, and defend your turf!",
    subtitle: 'Find swords on the map to power your attacks.',
    sharkPosition: 'bottom-center',
    sharkMood: 'excited',
    nextText: 'Ready to battle!',
  },
];

/**
 * COMMUNITY CENTER — First time entering CommunityCenterScreen
 */
const communityCenterSteps: TutorialStep[] = [
  {
    id: 'community_center_intro',
    sequence: 'community_center',
    text: 'This is the Community Center! Leave a gift for another shark, or claim one someone left for you.',
    subtitle: 'A gift costs 350 coins and gets you 2 Tickets. Claiming a gift gets you 1 Ticket.',
    sharkPosition: 'bottom-center',
    sharkMood: 'happy',
    nextText: 'Nice!',
  },
];

/**
 * FRIENDS — First time entering FriendsScreen
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
 * PIN COLLECTIONS — First time entering PinCollectionsScreen
 */
const pinSteps: TutorialStep[] = [
  {
    id: 'pin_collections_intro',
    sequence: 'pins',
    text: 'Pin Collections! Collect pins at the parks and trade them with other sharks.',
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
 * Get steps for a given sequence
 */
export function getStepsForSequence(sequence: TutorialSequence, options?: { inPark?: boolean }): TutorialStep[] {
  if (sequence === 'onboarding' && options?.inPark) return parkOnboardingSteps;
  return TUTORIAL_SEQUENCES[sequence] || [];
}
