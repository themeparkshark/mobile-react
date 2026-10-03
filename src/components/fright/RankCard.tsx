/**
 * Rank the Haunt (H7, feature 2 + 8): 1 to 5 fins, then an optional Giggled,
 * Jumped or Screamed. Two taps, under 3 seconds, skippable. The comparison
 * line ("You have it #2. Fans have it #1.") shows only from server fan data.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FrightReaction } from '../../api/endpoints/fright';
import { COPY, fanCompare, lines, rankPrompt } from '../../services/fright/copy';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import { NightButton, NightCard } from './ui';
import type { RankPrompt } from './useFrightEngine';

export default function RankCard({ prompt, onSubmit, onClose, initialScore = null, initialResult = null }: {
  readonly prompt: RankPrompt | null;
  /** Dev capture harness only: start with a score picked / a result line shown. */
  readonly initialScore?: number | null;
  readonly initialResult?: string | null;
  readonly onSubmit: (score: number, reaction: FrightReaction | null) => Promise<{ fanRank: number | null; myRank: number | null } | null>;
  readonly onClose: () => void;
}) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [result, setResult] = useState<string | null>(initialResult);
  const [sending, setSending] = useState(false);
  if (!prompt) return null;
  const finish = () => { setScore(null); setResult(null); onClose(); };
  const send = async (reaction: FrightReaction | null) => {
    if (score == null || sending) return;
    setSending(true);
    const res = await onSubmit(score, reaction).catch(() => null);
    setSending(false);
    const line = res ? fanCompare(res.myRank, res.fanRank) : null;
    if (!line) { finish(); return; }
    setResult(`Locked in. ${line}`);
    setTimeout(finish, 2200);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.wrap}>
        <NightCard style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip" onPress={finish} hitSlop={10} style={styles.skip}>
            <GameIcon name="close" size={26} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">{rankPrompt(prompt.name, prompt.reSwim, prompt.key, prompt.lastScore)}</Text>
          {result ? <Text style={styles.result} accessibilityLiveRegion="polite">{result}</Text> : (
            <>
              <View style={styles.fins}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} fin${n > 1 ? 's' : ''}`}
                    accessibilityState={{ selected: score === n }} onPress={() => setScore(n)} style={styles.fin} hitSlop={4}>
                    <View style={{ opacity: score != null && n <= score ? 1 : 0.35 }}><GameIcon name="fin" size={40} /></View>
                  </Pressable>
                ))}
              </View>
              {score != null && (
                <>
                  <Text style={styles.ask}>{COPY.reaction}</Text>
                  <View style={styles.reactions}>
                    {lines.reaction_labels.map(item => (
                      <NightButton key={item.key} label={item.label} variant="ghost" disabled={sending}
                        onPress={() => { void send(item.key as FrightReaction); }} />
                    ))}
                  </View>
                  <NightButton label="Done" loading={sending} onPress={() => { void send(null); }} style={{ marginTop: 10 }} />
                </>
              )}
            </>
          )}
        </NightCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', padding: 16, paddingBottom: 40, backgroundColor: NIGHT.scrim },
  card: { paddingTop: 18 },
  skip: { position: 'absolute', right: 10, top: 10, zIndex: 2 },
  title: { fontFamily: 'Shark', fontSize: 20, color: NIGHT.candy, textAlign: 'center', paddingHorizontal: 28 },
  fins: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  fin: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  ask: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.fogLight, textAlign: 'center', marginTop: 10 },
  reactions: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  result: { fontFamily: 'Knockout', fontSize: 18, color: NIGHT.moon, textAlign: 'center', marginVertical: 18 },
});
