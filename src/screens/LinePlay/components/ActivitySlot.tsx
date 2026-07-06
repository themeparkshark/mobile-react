/**
 * ActivitySlot — renders one item from the LinePlay activity playlist.
 *
 * A 'minigame' item renders a typed PLACEHOLDER ("game loads here") — Wave 2
 * wires the real Skia games in via GameShellV2. trivia/lore/prediction items
 * render real (lightweight) interactive content sourced from the content
 * loaders. Everything is one-thumb and portrait.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  colors,
  spacing,
  borderRadius,
  shadows,
} from '../../../design-system';
import type { ActivityItem } from '../../../services/lineplay/LinePlaySession';
import {
  fetchRideLore,
  fetchRideTrivia,
  LoreCard,
  PredictionCard,
  TriviaQuestion,
} from '../../../services/lineplay/content';

export interface ActivitySlotProps {
  readonly item: ActivityItem;
  readonly rideId?: number;
  readonly parkId?: number;
  /** Called when a minigame slot's "Play" is pressed (Wave 2 mounts the game). */
  readonly onPlayGame: (item: Extract<ActivityItem, { kind: 'minigame' }>) => void;
  /** Called when a prediction is locked in. */
  readonly onPredict: (card: PredictionCard, guess: 'beat' | 'miss') => void;
}

const GAME_LABELS: Record<string, string> = {
  tap: 'Whack-a-Shark',
  timing: 'Rhythm Tap',
  memory: 'Memory Match+',
  trivia: 'Ride Trivia',
  shark: 'Sharky Swim',
  banana: 'Banana Basket',
};

export default function ActivitySlot({
  item,
  rideId,
  parkId,
  onPlayGame,
  onPredict,
}: ActivitySlotProps) {
  switch (item.kind) {
    case 'minigame':
      return <MiniGameSlot item={item} onPlayGame={onPlayGame} />;
    case 'trivia':
      return <TriviaSlot rideId={rideId} parkId={parkId} seed={item.seed} />;
    case 'lore':
      return <LoreSlot rideId={rideId} parkId={parkId} seed={item.seed} />;
    case 'prediction':
      return <PredictionSlot card={item.card} onPredict={onPredict} />;
    default:
      return null;
  }
}

// -- minigame placeholder ----------------------------------------------------

function MiniGameSlot({
  item,
  onPlayGame,
}: {
  item: Extract<ActivityItem, { kind: 'minigame' }>;
  onPlayGame: (item: Extract<ActivityItem, { kind: 'minigame' }>) => void;
}) {
  const label = GAME_LABELS[item.gameId] ?? item.gameId;
  return (
    <View style={[styles.card, styles.gameCard]}>
      <Text style={styles.kicker}>MINI-GAME</Text>
      <Text style={styles.gameTitle}>{label}</Text>
      {/* Wave 2 mounts the real Skia game here. */}
      <View style={styles.gamePlaceholder}>
        <Text style={styles.gamePlaceholderText}>game loads here</Text>
      </View>
      <Pressable
        onPress={() => onPlayGame(item)}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
      >
        <Text style={styles.primaryBtnText}>Play</Text>
      </Pressable>
    </View>
  );
}

// -- trivia ------------------------------------------------------------------

