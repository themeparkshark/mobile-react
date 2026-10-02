/**
 * TriviaGame: the LinePlay "Line Trivia" entry point, kept for its public API.
 * It now plays Trivia Duel (Trivia+ merged with Shark Showdown) as a Queue
 * Duel vs Captain Fin, built from the source's ride/park/chapter context.
 * A task-mode source (server-validated single question) still maps to the
 * ride challenge format; ride challenges should mount TriviaDuel directly.
 */
import React from 'react';
import { TriviaDuel } from '../trivia-duel';
import type { TriviaSource } from './types';

interface TriviaGameProps {
  visible: boolean;
  source: TriviaSource;
  title?: string;
  subtitle?: string;
  seed: number;
  personalBest?: number;
  /** Kept for call-site compatibility: facts now live on Fact Cards in results. */
  readableFacts?: boolean;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

export function TriviaGame({ visible, source, title, subtitle, seed, onComplete, onClose, onQuit }: TriviaGameProps) {
  const ctx = source.context;
  return (
    <TriviaDuel
      visible={visible}
      mode={source.mode === 'task' ? 'ride' : 'queue'}
      seed={ctx?.seed ?? seed}
      title={title === 'Line Trivia' ? 'Trivia Duel' : title}
      subtitle={subtitle}
      rideId={ctx?.rideId}
      parkId={ctx?.parkId}
      chapterId={ctx?.chapterId}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    />
  );
}

export default TriviaGame;
