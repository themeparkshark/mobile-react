/**
 * Tutorial System — Type Definitions
 * 
 * The tutorial is a multi-step interactive walkthrough that guides
 * new users through the app after they complete onboarding.
 */

export type TutorialStepId =
  // Onboarding flow (first time in ExploreScreen)
  | 'welcome'
  | 'map_intro'
  | 'player_marker'
  | 'tasks_intro'
  | 'coins_intro'
  | 'currencies'
  | 'bottom_nav'
  | 'explore_done'
  // Deferred tutorials (trigger on first encounter)
  | 'park_intro'
  | 'store_intro'
  | 'gym_intro'
  | 'community_center_intro'
  | 'friends_intro'
  | 'pin_collections_intro';

export type TutorialSequence = 'onboarding' | 'park' | 'store' | 'gym' | 'community_center' | 'friends' | 'pins';

export interface SpotlightTarget {
  /** Absolute x position on screen */
  x: number;
  /** Absolute y position on screen */
  y: number;
  /** Width of the spotlight area */
  width: number;
  /** Height of the spotlight area */
  height: number;
  /** Shape of the spotlight cutout */
  shape: 'circle' | 'rect' | 'rounded';
  /** Padding around the target element */
  padding?: number;
}

export type SharkMood = 'happy' | 'excited' | 'pointing' | 'thinking' | 'waving' | 'celebrating';

export type SharkPosition = 'bottom-left' | 'bottom-right' | 'bottom-center' | 'top-left' | 'top-right';

export interface TutorialStep {
  /** Unique step identifier */
  id: TutorialStepId;
  /** Which tutorial sequence this belongs to */
  sequence: TutorialSequence;
  /** Teacher shark's speech text */
  text: string;
  /** Optional secondary/subtitle text */
  subtitle?: string;
  /** Where to position the teacher shark */
  sharkPosition: SharkPosition;
  /** Shark's mood/expression */
  sharkMood: SharkMood;
  /** Spotlight target area (null = no spotlight, full overlay) */
  spotlight?: SpotlightTarget | null;
  /** Named ref key to spotlight (resolved at runtime via measure) */
  spotlightRef?: string;
  /** Whether this step requires user to tap the highlighted element */
  interactive?: boolean;
  /** Custom "Next" button text */
  nextText?: string;
  /** Whether to show skip button */
  showSkip?: boolean;
  /** Delay before showing this step (ms) */
  delay?: number;
  /** Auto-advance after this many ms (0 = manual) */
  autoAdvance?: number;
  /** Callback when step is shown */
  onShow?: () => void;
  /** Callback when step is completed */
  onComplete?: () => void;
}

export interface TutorialContextType {
  /** Whether any tutorial is currently active */
  isActive: boolean;
  /** Current step being shown */
  currentStep: TutorialStep | null;
  /** Current step index in the active sequence */
  currentIndex: number;
  /** Total steps in the active sequence */
  totalSteps: number;
  /** Start a tutorial sequence */
  startTutorial: (sequence: TutorialSequence) => void;
  /** Advance to next step */
  nextStep: () => void;
  /** Skip the current tutorial sequence */
  skipTutorial: () => void;
  /** Check if a tutorial sequence has been completed */
  hasCompleted: (sequence: TutorialSequence) => boolean;
  /** Register a ref for spotlight targeting */
  registerRef: (key: string, ref: any) => void;
  /** Reset all tutorial progress (for testing) */
  resetAll: () => void;
}
