/**
 * Start a screen's first-visit tutorial once its content is actually on
 * screen (WS8). Replaces fixed 800ms timers, which showed Finn over a spinner
 * on slow networks and made players wait on fast ones.
 *
 *   const [ready, setReady] = useState(false);
 *   useTutorialWhenReady('friends', ready);
 *
 * Waits one frame after the content is ready (so it has painted) plus a short
 * settle. It does not use InteractionManager: looping Animated backgrounds hold
 * interaction handles open, so runAfterInteractions could wait forever.
 */
import { useEffect } from 'react';
import { useTutorial } from './TutorialProvider';
import { canStartTutorial, TUTORIAL_SETTLE_MS } from './tutorialLayout';
import type { TutorialSequence } from './types';

export default function useTutorialWhenReady(sequence: TutorialSequence, contentReady: boolean) {
  const { isReady, isActive, hasCompleted, startTutorial } = useTutorial();
  const completed = hasCompleted(sequence);
  useEffect(() => {
    if (!canStartTutorial({ loaded: isReady, completed, active: isActive, contentReady })) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => startTutorial(sequence), TUTORIAL_SETTLE_MS);
    });
    return () => { cancelAnimationFrame(frame); if (timer) clearTimeout(timer); };
  }, [sequence, isReady, completed, isActive, contentReady, startTutorial]);
}
