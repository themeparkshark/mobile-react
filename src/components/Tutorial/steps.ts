/**
 * Tutorial Steps — All tutorial content and flow definitions
 */
import { TutorialStep, TutorialSequence } from './types';

/**
 * ONBOARDING — First time entering the app after username/team/membership
 * This is the main tutorial that runs on first ExploreScreen visit
 */
const openingStep: TutorialStep = {
  id: 'welcome', sequence: 'onboarding',
  text: "Hey, new shark! I'm Finn. Let's start your collection.",
  subtitle: 'Your adventure starts wherever you are.',
  sharkPosition: 'bottom-center', sharkMood: 'waving',
  showSkip: true, nextText: "Let's go!", delay: 500,
};

const homeOnboardingSteps: TutorialStep[] = [
  openingStep,
  {
    id: 'home_hunt', sequence: 'onboarding',
    text: 'Find a trip prep item on your map. Walk near it and collect it for your set.',
    subtitle: 'The yellow hunt card points to a nearby find. Pickups build Energy, XP, and sometimes Tickets.',
    sharkPosition: 'bottom-center', sharkMood: 'pointing', showSkip: true,
  },
  {
    id: 'home_goal', sequence: 'onboarding',
    text: 'Choose a ride coin to chase on your next park day.',
    subtitle: 'Tap NEXT PARK GOAL. Your home finds help stock the Tickets and Energy you will need.',
    sharkPosition: 'bottom-center', sharkMood: 'pointing', showSkip: true,
  },
  {
    id: 'home_collection', sequence: 'onboarding',
    text: 'Keep the colors you love. Finish a set to unlock rewards and new shark style.',
    subtitle: 'Trade four spare finds for any missing color. Open the Collection Book to see your rewards.',
    sharkPosition: 'bottom-center', sharkMood: 'excited', showSkip: true,
  },
  {
    id: 'explore_done', sequence: 'onboarding',
    text: 'Your first mission: find one item and choose one ride goal.',
    subtitle: 'At the park, win that ride coin. In line, play for its Ride Parts. Then upgrade it with Energy.',
    sharkPosition: 'bottom-center', sharkMood: 'celebrating', nextText: 'Start hunting!',
  },
];

const parkOnboardingSteps: TutorialStep[] = [
  openingStep,
  {
    id: 'park_ride', sequence: 'onboarding',
    text: 'Pick a ride coin from your park guide and head toward the attraction.',
    subtitle: 'Near the ride, use a Ticket or available Shark Rescue Pass and win its challenge to add the coin to your shelf.',
    sharkPosition: 'bottom-center', sharkMood: 'pointing', showSkip: true,
  },
  {
    id: 'park_queue', sequence: 'onboarding',
    text: 'Waiting in line? Open LinePlay for short games and a shared crew challenge.',
    subtitle: 'Eligible time near a linked ride can earn its Ride Parts. Solo games are there when the crew is quiet.',
    sharkPosition: 'bottom-center', sharkMood: 'excited', showSkip: true,
  },
  {
    id: 'park_mastery', sequence: 'onboarding',
    text: 'Your coin is just the beginning. Use its Ride Parts and Energy to level it up.',
    subtitle: 'Every ride has its own coin to collect and master. Keep your favorite on your shelf.',
    sharkPosition: 'bottom-center', sharkMood: 'happy', showSkip: true,
  },
  {
    id: 'explore_done', sequence: 'onboarding',
    text: 'First mission: earn one ride coin. I’ll help you from there!',
    subtitle: 'Your park guide points to a reachable ride. Have fun out there!',
    sharkPosition: 'bottom-center', sharkMood: 'celebrating', nextText: 'Explore the park!',
  },
];

/** One brief handoff for players who learned the game at home first. */
const parkArrivalSteps: TutorialStep[] = [
  {
    id: 'park_arrival_coin', sequence: 'park_arrival',
    text: 'Your home finds prepared this park day. Choose a missing ride coin and visit its attraction.',
    subtitle: 'Use a Ticket for the challenge. If you run out, Finn may have a Shark Rescue Pass for your first coin.',
    sharkPosition: 'bottom-center', sharkMood: 'pointing', showSkip: true,
  },
  {
    id: 'park_arrival_line', sequence: 'park_arrival',
    text: 'In line, open LinePlay for a solo story or a one-phone crew game.',
    subtitle: 'Eligible nearby time earns that ride’s Parts. Pair them with home Energy to upgrade your coin.',
    sharkPosition: 'bottom-center', sharkMood: 'excited', nextText: 'Start exploring!',
  },
];

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
    text: 'This is the Community Center! Leave a gift for other sharks, and earn tickets when someone claims yours!',
    subtitle: 'Leaving a gift costs 350 Park Coins but you earn premium Tickets in return.',
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
    text: 'Pin Collections! Collect pins at the parks and trade them with other sharks. Gotta catch \'em all!',
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
