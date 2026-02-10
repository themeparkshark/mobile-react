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
import SpotlightOverlay from './SpotlightOverlay';
import TeacherShark from './TeacherShark';
import { AuthContext } from '../../context/AuthProvider';
// Sounds disabled temporarily — will re-enable once tutorial flow is stable
// import { SoundEffectContext } from '../../context/SoundEffectProvider';

const STORAGE_KEY = '@tps_tutorial_completed';

/** All tutorial sequences — used to auto-complete for existing players */
const ALL_SEQUENCES: TutorialSequence[] = [
  'onboarding', 'park', 'store', 'gym', 'community_center', 'friends', 'pins',
];

const defaultContext: TutorialContextType = {
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
  const [completedSequences, setCompletedSequences] = useState<Set<TutorialSequence>>(new Set());
  const [currentSequence, setCurrentSequence] = useState<TutorialSequence | null>(null);
  const [currentSteps, setCurrentSteps] = useState<TutorialStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [spotlightTarget, setSpotlightTarget] = useState<SpotlightTarget | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refs = useRef<Map<string, any>>(new Map());

  // Load completed sequences from storage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data) as string[];
          setCompletedSequences(new Set(parsed as TutorialSequence[]));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  // Auto-complete all tutorials for existing players (handles Expo Go reinstall / cache wipe)
  useEffect(() => {
    if (!loaded || !player) return;
    if (completedSequences.size > 0) return; // Already has data — not a fresh wipe

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
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(sequences)));
    } catch {}
  }, []);

  // Resolve spotlight target from ref
  const resolveSpotlight = useCallback((step: TutorialStep) => {
    if (!step.spotlightRef) {
      setSpotlightTarget(step.spotlight ?? null);
      return;
    }

    const ref = refs.current.get(step.spotlightRef);
    if (ref?.current) {
      ref.current.measureInWindow((x: number, y: number, width: number, height: number) => {
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
  const startTutorial = useCallback((sequence: TutorialSequence) => {
    // Don't start until AsyncStorage has loaded — avoids replaying on fresh load
    if (!loaded) return;
    if (completedSequences.has(sequence)) return;
    
    const steps = getStepsForSequence(sequence);
    if (steps.length === 0) return;

    setCurrentSequence(sequence);
    setCurrentSteps(steps);
    setCurrentIndex(0);
    setIsActive(true);

    // Resolve first step spotlight with delay
    const firstStep = steps[0];
    const delay = firstStep.delay ?? 0;
    setTimeout(() => {
      resolveSpotlight(firstStep);
      firstStep.onShow?.();
    }, delay);

  }, [completedSequences, resolveSpotlight]);

  // Advance to next step
  const nextStep = useCallback(() => {
    const nextIdx = currentIndex + 1;
    
    // Complete current step callback
    currentSteps[currentIndex]?.onComplete?.();

    if (nextIdx >= currentSteps.length) {
      // Tutorial complete
      const newCompleted = new Set(completedSequences);
      if (currentSequence) {
        newCompleted.add(currentSequence);
      }
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
    const step = currentSteps[nextIdx];
    
    // Small delay for transition feel
    setTimeout(() => {
      resolveSpotlight(step);
      step.onShow?.();
    }, step.delay ?? 100);

  }, [currentIndex, currentSteps, currentSequence, completedSequences, resolveSpotlight, persistCompleted]);

  // Skip the current tutorial
  const skipTutorial = useCallback(() => {
    const newCompleted = new Set(completedSequences);
    if (currentSequence) {
      newCompleted.add(currentSequence);
    }
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
    setCompletedSequences(new Set());
    await AsyncStorage.removeItem(STORAGE_KEY);
    setIsActive(false);
    setCurrentSequence(null);
    setCurrentSteps([]);
    setCurrentIndex(0);
    setSpotlightTarget(null);
  }, []);

  const currentStep = isActive && currentSteps.length > 0 ? currentSteps[currentIndex] : null;

  const contextValue: TutorialContextType = {
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
      {isActive && currentStep && (
        <>
          <SpotlightOverlay
            target={spotlightTarget}
            onPress={nextStep}
            onSpotlightPress={currentStep.interactive ? nextStep : undefined}
            spotlightTappable={currentStep.interactive}
          />
          <TeacherShark
            text={currentStep.text}
            subtitle={currentStep.subtitle}
            mood={currentStep.sharkMood}
            position={currentStep.sharkPosition}
            nextText={currentStep.nextText}
            showSkip={currentStep.showSkip}
            showNext={!currentStep.interactive}
            stepIndex={currentIndex}
            totalSteps={currentSteps.length}
            onNext={nextStep}
            onSkip={skipTutorial}
          />
        </>
      )}
    </TutorialContext.Provider>
  );
}
