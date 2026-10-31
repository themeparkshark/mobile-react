/**
 * TutorialProvider: Context provider that manages tutorial state
 * 
 * Tracks which tutorials have been completed (persisted to AsyncStorage),
 * manages the current tutorial sequence, and provides methods to
 * start/advance/skip tutorials.
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TutorialContextType, TutorialSequence, TutorialStep, SpotlightTarget } from './types';
import { getStepsForSequence, HOME_LOOKING_MS } from './steps';
import { teacherBottomOffset } from './tutorialLayout';
import { Dimensions } from 'react-native';
import SpotlightOverlay from './SpotlightOverlay';
import TeacherShark from './TeacherShark';
import MemoryGame from '../../games/memory/MemoryGame';
import { AuthContext } from '../../context/AuthProvider';
import { claimGuestWarmup } from '../../services/guestTaste';
import { loadCompleted, tutorialKey } from './tutorialStore';
// Sounds disabled temporarily: will re-enable once tutorial flow is stable
// import { SoundEffectContext } from '../../context/SoundEffectProvider';

/** Guides that run over the map, where the footer's compass rises into the screen. */
const MAP_SEQUENCES = new Set<TutorialSequence>(['onboarding', 'home_first_find', 'park_arrival']);

/** All tutorial sequences: used to auto-complete for existing players */
const ALL_SEQUENCES: TutorialSequence[] = [
  'onboarding', 'park_arrival', 'park', 'store', 'gym', 'community_center', 'friends', 'pins',
];

const defaultContext: TutorialContextType = {
  isReady: false,
  isActive: false,
  currentStep: null,
  currentIndex: 0,
  totalSteps: 0,
  startTutorial: () => {},
  nextStep: () => {},
  skipTutorial: () => {},
  hasCompleted: () => false,
  registerRef: () => {},
  resetAll: () => {},
};

export const TutorialContext = createContext<TutorialContextType>(defaultContext);

export function useTutorial() {
  return useContext(TutorialContext);
}

interface TutorialProviderProps {
  children: React.ReactNode;
}

