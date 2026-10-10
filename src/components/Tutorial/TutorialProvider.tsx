/**
 * TutorialProvider — Context provider that manages tutorial state
 * 
 * Tracks which tutorials have been completed (persisted to AsyncStorage),
 * manages the current tutorial sequence, and provides methods to
 * start/advance/skip tutorials.
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TutorialContextType, TutorialSequence, TutorialStep, SpotlightTarget } from './types';
import { getStepsForSequence } from './steps';
import { teacherBottomOffset } from './tutorialLayout';
import { Dimensions } from 'react-native';
import SpotlightOverlay from './SpotlightOverlay';
import TeacherShark from './TeacherShark';
import MemoryGame from '../../games/memory/MemoryGame';
import { AuthContext } from '../../context/AuthProvider';
// Sounds disabled temporarily — will re-enable once tutorial flow is stable
// import { SoundEffectContext } from '../../context/SoundEffectProvider';

const STORAGE_KEY = '@tps_tutorial_completed';

/** All tutorial sequences — used to auto-complete for existing players */
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
  const firstPlayOrigin = useRef<string | null>(null);
  const [completedSequences, setCompletedSequences] = useState<Set<TutorialSequence>>(new Set());
  const [currentSequence, setCurrentSequence] = useState<TutorialSequence | null>(null);
  const [currentSteps, setCurrentSteps] = useState<TutorialStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [spotlightTarget, setSpotlightTarget] = useState<SpotlightTarget | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refs = useRef<Map<string, any>>(new Map());
  const inParkOnboardingRef = useRef(false);

  // Load completed sequences from storage
  useEffect(() => {
    if (firstPlayPreview) { setLoaded(true); return; }
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data) as string[];
          const completed = new Set(parsed as TutorialSequence[]);
          // Players who already saw the park guide should not get a second
          // arrival tutorial after this sequence is added to older installs.
          if (completed.has('park')) completed.add('park_arrival');
          setCompletedSequences(completed);
        } catch {}
      }
      setLoaded(true);
    }).catch(() => setLoaded(true)); // An unreadable store still lets tutorials run.
  }, []);

  // Auto-complete all tutorials for existing players (handles a reinstall or cache wipe).
  // Checked once per install load: after "Replay Tutorials" the empty set is on purpose.
  const existingPlayerChecked = useRef(false);
  useEffect(() => {
    if (!loaded || !player || firstPlayPreview) return;
    if (existingPlayerChecked.current) return;
    existingPlayerChecked.current = true;
    if (completedSequences.size > 0) return; // Already has data, not a fresh wipe

    const isExistingPlayer =
      (player.completed_tasks_count ?? 0) > 0 ||
      (player.total_experience ?? 0) > 50 ||
      (player.friends_count ?? 0) > 0;

    if (isExistingPlayer) {
      const allDone = new Set<TutorialSequence>(ALL_SEQUENCES);
      setCompletedSequences(allDone);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ALL_SEQUENCES)).catch(() => {});
    }
  }, [loaded, player]);

  // Persist completed sequences
  const persistCompleted = useCallback(async (sequences: Set<TutorialSequence>) => {
    if (firstPlayPreview) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(sequences)));
    } catch {}
  }, [firstPlayPreview]);

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
      // Ref not found — skip spotlight
      setSpotlightTarget(null);
    }
  }, []);

  // Start a tutorial sequence
  const startTutorial = useCallback((sequence: TutorialSequence, options?: { inPark?: boolean }) => {
    // Don't start until AsyncStorage has loaded — avoids replaying on fresh load
    if (!loaded) return;
    if (completedSequences.has(sequence)) return;
    
    if (isActive) return;
    const steps = getStepsForSequence(sequence, options);
    if (steps.length === 0) return;

    inParkOnboardingRef.current = sequence === 'onboarding' && !!options?.inPark;
    setCurrentSequence(sequence);
    setCurrentSteps(steps);
    setCurrentIndex(0);
    setIsActive(true);

  }, [loaded, isActive, completedSequences]);

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
    existingPlayerChecked.current = true;
    firstPlayRef.current = false; firstPlayOrigin.current = null; setFirstPlayOpen(false);
    inParkOnboardingRef.current = false;
    setCompletedSequences(new Set());
    if (!firstPlayPreview) await AsyncStorage.removeItem(STORAGE_KEY);
    setIsActive(false);
    setCurrentSequence(null);
    setCurrentSteps([]);
    setCurrentIndex(0);
    setSpotlightTarget(null);
  }, [firstPlayPreview]);

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
    firstPlayAttemptRef.current += 1; setFirstPlayAttempt(firstPlayAttemptRef.current);
    firstPlayOrigin.current = `${currentSequence}:${currentIndex}`;
    setFirstPlayOpen(true);
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
    nextStep,
    skipTutorial,
    hasCompleted,
    registerRef,
    resetAll,
  };

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}

      {/* Tutorial Overlay — renders above everything */}
      {isActive && currentStep && !firstPlayOpen && (
        <>
          <SpotlightOverlay
            target={spotlightTarget}
            opacity={0.55}
            onPress={currentStep.activity ? undefined : nextStep}
            onSpotlightPress={currentStep.interactive ? nextStep : undefined}
            spotlightTappable={currentStep.interactive}
          />
          <TeacherShark
            title={currentStep.title}
            text={currentStep.text}
            subtitle={currentStep.subtitle}
            mood={currentStep.sharkMood}
            position={currentStep.sharkPosition}
            nextText={currentStep.nextText}
            showSkip={currentStep.showSkip}
            showNext={!currentStep.interactive}
            stepIndex={currentIndex}
            totalSteps={currentSteps.length}
            onNext={currentStep.activity ? startFirstPlay : nextStep}
            onSkip={skipTutorial}
            bottomOffset={teacherBottomOffset(currentStep, spotlightTarget, Dimensions.get('window').height,
              currentSequence === 'park_arrival' || inParkOnboardingRef.current ? 120 : 20)}
          />
        </>
      )}
      {firstPlayOpen && <MemoryGame key={firstPlayAttempt} visible difficulty={0} deckId="park" taskName="Finn’s free warm-up"
        onClose={() => finishFirstPlay(false, firstPlayAttempt)} onComplete={() => finishFirstPlay(true, firstPlayAttempt)} />}
    </TutorialContext.Provider>
  );
}
