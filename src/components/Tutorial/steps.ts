/**
 * Tutorial Steps — All tutorial content and flow definitions
 */
import { TutorialStep, TutorialSequence } from './types';

/**
 * ONBOARDING — First time entering the app after username/team/membership
 * This is the main tutorial that runs on first ExploreScreen visit
 */
const onboardingSteps: TutorialStep[] = [
  {
    id: 'welcome',
    sequence: 'onboarding',
    text: "Hey there, new shark! I'm Finn, your guide to Theme Park Shark!",
    subtitle: "Let me show you around — it'll be quick, I promise!",
    sharkPosition: 'bottom-center',
    sharkMood: 'waving',
    showSkip: true,
    nextText: "Let's go!",
    delay: 500,
  },
  {
    id: 'map_intro',
    sequence: 'onboarding',
    text: "This is your map! When you're at a theme park, it comes alive with things to collect and do.",
    subtitle: 'Right now you might be in Travel Mode — that means you\'re not at a park yet. No worries!',
    sharkPosition: 'bottom-center',
    sharkMood: 'pointing',
    showSkip: true,
  },
  {
    id: 'player_marker',
    sequence: 'onboarding',
    text: "See that shark on the map? That's YOU! Walk around the park and your shark moves with you.",
    sharkPosition: 'bottom-center',
    sharkMood: 'excited',
    spotlightRef: 'player_marker',
    showSkip: true,
  },
  {
    id: 'tasks_intro',
    sequence: 'onboarding',
    text: 'Tasks pop up near rides and attractions. Walk close to one and complete it to earn Park Coins!',
    subtitle: 'Some are trivia, some are challenges — each one is different!',
    sharkPosition: 'bottom-center',
    sharkMood: 'happy',
    showSkip: true,
  },
  {
    id: 'coins_intro',
    sequence: 'onboarding',
    text: 'You\'ll also find coins, keys, and vaults scattered around. Collect coins, use keys to open vaults for awesome rewards!',
    sharkPosition: 'bottom-center',
    sharkMood: 'excited',
    showSkip: true,
  },
  {
    id: 'currencies',
    sequence: 'onboarding',
    text: 'Up top is your balance. Park Coins are earned at each park. Shark Coins work everywhere!',
    subtitle: 'Spend them in the Store on cool items for your profile.',
    sharkPosition: 'bottom-center',
    sharkMood: 'pointing',
    spotlightRef: 'topbar_currencies',
    showSkip: true,
  },
  {
    id: 'bottom_nav',
    sequence: 'onboarding',
    text: 'At the bottom of your screen are your main tabs. Explore the map, check standings, chat with other sharks, read park news, and see your profile!',
    sharkPosition: 'bottom-center',
    sharkMood: 'pointing',
    showSkip: true,
  },
  {
    id: 'explore_done',
    sequence: 'onboarding',
    text: "You're all set! Head to a theme park and start your adventure. Collect coins, complete tasks, and climb the leaderboard!",
    subtitle: 'I\'ll pop up again when you discover something new. Happy exploring!',
    sharkPosition: 'bottom-center',
    sharkMood: 'celebrating',
    nextText: "Let's explore!",
  },
];

/**
 * PARK — First time entering ParkScreen
 */
const parkSteps: TutorialStep[] = [
  {
    id: 'park_intro',
    sequence: 'park',
    text: 'Welcome to your Park page! This shows all your progress at this park.',
    subtitle: 'Complete tasks to earn ride coins. Fill up the shelves to earn trophies!',
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
  onboarding: onboardingSteps,
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
export function getStepsForSequence(sequence: TutorialSequence): TutorialStep[] {
  return TUTORIAL_SEQUENCES[sequence] || [];
}