export default function TutorialProvider({ children }: TutorialProviderProps) {
  // const { playSound } = useContext(SoundEffectContext);
  const { player } = useContext(AuthContext);
  // A local, in-memory new-player preview; never writes real tutorial progress.
  const firstPlayPreview = __DEV__ && process.env.EXPO_PUBLIC_PARK_FIRST_PLAY_PREVIEW === '1';
  const [firstPlayOpen, setFirstPlayOpen] = useState(false);
  const firstPlayRef = useRef(false);
  const firstPlayAttemptRef = useRef(0);
  const [firstPlayAttempt, setFirstPlayAttempt] = useState(0);
  // The PLAY tap is taken: the button pulses for a frame before the warm-up mounts, so a
  // slow first mount never looks like a dropped tap.
  const [firstPlayStarting, setFirstPlayStarting] = useState(false);
  const firstPlayOrigin = useRef<string | null>(null);
  const [completedSequences, setCompletedSequences] = useState<Set<TutorialSequence>>(new Set());
  const [currentSequence, setCurrentSequence] = useState<TutorialSequence | null>(null);
  const [currentSteps, setCurrentSteps] = useState<TutorialStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [spotlightTarget, setSpotlightTarget] = useState<SpotlightTarget | null>(null);
  // Finn's lessons are saved per account (tutorialStore.ts): loaded for the player signed in now.
  const playerId = player?.id ?? null;
  const [loadedFor, setLoadedFor] = useState<{ id: number | null; fresh: boolean } | null>(null);
  const loaded = firstPlayPreview || (loadedFor !== null && loadedFor.id === playerId);
  const refs = useRef<Map<string, any>>(new Map());
  const inParkOnboardingRef = useRef(false);

  // Load this player's completed sequences (a new account on the same phone starts its own record).
  useEffect(() => {
    if (firstPlayPreview) return;
    let current = true;
    setLoadedFor(null);
    setCompletedSequences(new Set());
    void loadCompleted(AsyncStorage, playerId)
      .then(({ completed, fresh }) => {
        if (!current) return;
        setCompletedSequences(completed);
        setLoadedFor({ id: playerId, fresh });
      })
      // An unreadable store still lets tutorials run.
      .catch(() => { if (current) setLoadedFor({ id: playerId, fresh: true }); });
    return () => { current = false; };
  }, [playerId, firstPlayPreview]);

  // A guest who won Finn's warm-up before signing in keeps it, but only the
  // first account after the taste claims it (a sibling's new account does not).
  // Re-read when the account changes, since the guest plays after this provider mounts.
  // Onboarding waits for this check, so a new account never starts the wrong steps.
  const [guestCheck, setGuestCheck] = useState<{ id: number | null; played: boolean }>({ id: null, played: false });
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => claimGuestWarmup(playerId))
      .then(played => { if (current) setGuestCheck({ id: playerId, played: played === true }); })
      .catch(() => { if (current) setGuestCheck({ id: playerId, played: false }); });
    return () => { current = false; };
  }, [playerId]);
  const guestChecked = guestCheck.id === playerId;
  const guestPlayed = guestChecked && guestCheck.played;

  // Auto-complete all tutorials for existing players (handles a reinstall or cache wipe).
  // Checked once per account load: after "Replay Tutorials" the empty set is on purpose.
  const existingPlayerChecked = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded || !player || firstPlayPreview || !loadedFor) return;
    if (existingPlayerChecked.current === player.id) return;
    existingPlayerChecked.current = player.id;
    if (!loadedFor.fresh || completedSequences.size > 0) return; // Has its own record, not a fresh account

    const isExistingPlayer =
      (player.completed_tasks_count ?? 0) > 0 ||
      (player.total_experience ?? 0) > 50 ||
      (player.friends_count ?? 0) > 0;

    if (isExistingPlayer) {
      const allDone = new Set<TutorialSequence>(ALL_SEQUENCES);
      setCompletedSequences(allDone);
      const key = tutorialKey(player.id);
      if (key) AsyncStorage.setItem(key, JSON.stringify(ALL_SEQUENCES)).catch(() => {});
    }
  }, [loaded, player, loadedFor]);

  // Persist completed sequences
  const persistCompleted = useCallback(async (sequences: Set<TutorialSequence>) => {
    const key = tutorialKey(playerId);
    if (firstPlayPreview || !key) return;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(Array.from(sequences)));
    } catch {}
  }, [firstPlayPreview, playerId]);

  // Resolve spotlight target from ref
  const resolveSpotlight = useCallback((step: TutorialStep, isCurrent: () => boolean) => {
    if (!step.spotlightRef) {
      setSpotlightTarget(step.spotlight ?? null);
      return;
    }

    const ref = refs.current.get(step.spotlightRef);
    if (ref?.current) {
      ref.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        if (!isCurrent()) return;
        if (width > 0 && height > 0) {
          setSpotlightTarget({
            x, y, width, height,
            shape: 'rounded',
            padding: 8,
          });
        } else {
          setSpotlightTarget(null);
        }
      });
    } else {
      // Ref not found: skip spotlight
      setSpotlightTarget(null);
    }
  }, []);

  // Start a tutorial sequence
  const startTutorial = useCallback((sequence: TutorialSequence, options?: { inPark?: boolean; findReady?: boolean; looking?: boolean }) => {
    // Don't start until AsyncStorage has loaded: avoids replaying on fresh load
    if (!loaded) return;
    if (completedSequences.has(sequence)) return;
    
    if (isActive) return;
    if ((sequence === 'onboarding' || sequence === 'park_arrival') && !guestChecked) return;
    const steps = getStepsForSequence(sequence, { ...options, guestPlayed });
    if (steps.length === 0) return;

    inParkOnboardingRef.current = sequence === 'onboarding' && !!options?.inPark;
    homeHelloRef.current = sequence === 'onboarding' && !options?.inPark && options?.findReady === false;
    setCurrentSequence(sequence);
    setCurrentSteps(steps);
    setCurrentIndex(0);
    setIsActive(true);

  }, [loaded, isActive, completedSequences, guestPlayed, guestChecked]);

  // At home Finn may start before the first find has landed (a slow
  // connection). When it lands while he is still on his hello, his line
  // switches from "walk around" to "it landed right next to you".
  const homeHelloRef = useRef(false);
  const findLanded = useCallback(() => {
    if (!isActive || currentSequence !== 'onboarding' || !homeHelloRef.current || currentIndex !== 0) return;
    homeHelloRef.current = false;
    setCurrentSteps(getStepsForSequence('onboarding', { findReady: true, guestPlayed }));
  }, [isActive, currentSequence, currentIndex, guestPlayed]);

  // Finn sniffing for the first find: if none lands in HOME_LOOKING_MS, he
  // says how finds work instead ("walk around"), with Let's hunt!.
  const lookingStep = isActive && !!currentSteps[currentIndex]?.waitsForFind;
  useEffect(() => {
    if (!lookingStep) return undefined;
    const timer = setTimeout(() => {
      setCurrentSteps(getStepsForSequence('onboarding', { findReady: false, guestPlayed }));
    }, HOME_LOOKING_MS);
    return () => clearTimeout(timer);
  }, [lookingStep, guestPlayed]);

  // Advance to next step
  const nextStep = useCallback(() => {
    if (firstPlayRef.current) return;
    const nextIdx = currentIndex + 1;
    
    // Complete current step callback
    currentSteps[currentIndex]?.onComplete?.();

    if (nextIdx >= currentSteps.length) {
      // Tutorial complete
      const newCompleted = new Set(completedSequences);
      if (currentSequence) {
        newCompleted.add(currentSequence);
        if (currentSequence === 'onboarding' && inParkOnboardingRef.current) {
          newCompleted.add('park_arrival');
        }
      }
      inParkOnboardingRef.current = false;
      setCompletedSequences(newCompleted);
      persistCompleted(newCompleted);
      setIsActive(false);
      setCurrentSequence(null);
      setCurrentSteps([]);
      setCurrentIndex(0);
      setSpotlightTarget(null);
      
      return;
    }

    setCurrentIndex(nextIdx);

  }, [currentIndex, currentSteps, currentSequence, completedSequences, persistCompleted]);

  // Skip the current tutorial
  const skipTutorial = useCallback(() => {
    if (firstPlayRef.current) return;
    const newCompleted = new Set(completedSequences);
    if (currentSequence) {
      newCompleted.add(currentSequence);
      if (currentSequence === 'onboarding' && inParkOnboardingRef.current) {
        newCompleted.add('park_arrival');
      }
    }
    inParkOnboardingRef.current = false;
    setCompletedSequences(newCompleted);
    persistCompleted(newCompleted);
    setIsActive(false);
    setCurrentSequence(null);
    setCurrentSteps([]);
    setCurrentIndex(0);
    setSpotlightTarget(null);
  }, [currentSequence, completedSequences, persistCompleted]);

  // Check if a sequence has been completed
  const hasCompleted = useCallback((sequence: TutorialSequence): boolean => {
    return completedSequences.has(sequence);
  }, [completedSequences]);

  // Register a ref for spotlight targeting
  const registerRef = useCallback((key: string, ref: any) => {
    refs.current.set(key, ref);
  }, []);

  // Reset all tutorial progress
  const resetAll = useCallback(async () => {
    existingPlayerChecked.current = playerId;
    firstPlayRef.current = false; firstPlayOrigin.current = null; setFirstPlayOpen(false);
    inParkOnboardingRef.current = false;
    setCompletedSequences(new Set());
    const key = tutorialKey(playerId);
    if (!firstPlayPreview && key) await AsyncStorage.removeItem(key);
    setIsActive(false);
    setCurrentSequence(null);
    setCurrentSteps([]);
    setCurrentIndex(0);
    setSpotlightTarget(null);
  }, [firstPlayPreview, playerId]);

  const currentStep = isActive && currentSteps.length > 0 ? currentSteps[currentIndex] : null;

  // Step transitions and late measurements cannot revive a closed guide.
  useEffect(() => {
    if (!currentStep || firstPlayOpen) return;
    let current = true;
    const timer = setTimeout(() => {
      if (!current) return;
      resolveSpotlight(currentStep, () => current);
      currentStep.onShow?.();
    }, currentStep.delay ?? 100);
    return () => { current = false; clearTimeout(timer); };
  }, [currentStep, firstPlayOpen, resolveSpotlight]);


  const startFirstPlay = () => {
    if (!isActive || currentStep?.activity !== 'memory_warmup' || firstPlayRef.current) return;
    firstPlayRef.current = true;
    firstPlayOrigin.current = `${currentSequence}:${currentIndex}`;
    setFirstPlayStarting(true);
    // Two frames: the pulsing button paints first, then the warm-up mounts.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!firstPlayRef.current) return;
      firstPlayAttemptRef.current += 1; setFirstPlayAttempt(firstPlayAttemptRef.current);
      setFirstPlayOpen(true);
      setFirstPlayStarting(false);
    }));
  };
  const finishFirstPlay = (won: boolean, attempt: number) => {
    if (!firstPlayRef.current || attempt !== firstPlayAttemptRef.current) return;
    const origin = firstPlayOrigin.current;
    firstPlayRef.current = false; firstPlayOrigin.current = null; setFirstPlayOpen(false);
    if (won && origin === `${currentSequence}:${currentIndex}`) nextStep();
  };
  useEffect(() => () => { firstPlayRef.current = false; firstPlayOrigin.current = null; }, []);

  const contextValue: TutorialContextType = {
    isReady: loaded,
    isActive,
    currentStep,
    currentIndex,
    totalSteps: currentSteps.length,
    startTutorial,
    findLanded,
    nextStep,
    skipTutorial,
    hasCompleted,
    registerRef,
    resetAll,
  };

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}

      {/* Tutorial Overlay: renders above everything */}
      {isActive && currentStep && !firstPlayOpen && (
        <>
          <SpotlightOverlay
            target={spotlightTarget}
            opacity={0.55}
            onPress={currentStep.activity || currentStep.waitsForFind ? undefined : nextStep}
            onSpotlightPress={currentStep.interactive ? nextStep : undefined}
            spotlightTappable={currentStep.interactive}
          />
          <TeacherShark
            title={currentStep.title}
            text={currentStep.text}
            subtitle={currentStep.subtitle}
            picture={currentStep.picture}
            beside={currentStep.beside}
            mood={currentStep.sharkMood}
            position={currentStep.sharkPosition}
            nextText={currentStep.nextText}
            showSkip={currentStep.showSkip}
            showNext={!currentStep.interactive && !currentStep.waitsForFind}
            stepIndex={currentIndex}
            totalSteps={currentSteps.length}
            onNext={currentStep.activity ? startFirstPlay : nextStep}
            nextLoading={firstPlayStarting}
            onSkip={skipTutorial}
            bottomOffset={teacherBottomOffset(currentStep, spotlightTarget, Dimensions.get('window').height,
              // Map guides stand Finn above the MAP compass, never on it.
              MAP_SEQUENCES.has(currentSequence as TutorialSequence) ? 120 : 20)}
          />
        </>
      )}
      {firstPlayOpen && <MemoryGame key={firstPlayAttempt} visible difficulty={0} deckId="park" taskName="Finn’s free warm-up"
        onClose={() => finishFirstPlay(false, firstPlayAttempt)} onComplete={() => finishFirstPlay(true, firstPlayAttempt)} />}
    </TutorialContext.Provider>
  );
}