function TriviaSlot({
  rideId,
  parkId,
  seed,
}: {
  rideId?: number;
  parkId?: number;
  seed: number;
}) {
  const [q, setQ] = useState<TriviaQuestion | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRideTrivia(rideId, parkId, seed).then((res) => {
      if (alive) setQ(res);
    });
    return () => {
      alive = false;
    };
  }, [rideId, parkId, seed]);

  if (!q) return <SkeletonCard label="TRIVIA" />;

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>RIDE TRIVIA</Text>
      <Text style={styles.question}>{q.question}</Text>
      <View style={styles.choices}>
        {q.choices.map((choice, i) => {
          const isPicked = picked === i;
          const isCorrect = i === q.correctIndex;
          const revealed = picked != null;
          const state =
            revealed && isCorrect
              ? 'correct'
              : revealed && isPicked && !isCorrect
                ? 'wrong'
                : 'default';
          return (
            <Pressable
              key={i}
              disabled={revealed}
              onPress={() => setPicked(i)}
              style={({ pressed }) => [
                styles.choice,
                state === 'correct' && styles.choiceCorrect,
                state === 'wrong' && styles.choiceWrong,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.choiceText}>{choice}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// -- lore --------------------------------------------------------------------

function LoreSlot({
  rideId,
  parkId,
  seed,
}: {
  rideId?: number;
  parkId?: number;
  seed: number;
}) {
  const [lore, setLore] = useState<LoreCard | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRideLore(rideId, parkId, seed).then((res) => {
      if (alive) setLore(res);
    });
    return () => {
      alive = false;
    };
  }, [rideId, parkId, seed]);

  if (!lore) return <SkeletonCard label="LINE LORE" />;

  return (
    <View style={[styles.card, styles.loreCard]}>
      <Text style={styles.kicker}>LINE LORE</Text>
      <Text style={styles.loreTitle}>{lore.title}</Text>
      <Text style={styles.loreBody}>{lore.body}</Text>
      {lore.source ? <Text style={styles.loreSource}>— {lore.source}</Text> : null}
    </View>
  );
}

// -- prediction --------------------------------------------------------------

function PredictionSlot({
  card,
  onPredict,
}: {
  card: PredictionCard;
  onPredict: (card: PredictionCard, guess: 'beat' | 'miss') => void;
}) {
  const [guess, setGuess] = useState<'beat' | 'miss' | null>(null);

  const lockIn = (g: 'beat' | 'miss') => {
    if (guess) return;
    setGuess(g);
    onPredict(card, g);
  };

  return (
    <View style={[styles.card, styles.predictionCard]}>
      <Text style={styles.kicker}>PREDICTION</Text>
      <Text style={styles.question}>{card.prompt}</Text>
      <View style={styles.predictRow}>
        <Pressable
          disabled={!!guess}
          onPress={() => lockIn('beat')}
          style={({ pressed }) => [
            styles.predictBtn,
            guess === 'beat' && styles.predictBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.predictBtnText}>Beat it 🏁</Text>
        </Pressable>
        <Pressable
          disabled={!!guess}
          onPress={() => lockIn('miss')}
          style={({ pressed }) => [
            styles.predictBtn,
            guess === 'miss' && styles.predictBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.predictBtnText}>Miss it 🐌</Text>
        </Pressable>
      </View>
      {guess ? (
        <Text style={styles.predictHint}>Locked in. Resolves when your session ends.</Text>
      ) : null}
    </View>
  );
}

// -- skeleton ----------------------------------------------------------------

function SkeletonCard({ label }: { label: string }) {
  return (
    <View style={[styles.card, styles.skeleton]}>
      <Text style={styles.kicker}>{label}</Text>
      <ActivityIndicator color={colors.secondary} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.md,
    minHeight: 220,
  },
  gameCard: {
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  loreCard: {
    borderWidth: 1,
    borderColor: 'rgba(254,201,14,0.35)',
  },
  predictionCard: {
    borderWidth: 1,
    borderColor: 'rgba(0,165,245,0.35)',
  },
  skeleton: {
    justifyContent: 'flex-start',
  },
  kicker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  gameTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  gamePlaceholder: {
    flex: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  gamePlaceholderText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  question: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.md,
    lineHeight: 23,
  },
  choices: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  choice: {
    backgroundColor: colors.bgLight,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  choiceCorrect: {
    backgroundColor: 'rgba(76,175,80,0.25)',
    borderWidth: 1,
    borderColor: colors.success,
  },
  choiceWrong: {
    backgroundColor: 'rgba(244,67,54,0.2)',
    borderWidth: 1,
    borderColor: colors.error,
  },
  choiceText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  loreTitle: {
    color: colors.tertiary,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  loreBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.md,
  },
  loreSource: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  predictRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  predictBtn: {
    flex: 1,
    backgroundColor: colors.bgLight,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  predictBtnActive: {
    borderColor: colors.secondary,
    backgroundColor: 'rgba(0,165,245,0.18)',
  },
  predictBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  predictHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
