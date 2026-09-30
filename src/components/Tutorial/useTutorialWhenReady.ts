/**
 * Start a screen's first-visit tutorial once its content is actually on
 * screen (WS8). Replaces fixed 800ms timers, which showed Finn over a spinner
 * on slow networks and made players wait on fast ones.
 *
 *   const [ready, setReady] = useState(false);
 *   useTutorialWhenReady('friends', ready);
 */
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useTutorial } from './TutorialProvider';
import { canStartTutorial, TUTORIAL_SETTLE_MS } from './tutorialLayout';
import type { TutorialSequence } from './types';

export default function useTutorialWhenReady(sequence: TutorialSequence, contentReady: boolean) {
  const { isReady, isActive, hasCompleted, startTutorial } = useTutorial();
  const completed = hasCompleted(sequence);
  useEffect(() => {
    if (!canStartTutorial({ loaded: isReady, completed, active: isActive, contentReady })) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => startTutorial(sequence), TUTORIAL_SETTLE_MS);
    });
    return () => { task.cancel(); if (timer) clearTimeout(timer); };
  }, [sequence, isReady, completed, isActive, contentReady, startTutorial]);
}
