/**
 * Rank the Haunt (H7, feature 2 + 8): 1 to 5 fins, then an optional Giggled,
 * Jumped or Screamed. Each fin tap lights the fins gold with a bounce and a
 * light haptic; reaction chips toggle; only Done submits. On submit a stamp
 * ("4 FINS · +25 XP", plus the fan line) shows for 1.5 s, then the card closes.
 * The fan comparison comes only from server fan data. Skippable.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FrightReaction } from '../../api/endpoints/fright';
import * as Haptics from '../../helpers/haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { COPY, fanCompare, lines, rankPrompt } from '../../services/fright/copy';
import { RANK_STAMP_MS, rankStamp, toggleReaction } from '../../services/fright/rankCard';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import { NightButton, NightCard } from './ui';
import type { RankPrompt } from './useFrightEngine';

function Fin({ n, lit, bounce }: { readonly n: number; readonly lit: boolean; readonly bounce: Animated.Value }) {
  return (
    <Animated.View style={{ transform: [{ scale: bounce }] }}>
      <View style={[styles.finWell, lit && styles.finWellLit]}>
        {lit ? <GameIcon name="fin" size={38} mono={NIGHT.candy} /> : <View style={{ opacity: 0.35 }}><GameIcon name="fin" size={38} /></View>}
      </View>
    </Animated.View>
  );
}

export default function RankCard({ prompt, onSubmit, onClose, initialScore = null, initialResult = null }: {
  readonly prompt: RankPrompt | null;
  /** Dev capture harness only: start with a score picked / a result line shown. */
  readonly initialScore?: number | null;
  readonly initialResult?: string | null;
  readonly onSubmit: (score: number, reaction: FrightReaction | null) => Promise<{ fanRank: number | null; myRank: number | null } | null>;
  readonly onClose: () => void;
}) {
  const reduced = useReducedGameMotion();
  const [score, setScore] = useState<number | null>(initialScore);
  const [reaction, setReaction] = useState<FrightReaction | null>(null);
  const [stamp, setStamp] = useState<{ big: string; line: string | null } | null>(initialResult ? { big: initialResult, line: null } : null);
  const [sending, setSending] = useState(false);
  const bounces = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;
  const stampScale = useRef(new Animated.Value(0.7)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!prompt) return null;

  const finish = () => { setScore(null); setReaction(null); setStamp(null); onClose(); };
  const pick = (n: number) => {
    setScore(n);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (reduced) return;
    bounces.slice(0, n).forEach((value, i) => {
      value.setValue(0.8);
      Animated.sequence([Animated.delay(i * 40), Animated.spring(value, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true })]).start();
    });
  };
  const send = async () => {
    if (score == null || sending) return;
    setSending(true);
    const res = await onSubmit(score, reaction).catch(() => null);
    setSending(false);
    if (!res) { finish(); return; }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setStamp({ big: rankStamp(score, prompt.xp), line: fanCompare(res.myRank, res.fanRank) });
    stampScale.setValue(reduced ? 1 : 0.7);
    if (!reduced) Animated.spring(stampScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    timer.current = setTimeout(finish, RANK_STAMP_MS);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.wrap}>
        <NightCard style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip" onPress={finish} hitSlop={10} style={styles.skip}>
            <GameIcon name="close" size={26} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">{rankPrompt(prompt.name, prompt.reSwim, prompt.key, prompt.lastScore)}</Text>
          {prompt.hint && !stamp && <Text style={styles.hint}>{prompt.hint}</Text>}
          {stamp ? (
            <Animated.View style={[styles.stampWrap, { transform: [{ scale: stampScale }, { rotate: '-3deg' }] }]}
              accessibilityLiveRegion="polite" accessible accessibilityLabel={[stamp.big, stamp.line].filter(Boolean).join('. ')}>
              <Text style={styles.stamp}>{stamp.big}</Text>
              {!!stamp.line && <Text style={styles.stampLine}>{stamp.line}</Text>}
            </Animated.View>
          ) : (
            <>
              <View style={styles.fins}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} fin${n > 1 ? 's' : ''}`}
                    accessibilityState={{ selected: score === n }} onPress={() => pick(n)} style={styles.fin} hitSlop={4}>
                    <Fin n={n} lit={score != null && n <= score} bounce={bounces[n - 1]} />
                  </Pressable>
                ))}
              </View>
              {score != null && (
                <>
                  <Text style={styles.ask}>{COPY.reaction}</Text>
                  <View style={styles.reactions}>
                    {lines.reaction_labels.map(item => {
                      const on = reaction === item.key;
                      return (
                        <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: on }}
                          accessibilityLabel={item.label} disabled={sending}
                          onPress={() => { setReaction(current => toggleReaction(current, item.key as FrightReaction)); void Haptics.selectionAsync().catch(() => undefined); }}
                          style={[styles.chip, on && styles.chipOn]}>
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <NightButton label="Done" loading={sending} onPress={() => { void send(); }} style={{ marginTop: 12 }} />
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
  hint: { fontFamily: 'Knockout', fontSize: 15, color: NIGHT.lantern, textAlign: 'center', marginTop: 6 },
  fins: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 12 },
  fin: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  finWell: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  finWellLit: { backgroundColor: 'rgba(255,201,60,0.18)' },
  ask: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.fogLight, textAlign: 'center', marginTop: 10 },
  reactions: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 2, borderColor: NIGHT.fog, paddingHorizontal: 16, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)' },
  chipOn: { backgroundColor: NIGHT.candy, borderColor: NIGHT.moon },
  chipText: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.fogLight },
  chipTextOn: { color: NIGHT.ink },
  stampWrap: { alignSelf: 'center', marginVertical: 18, borderWidth: 4, borderColor: NIGHT.candy, borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  stamp: { fontFamily: 'Shark', fontSize: 28, color: NIGHT.candy, letterSpacing: 1 },
  stampLine: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.moon, marginTop: 4, textAlign: 'center' },
});
