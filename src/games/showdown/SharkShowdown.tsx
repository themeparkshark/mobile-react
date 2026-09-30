/**
 * Shark Showdown now plays Trivia Duel vs Captain Fin (the two games merged,
 * design studio/design/trivia.md). The component and its props stay so the
 * LinePlay call sites keep working; logic.ts keeps the replay seed helper.
 */
import React from 'react';
import { TriviaDuel } from '../trivia-duel';

interface Props {
  visible: boolean;
  seed: number;
  rideId?: number;
  parkId?: number;
  chapterId?: string;
  rideName?: string;
  onClose: () => void;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
}

export default function SharkShowdown({ visible, seed, rideId, parkId, chapterId, rideName, onClose, onComplete }: Props) {
  return (
    <TriviaDuel
      visible={visible}
      mode="queue"
      seed={seed}
      rideId={rideId}
      parkId={parkId}
      chapterId={chapterId}
      rideName={rideName}
      title="Trivia Duel"
      onClose={onClose}
      onComplete={onComplete}
    />
  );
}
